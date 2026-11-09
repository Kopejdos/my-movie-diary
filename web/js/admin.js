// Logika admin panelu: univerza a jejich filmy (přímo přes Supabase – pravidla RLS
// pustí jen správce) a akce přes Edge Function "admin" (TMDB, uživatelé).
// Čistá logika – nic nevykresluje.

import { supabase } from "./supabase.js";
import { clearDataCache } from "./cache.js";
import { callFunction } from "./db.js";

function check({ data, error }) {
    if (error) throw new Error(error.message);
    // Admin mění katalog → mezipaměť webu by byla zastaralá (V2.1)
    clearDataCache();
    return data;
}

// ---------------------------------------------------------------------
// Edge Function "admin"
// ---------------------------------------------------------------------

/** Zavolá akci funkce admin s přístupovým tokenem přihlášeného uživatele. */
const callAdmin = (action, payload = {}) => callFunction("admin", action, payload);

export const searchTmdb = (query) => callAdmin("search", { query });
export const listUsers = () => callAdmin("users");
export const setUserAdmin = (userId, isAdmin) => callAdmin("set-admin", { user_id: userId, is_admin: isAdmin });
export const deleteUser = (userId) => callAdmin("delete-user", { user_id: userId });
export const resetUsername = (userId) => callAdmin("reset-username", { user_id: userId });

// Požadavky na filmy (V3.5.1)
/** Nevyřízené požadavky s návrhem kolekcí: { requests: [...], universes: [...] }. */
export const listFilmRequests = () => callAdmin("requests");
/**
 * Rozhodnutí: items = [{ id, approve, universe_id? }]. Přijatý film se uloží do films (a do kolekce).
 * Mění katalog → vyčistí mezipaměť webu.
 */
export async function decideFilmRequests(items) {
    const result = await callAdmin("request-decide", { items });
    clearDataCache();
    return result;
}

/**
 * Nová oficiální kolekce ze série TMDB (V3.5.2). tmdbIds = jen tyto díly (požadavek na kolekci),
 * prázdné = celá série; also = ID kolekcí studií, kam díly přidat taky (V3.5.2.1).
 * Vrací { slug, name, films, requests_added, also, seed } – seed jen pro kontrolu (do souboru ho dopíše sync-seed).
 */
export async function createCollectionFromSeries(tmdbCollectionId, name, tmdbIds = [], also = []) {
    const result = await callAdmin("request-create-collection", { tmdb_collection_id: tmdbCollectionId, name, tmdb_ids: tmdbIds, also });
    clearDataCache();
    return result;
}

// ---------------------------------------------------------------------
// Hlídání nových dílů sérií (V3.5.2.3)
// ---------------------------------------------------------------------

/**
 * Čekající nové díly sérií. Když od poslední kontroly uběhl den, funkce admin nejdřív
 * zkontroluje série v TMDB (trvá pár sekund). force = zkontrolovat hned.
 * Vrací { checked_at, series, collections, found, dates_updated, backfill_left, ran, updates }.
 */
export async function fetchSeriesUpdates(force = false) {
    const result = await callAdmin(force ? "series-check" : "series-updates", {});
    if (result.ran && result.dates_updated > 0) clearDataCache();      // posunuté premiéry
    return result;
}

/** Přidat nalezený díl do kolekce (also = ID kolekcí studií), nebo zahodit. */
export async function decideSeriesUpdate(id, add, also = []) {
    const result = await callAdmin("series-decide", { id, add, also });
    if (add) clearDataCache();
    return result;
}

/** Zahodit všechny čekající díly. */
export async function dismissAllSeriesUpdates() {
    return await callAdmin("series-dismiss-all", {});
}

// ---------------------------------------------------------------------
// Zakázaná slova v nickách (V2.3)
// ---------------------------------------------------------------------

/** Seznam zakázaných slov (jen pro správce – pravidla RLS). */
export async function listBlockedWords() {
    return await supabase
        .from("blocked_words")
        .select("id, word, match_mode, created_at")
        .order("word")
        .then(check);
}

/** Přidá slovo; word = malá písmena a číslice, mode = "contains" | "exact". */
export async function addBlockedWord(word, mode) {
    await supabase.from("blocked_words").insert({ word, match_mode: mode }).then(check);
}

export async function removeBlockedWord(id) {
    await supabase.from("blocked_words").delete().eq("id", id).then(check);
}

// ---------------------------------------------------------------------
// Univerza
// ---------------------------------------------------------------------

/** Všechna univerza pro správu, s počtem filmů. */
export async function listUniversesForAdmin() {
    return await supabase
        .from("universes")
        .select("id, slug, name, description, color, kind, sort_order, items:universe_items(count), categories(name)")
        .order("sort_order")
        .then(check);
}

/** Adresa univerza z názvu: "Star Wars: Saga" → "star-wars-saga". */
export function slugify(text) {
    return text
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

export async function createUniverse({ name, slug, description, color }) {
    const last = await supabase
        .from("universes").select("sort_order").order("sort_order", { ascending: false }).limit(1)
        .then(check);
    const sortOrder = (last[0]?.sort_order ?? 0) + 10;
    return await supabase
        .from("universes")
        .insert({ name, slug, description: description || null, color: color || null, sort_order: sortOrder })
        .select("id, slug")
        .single()
        .then(check);
}

export async function updateUniverse(id, fields) {
    await supabase.from("universes").update(fields).eq("id", id).then(check);
}

export async function deleteUniverse(id) {
    await supabase.from("universes").delete().eq("id", id).then(check);
}

/** Prohodí pořadí dvou univerz (posun nahoru / dolů na přehledu). */
export async function swapUniverseOrder(a, b) {
    await Promise.all([
        supabase.from("universes").update({ sort_order: b.sort_order }).eq("id", a.id).then(check),
        supabase.from("universes").update({ sort_order: a.sort_order }).eq("id", b.id).then(check),
    ]);
}

// ---------------------------------------------------------------------
// Filmy v univerzu
// ---------------------------------------------------------------------

/**
 * Přidá film do univerza (V3.5.2.1): funkce admin uloží detail z TMDB a zařadí film podle data
 * premiéry (u cesty na konec). Vrací film (title, release_date, status…).
 * Do seedu ho pak dopíše scripts/sync-seed.sh – import ho nesmaže.
 */
export async function addUniverseItem(universeId, tmdbId, { group = null, optional = false } = {}) {
    return await callAdmin("add-item", { universe_id: universeId, tmdb_id: tmdbId, group: group || null, optional });
}

export async function updateUniverseItem(id, fields) {
    await supabase.from("universe_items").update(fields).eq("id", id).then(check);
}

export async function removeUniverseItem(id) {
    await supabase.from("universe_items").delete().eq("id", id).then(check);
}

/** Prohodí pořadí vydání dvou filmů v univerzu. */
export async function swapItemOrder(a, b) {
    await Promise.all([
        supabase.from("universe_items").update({ release_order: b.release_order }).eq("id", a.id).then(check),
        supabase.from("universe_items").update({ release_order: a.release_order }).eq("id", b.id).then(check),
    ]);
}

/** Nahradí kategorie kolekce (smaže stávající přiřazení a vloží nová). */
export async function setUniverseCategories(universeId, categoryIds) {
    await supabase.from("universe_categories").delete().eq("universe_id", universeId).then(check);
    if (categoryIds.length > 0) {
        await supabase.from("universe_categories")
            .insert(categoryIds.map((categoryId) => ({ universe_id: universeId, category_id: categoryId })))
            .then(check);
    }
}

/** Nastaví film jako obal univerza (plakát na kartě, záběr v banneru). */
export async function setUniverseCover(universeId, tmdbId) {
    await updateUniverse(universeId, { cover_tmdb_id: tmdbId });
}

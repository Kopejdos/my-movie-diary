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
/** Uloží film do katalogu (detail a překlady z TMDB) – před uložením kolekce s novým filmem (V4.3.1). */
export const addFilmToCatalog = (tmdbId) => callAdmin("add-film", { tmdb_id: tmdbId });
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
// Stavitel kolekcí (V4.3.2) – kandidáti z osoby, dvou osob, studia nebo klíčového slova TMDB
// ---------------------------------------------------------------------

export const searchPeople = (query) => callAdmin("people-search", { query });
/** Filmografie osoby (nebo dvou osob – průnik pozná web z rolí a / b). */
export const fetchPersonFilms = (personId, secondPersonId = null) =>
    callAdmin("person-films", { person_id: personId, second_person_id: secondPersonId });
export const searchCompanies = (query) => callAdmin("company-search", { query });
export const searchKeywords = (query) => callAdmin("keyword-search", { query });
/** Filmy studia / klíčového slova: { company_id | keyword_id, sort, pages } → { total, films }. */
export const discoverFilms = (options) => callAdmin("discover-films", options);

/** Další cíl katalogu (V4.3.2): 2 000 filmů, potom po 500 (2 500, 3 000…). */
export function nextGoal(count) {
    return count < 2000 ? 2000 : (Math.floor(count / 500) + 1) * 500;
}

/** Počet filmů v katalogu (tabulka films) – ukazatel cíle v admin panelu (V4.3.2). */
export async function countCatalogFilms() {
    const { count, error } = await supabase.from("films").select("tmdb_id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
}

/**
 * Nová kolekce z editoru (V4.3.1) – schválení požadavku na kolekci (série TMDB i vlastní):
 * { name, description?, tmdb_collection_id?, items: [{ tmdb_id, group_label, franchise, label,
 * story_order, is_optional }], also?, reject_ids? }. Vrací { slug, name, films, also, seed }.
 */
export async function createCollection(payload) {
    const result = await callAdmin("create-collection", payload);
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
 * Uloží všechny změny kolekce najednou (V4.3.1, databázová funkce admin_save_collection – jedna
 * transakce): universe = změněné údaje ({ name, description, color, kind, cover_tmdb_id }) nebo null,
 * categories = ID kategorií nebo null, items = všechny filmy v novém pořadí (nové bez id – musí být
 * v katalogu, viz addFilmToCatalog), removed = ID odebraných položek.
 */
export async function saveCollection(universeId, { universe, categories, items, removed }) {
    return await supabase.rpc("admin_save_collection", {
        p_universe_id: universeId,
        p_universe: universe,
        p_categories: categories,
        p_items: items,
        p_removed: removed,
    }).then(check);
}

// ---------------------------------------------------------------------
// Překlady kolekcí (V4.3.4, záložka Translations)
// ---------------------------------------------------------------------

/** Výsledek dotazu bez mazání mezipaměti (jen čtení). */
function read({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Data pro záložku Translations: kolekce, opravy z databáze a výchozí překlady ze souborů
 * catalog.<jazyk>.json (soubor, který chybí, = žádné překlady).
 */
export async function fetchTranslationData(langs) {
    const [universes, rows, files] = await Promise.all([
        supabase.from("universes").select("id, slug, name, description, kind, sort_order").order("sort_order").then(read),
        supabase.from("universe_translations").select("universe_id, lang, name, description, source, updated_at").then(read),
        Promise.all(langs.map((lang) => fetch(new URL(`./i18n/catalog.${lang}.json`, import.meta.url), { cache: "no-cache" })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null))),
    ]);
    return { universes, rows, files: Object.fromEntries(langs.map((lang, i) => [lang, files[i] ?? { collections: {} }])) };
}

/** Uloží opravu názvu / popisu kolekce v jazyce (source "manual" = od správce, "tmdb" = převzatý z TMDB). */
export async function saveCollectionTranslation(universeId, lang, { name, description, source }) {
    return await supabase.from("universe_translations")
        .upsert({ universe_id: universeId, lang, name, description, source, updated_at: new Date().toISOString() },
            { onConflict: "universe_id,lang" })
        .select("universe_id, lang, name, description, source, updated_at")
        .single()
        .then(check);
}

/** Smaže opravu – web zase vezme překlad ze souboru (nebo angličtinu). */
export async function deleteCollectionTranslation(universeId, lang) {
    await supabase.from("universe_translations").delete().eq("universe_id", universeId).eq("lang", lang).then(check);
}

/** Návrhy názvů sérií z TMDB (Edge Function admin, collection-names) – všechny série nebo vybrané. */
export const checkCollectionNames = (universeIds = []) => callAdmin("collection-names", { universe_ids: universeIds });

/** Více oprav najednou (převzetí návrhů z TMDB) – [{ universe_id, lang, name, description, source }]. */
export async function saveCollectionTranslations(rows) {
    if (rows.length === 0) return [];
    const now = new Date().toISOString();
    return await supabase.from("universe_translations")
        .upsert(rows.map((row) => ({ ...row, updated_at: now })), { onConflict: "universe_id,lang" })
        .select("universe_id, lang, name, description, source, updated_at")
        .then(check);
}

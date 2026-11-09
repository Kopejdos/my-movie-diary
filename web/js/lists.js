// Vlastní seznamy (V3.5.3) – logika, nic nevykresluje.
// Seznam si složí každý přihlášený z filmů, které už jsou v databázi. Čtení a zápis
// jdou přímo přes Supabase – kdo smí co vidět a měnit, hlídají pravidla RLS v databázi
// (viditelnost private / friends / public, zakázaná slova, limity).

import { supabase } from "./supabase.js";
import { isUpcoming } from "./data.js";
import { cached, invalidate } from "./cache.js";
import { TEXTS, format } from "./texts.js";

export const MAX_LISTS = 50;
export const MAX_LIST_ITEMS = 300;
export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 500;
export const MAX_LIST_CATEGORIES = 3;
export const VISIBILITIES = ["private", "friends", "public"];

/** Chyba se srozumitelným kódem (podle něj web ukáže text). */
export class ListError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

/** Výsledek dotazu → data, nebo chyba s kódem z databáze (list_limit, list_text_not_allowed…). */
function check({ data, error }) {
    if (error) {
        const code = ["list_text_not_allowed", "list_limit", "list_items_limit", "list_categories_limit"]
            .find((c) => error.message?.includes(c)) ?? (error.code === "23505" ? "duplicate" : null);
        throw new ListError(error.message, code);
    }
    return data;
}

/** Seznamy uživatele, které smím vidět (u sebe všechny), od naposledy upraveného. */
export async function fetchUserLists(username) {
    return check(await supabase.rpc("user_lists", { p_username: username })) ?? [];
}

/** Moje seznamy s příznakem, jestli v nich už film je (tlačítko „+ List“). */
export async function fetchListsForFilm(tmdbId) {
    return check(await supabase.rpc("my_lists_for_film", { p_tmdb_id: tmdbId })) ?? [];
}

/**
 * Seznam k zobrazení, nebo null (neexistuje / nesmím ho vidět).
 * Vrací údaje seznamu (autor, viditelnost, kategorie…) a filmy v pořadí: items = vydané,
 * upcoming = chystané (bez data nebo s datem v budoucnu) – stejně jako u kolekcí.
 */
export async function fetchList(id) {
    const info = check(await supabase.rpc("list_info", { p_list_id: id }));
    if (!info) return null;
    const rows = check(await supabase
        .from("list_items")
        .select("tmdb_id, position, note, added_at, film:films(tmdb_id, title, original_title, release_date, runtime, poster_path, backdrop_path)")
        .eq("list_id", id)
        .order("position")) ?? [];
    const entries = rows.filter((row) => row.film).map((row) => ({
        film: row.film,
        position: row.position,
        note: row.note,
        // film bez data premiéry bereme jako chystaný (seznam nemá příznak z importu)
        is_upcoming: !row.film.release_date,
    }));
    return {
        ...info,
        entries,
        items: entries.filter((e) => !isUpcoming(e)),
        upcoming: entries.filter((e) => isUpcoming(e)),
    };
}

/** Nový seznam; vrací jeho id. */
export async function createList({ title, description = null, visibility = "private" }) {
    const row = check(await supabase
        .from("lists")
        .insert({ title: title.trim(), description: description?.trim() || null, visibility })
        .select("id")
        .single());
    return row.id;
}

/** Úprava názvu, popisu a viditelnosti. */
export async function updateList(id, { title, description, visibility }) {
    check(await supabase.from("lists")
        .update({ title: title.trim(), description: description?.trim() || null, visibility })
        .eq("id", id));
}

export async function deleteList(id) {
    check(await supabase.from("lists").delete().eq("id", id));
}

/** Kategorie seznamu (nejvýš 3) – nahradí dosavadní. */
export async function setListCategories(id, categoryIds) {
    check(await supabase.from("list_categories").delete().eq("list_id", id));
    const ids = [...new Set(categoryIds)].slice(0, MAX_LIST_CATEGORIES);
    if (ids.length > 0) {
        check(await supabase.from("list_categories").insert(ids.map((category_id) => ({ list_id: id, category_id }))));
    }
}

/** Film na konec seznamu (pořadí dopočítá databáze). */
export async function addToList(listId, tmdbId) {
    check(await supabase.from("list_items").insert({ list_id: listId, tmdb_id: tmdbId }));
}

export async function removeFromList(listId, tmdbId) {
    check(await supabase.from("list_items").delete().eq("list_id", listId).eq("tmdb_id", tmdbId));
}

/** Prohodí dva filmy v pořadí seznamu (šipky ↑ ↓). */
export async function swapListItems(listId, a, b) {
    check(await supabase.from("list_items").update({ position: b.position }).eq("list_id", listId).eq("tmdb_id", a.film.tmdb_id));
    check(await supabase.from("list_items").update({ position: a.position }).eq("list_id", listId).eq("tmdb_id", b.film.tmdb_id));
}

// ---------------------------------------------------------------------
// Komunita (V3.5.4)
// ---------------------------------------------------------------------

export const REPORT_REASONS = ["offensive", "spam", "spoilers", "other"];

/**
 * Veřejné seznamy komunity (aspoň 3 filmy, neskryté) od nejvíc zobrazených – přehled a hledání.
 * Mezipaměť na minutu; chyba (stará databáze bez funkce) = žádné seznamy.
 */
export function fetchCommunityLists() {
    return cached("community-lists", async () => {
        const { data, error } = await supabase.rpc("community_lists", { p_limit: 200 });
        if (error) return [];
        return data ?? [];
    }, 60_000).catch(() => []);
}

/** Nahlásit seznam (důvod + nepovinná poznámka). Opakované nahlášení = kód "duplicate". */
export async function reportList(listId, reason, note = null) {
    check(await supabase.from("list_reports").insert({ list_id: listId, reason, note: note?.trim() || null }));
}

/** Správce: nahlášené a skryté seznamy. */
export async function fetchReportedLists() {
    return check(await supabase.rpc("admin_reported_lists")) ?? [];
}

/** Správce: skrýt (hide = true) / zobrazit seznam; otevřená nahlášení se uzavřou. */
export async function moderateList(listId, hide) {
    check(await supabase.rpc("admin_moderate_list", { p_list_id: listId, p_hide: hide }));
    invalidate("community-lists");
}

/** Náhodné ID prohlížeče pro počítadlo zobrazení nepřihlášených (jednou za den). */
function anonymousId() {
    try {
        let id = localStorage.getItem("mmd-viewer");
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem("mmd-viewer", id);
        }
        return id;
    } catch {
        return null;            // bez úložiště se nepřihlášený nezapočítá
    }
}

/** Započítá zobrazení seznamu (autor ani opakované zobrazení se nepočítají); vrací počet. */
export async function registerListView(id) {
    const { data } = await supabase.rpc("register_list_view", { p_list_id: id, p_anon_id: anonymousId() });
    return typeof data === "number" ? data : null;
}

/** Srozumitelná hláška k chybě seznamu (zakázané slovo, limity…). */
export function listErrorText(error) {
    const code = error instanceof ListError ? error.code : null;
    return {
        list_text_not_allowed: TEXTS.listErrorWords,
        list_limit: format("listErrorLimit", MAX_LISTS),
        list_items_limit: format("listErrorItems", MAX_LIST_ITEMS),
        list_categories_limit: TEXTS.listErrorCategories,
        duplicate: TEXTS.listErrorDuplicate,
    }[code] ?? format("errorGeneric", error.message);
}

/** Ikona viditelnosti seznamu. */
export function visibilityIcon(visibility) {
    return { private: "🔒", friends: "👥", public: "🌍" }[visibility] ?? "";
}

/** Ikona + název viditelnosti („🔒 Private“). */
export function visibilityLabel(visibility) {
    return `${visibilityIcon(visibility)} ${TEXTS[`listVisibility_${visibility}`] ?? visibility}`;
}

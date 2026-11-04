// Práce s daty: univerza, filmy, zhlédnutí.
// Čistá logika – vrací data, nic nevykresluje.

import { supabase } from "./supabase.js";

/** Převede chybu Supabase na běžnou výjimku. */
function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Všechna univerza seřazená pro hlavní obrazovku, včetně obalu a postupu.
 * Nepřihlášený uživatel dostane watchedCount = 0.
 */
export async function fetchUniverses() {
    const [universes, progress] = await Promise.all([
        supabase
            .from("universes")
            .select("id, slug, name, description, sort_order, cover:films(title, poster_path)")
            .order("sort_order")
            .then(check),
        supabase
            .from("universe_progress")
            .select("universe_id, total_count, watched_count")
            .then(check),
    ]);

    const progressById = new Map(progress.map((p) => [p.universe_id, p]));
    return universes.map((universe) => {
        const p = progressById.get(universe.id);
        return {
            ...universe,
            totalCount: p?.total_count ?? 0,
            watchedCount: p?.watched_count ?? 0,
        };
    });
}

/** Jedno univerzum podle adresy (slug) včetně filmů v pořadí vydání, nebo null. */
export async function fetchUniverse(slug) {
    const universe = await supabase
        .from("universes")
        .select("id, slug, name, description")
        .eq("slug", slug)
        .maybeSingle()
        .then(check);
    if (!universe) return null;

    const items = await supabase
        .from("universe_items")
        .select(`
            release_order, story_order, group_label, is_optional,
            film:films(tmdb_id, title, original_title, release_date, runtime, poster_path)
        `)
        .eq("universe_id", universe.id)
        .order("release_order")
        .then(check);

    return { ...universe, items };
}

/**
 * Počty zhlédnutí přihlášeného uživatele: Map tmdb_id → { count, lastWatchedOn }.
 * Nepřihlášený uživatel dostane prázdnou mapu.
 */
export async function fetchMyFilmCounts(signedIn) {
    if (!signedIn) return new Map();
    const rows = await supabase
        .from("my_film_counts")
        .select("tmdb_id, watch_count, last_watched_on")
        .then(check);
    return new Map(rows.map((r) => [r.tmdb_id, {
        count: r.watch_count,
        lastWatchedOn: r.last_watched_on,
    }]));
}

/**
 * Dnešní datum podle hodin uživatele ("2026-11-05").
 * Databáze běží v UTC – po půlnoci by jinak zapsala včerejšek.
 */
export function todayLocal() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** +1: zapíše nové zhlédnutí (dnes podle hodin uživatele). */
export async function addWatch(tmdbId) {
    await supabase.from("watches").insert({ tmdb_id: tmdbId, watched_on: todayLocal() }).then(check);
}

/** −1: smaže nejnovější zhlédnutí. Vrací nový počet. */
export async function removeLatestWatch(tmdbId) {
    return await supabase.rpc("remove_latest_watch", { p_tmdb_id: tmdbId }).then(check);
}

/** Postup v univerzu podle aktuálních počtů (volitelné filmy se nepočítají). */
export function computeProgress(items, counts) {
    const required = items.filter((item) => !item.is_optional);
    const watched = required.filter((item) => (counts.get(item.film.tmdb_id)?.count ?? 0) > 0);
    return { total: required.length, watched: watched.length };
}

/** Procento z postupu (0–100). */
export function percent({ total, watched }) {
    return total === 0 ? 0 : Math.round((watched / total) * 100);
}

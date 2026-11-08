// Práce s daty: univerza, filmy, zhlédnutí.
// Čistá logika – vrací data, nic nevykresluje.

import { supabase } from "./supabase.js";
import { cached, invalidate } from "./cache.js";
import { backdropUrl } from "./dom.js";

/** Převede chybu Supabase na běžnou výjimku. */
function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Načte všechny řádky po stránkách – Supabase vrací nejvýš 1000 řádků na dotaz.
 * buildQuery musí řadit podle jednoznačného sloupce, jinak by se stránky překrývaly.
 */
async function fetchAllRows(buildQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const page = await buildQuery().range(from, from + pageSize - 1).then(check);
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

/**
 * Všechna univerza seřazená pro hlavní obrazovku, včetně obalu a postupu.
 * Nepřihlášený uživatel dostane watchedCount = 0.
 */
export async function fetchUniverses() {
    // Seznam kolekcí z mezipaměti (mění se jen v adminu); postup vždy čerstvý
    const [universes, progress] = await Promise.all([
        cached("universes", () => supabase
            .from("universes")
            .select("id, slug, name, description, color, kind, sort_order, cover:films(title, poster_path, backdrop_path), universe_categories(category_id)")
            .order("sort_order")
            .then(check)),
        // Postup jen na pár sekund – sdílí ho přednačtení při startu a první vykreslení;
        // po zhlédnutí nebo přihlášení se zahodí (invalidateProgress)
        cached("progress", () => supabase
            .from("universe_progress")
            .select("universe_id, total_count, watched_count")
            .then(check), 10_000),
    ]);

    const progressById = new Map(progress.map((p) => [p.universe_id, p]));
    return universes.map((universe) => {
        const p = progressById.get(universe.id);
        return {
            ...universe,
            categoryIds: (universe.universe_categories ?? []).map((uc) => uc.category_id),
            totalCount: p?.total_count ?? 0,
            watchedCount: p?.watched_count ?? 0,
        };
    });
}

/** Všechny kategorie (sekce přehledu) v pořadí. */
export function fetchCategories() {
    return cached("categories", () => supabase
        .from("categories")
        .select("id, slug, name, color, sort_order")
        .order("sort_order")
        .then(check));
}

/**
 * Podklady pro vyhledávání a „Co dneska?“: kolekce (s postupem) a všechny filmy s tím,
 * do kterých kolekcí patří. Seznam filmů se mění zřídka – drží se v mezipaměti.
 */
export async function fetchSearchData() {
    const [universes, items, otherFilms] = await Promise.all([
        fetchUniverses(),
        cached("search-items", () => fetchAllRows(() => supabase
            .from("universe_items")
            .select("id, universe_id, release_order, is_optional, franchise, is_upcoming, film:films(tmdb_id, title, original_title, release_date, runtime, poster_path)")
            .order("id"))),
        // Filmy mimo kolekce – schválené požadavky (V3.5.1); chyba (stará databáze) nevadí
        cached("other-films", () => fetchAllRows(() => supabase
            .from("other_films")
            .select("tmdb_id, title, original_title, release_date, runtime, poster_path")
            .order("tmdb_id"))).catch(() => []),
    ]);
    return { universes, items, otherFilms };
}

/** Pořadí typů kolekcí na přehledu – cesty až na konci (V3.0.1; dřív byly první). */
export const KIND_ORDER = ["series", "studio", "genre", "path"];

/**
 * Jedno univerzum podle adresy (slug) včetně filmů v pořadí vydání, nebo null.
 * Jeden dotaz (filmy vnořené v kolekci) místo dvou po sobě; výsledek je v mezipaměti.
 *
 * Vrací { ...kolekce, items, upcoming }: items = vydané filmy (s nimi pracuje celá
 * stránka – postup, Up next, pohledy), upcoming = chystané filmy pro oddíl
 * Coming soon (V3.3), seřazené podle data premiéry. Film v den premiéry už patří
 * do items (V3.3.1); chystané za hranicí let (viz inComingSoonWindow) se neukazují.
 */
export function fetchUniverse(slug) {
    return cached(`universe:${slug}`, async () => {
        const universe = await supabase
            .from("universes")
            .select(`
                id, slug, name, description, color, kind, cover_tmdb_id,
                cover:films(title, poster_path, backdrop_path),
                categories(id, slug, name, color, sort_order),
                universe_items(
                    id, release_order, story_order, group_label, franchise, label, is_optional, is_upcoming, note,
                    film:films(tmdb_id, title, original_title, release_date, runtime, poster_path, backdrop_path)
                )
            `)
            .eq("slug", slug)
            .order("release_order", { referencedTable: "universe_items" })
            .maybeSingle()
            .then(check);
        if (!universe) return null;
        const { universe_items: all, ...rest } = universe;
        const items = (all ?? []).filter((item) => !isUpcoming(item));
        const upcoming = (all ?? [])
            .filter((item) => isUpcoming(item) && inComingSoonWindow(item.film))
            .sort(byPremiere);
        // Oznámené na později (za hranicí let) – web je neukazuje, vidí je jen admin
        const later = (all ?? []).filter((item) => isUpcoming(item) && !inComingSoonWindow(item.film));
        return { ...rest, items, upcoming, later };
    });
}

/** Řazení chystaných filmů: podle data premiéry, film bez data až na konec (pak podle seedu). */
export function byPremiere(a, b) {
    const da = a.film?.release_date ?? "9999";
    const db = b.film?.release_date ?? "9999";
    return da.localeCompare(db) || (a.release_order ?? 0) - (b.release_order ?? 0);
}

// ---------------------------------------------------------------------
// Coming soon (V3.3 / V3.3.1)
// ---------------------------------------------------------------------

/** Kolik let dopředu Coming soon ukazuje – celé roky, posouvá se samo s dnešním datem. */
export const COMING_SOON_YEARS = 5;

/** Je film ještě před premiérou? Podle data z TMDB a dnešního data uživatele (den premiéry = vydaný). */
export function isUnreleased(film) {
    return !film?.release_date || film.release_date > todayLocal();
}

/**
 * Je položka kolekce chystaný film? Rozhoduje datum premiéry (V3.3.2): dokud nebyla, je chystaný –
 * i když TMDB už hlásí „Released“. Bez data rozhodne příznak is_upcoming z importu.
 * V den premiéry se film přepne sám (stejné pravidlo má pohled universe_progress).
 */
export function isUpcoming(item) {
    const date = item?.film?.release_date;
    return date ? date > todayLocal() : Boolean(item?.is_upcoming);
}

/** Poslední rok, který Coming soon ukazuje: letos + 5 (v roce 2026 → celý rok 2031). */
export function comingSoonLastYear() {
    return new Date().getFullYear() + COMING_SOON_YEARS;
}

/** Patří chystaný film do Coming soon? Rozhoduje jen rok premiéry; film bez data ano („Date TBA“). */
export function inComingSoonWindow(film) {
    if (!film?.release_date) return true;
    return Number(film.release_date.slice(0, 4)) <= comingSoonLastYear();
}

/**
 * Všechny chystané filmy ze všech kolekcí pro stránku Coming soon (V3.3.1):
 * [{ film, universes }] seřazené podle premiéry (bez data na konci).
 * Film ve více kolekcích je jednou a nese seznam kolekcí (série první).
 * Bere se ze stejného seznamu filmů jako hledání (V3.3.2) – chystaný se pozná podle data,
 * ne jen podle příznaku, takže dotaz na is_upcoming nestačí.
 */
export async function fetchComingSoon() {
    const { universes, items } = await fetchSearchData();
    const universeById = new Map(universes.map((u) => [u.id, u]));

    const byFilm = new Map();
    for (const item of items) {
        const universe = universeById.get(item.universe_id);
        if (!item.film || !universe || !isUpcoming(item) || !inComingSoonWindow(item.film)) continue;
        const entry = byFilm.get(item.film.tmdb_id) ?? { film: item.film, universes: [] };
        if (!entry.universes.includes(universe)) entry.universes.push(universe);
        byFilm.set(item.film.tmdb_id, entry);
    }

    // Kolekce u filmu: série první, pak studia a výběry; filmy podle premiéry, bez data na konci
    const kindRank = (u) => Math.max(0, KIND_ORDER.indexOf(u.kind ?? "series"));
    for (const entry of byFilm.values()) {
        entry.universes.sort((a, b) => kindRank(a) - kindRank(b) || a.sort_order - b.sort_order);
    }
    return [...byFilm.values()].sort((a, b) =>
        (a.film.release_date ?? "9999").localeCompare(b.film.release_date ?? "9999")
        || a.film.title.localeCompare(b.film.title));
}

/**
 * Rozdělí chystané filmy po čtvrtletích: [{ key, year, quarter, items }] v pořadí;
 * filmy bez data na konci ve skupině s quarter = null.
 */
export function groupByQuarter(entries) {
    const groups = [];
    for (const entry of entries) {
        const date = entry.film.release_date;
        const year = date ? Number(date.slice(0, 4)) : null;
        const quarter = date ? Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1 : null;
        const key = date ? `${year}-Q${quarter}` : "tba";
        let group = groups[groups.length - 1];
        if (!group || group.key !== key) {
            group = { key, year, quarter, items: [] };
            groups.push(group);
        }
        group.items.push(entry);
    }
    return groups;
}

/**
 * Přednačtení kolekce, než na ni uživatel klikne (najetí myší / dotyk na kartu):
 * data do mezipaměti a banner do mezipaměti prohlížeče. Chyby se ignorují.
 */
const prefetched = new Set();
export function prefetchUniverse(slug, backdropPath = null) {
    if (prefetched.has(slug)) return;
    prefetched.add(slug);
    fetchUniverse(slug).catch(() => prefetched.delete(slug));
    const image = backdropUrl(backdropPath);
    if (image) new Image().src = image;
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

/** Zahodí uložený postup (po zhlédnutí, přihlášení, odhlášení). */
export function invalidateProgress() {
    invalidate("progress");
}

/** Oznámí zbytku aplikace, že se změnila zhlédnutí (např. kvůli achievementům). */
function watchesChanged() {
    invalidateProgress();
    document.dispatchEvent(new CustomEvent("watches-changed"));
}

/**
 * Přednačtení dat přehledu hned při startu – souběžně s přihlášením a načtením profilu
 * (dřív se na ně čekalo). Chyby se ignorují, zopakuje je samotná obrazovka.
 */
export function warmOverview() {
    fetchUniverses().catch(() => {});
    fetchCategories().catch(() => {});
}

/** +1: zapíše nové zhlédnutí (dnes podle hodin uživatele). */
export async function addWatch(tmdbId) {
    await supabase.from("watches").insert({ tmdb_id: tmdbId, watched_on: todayLocal() }).then(check);
    watchesChanged();
}

/** −1: smaže nejnovější zhlédnutí. Vrací nový počet. */
export async function removeLatestWatch(tmdbId) {
    const count = await supabase.rpc("remove_latest_watch", { p_tmdb_id: tmdbId }).then(check);
    watchesChanged();
    return count;
}

// ---------------------------------------------------------------------
// Watchlist („chci vidět“)
// ---------------------------------------------------------------------

/** ID filmů ve watchlistu přihlášeného uživatele (prázdné pro nepřihlášeného). */
export async function fetchWatchlistIds(signedIn) {
    if (!signedIn) return new Set();
    const rows = await supabase.from("watchlist").select("tmdb_id").then(check);
    return new Set(rows.map((r) => r.tmdb_id));
}

/**
 * Watchlist s údaji o filmech a univerzy, ve kterých film je.
 * Seřazený od naposledy přidaného.
 */
export async function fetchWatchlist() {
    const rows = await supabase
        .from("watchlist")
        .select("tmdb_id, added_at, film:films(tmdb_id, title, release_date, runtime, poster_path)")
        .order("added_at", { ascending: false })
        .then(check);
    if (rows.length === 0) return [];

    const memberships = await supabase
        .from("universe_items")
        .select("tmdb_id, is_upcoming, universe:universes(slug, name, color, sort_order)")
        .in("tmdb_id", rows.map((r) => r.tmdb_id))
        .then(check);

    const universesByFilm = new Map();
    const upcomingIds = new Set();      // filmy, které ještě nevyšly (Coming soon, V3.3)
    for (const m of memberships) {
        if (m.is_upcoming) upcomingIds.add(m.tmdb_id);
        if (!m.universe) continue;
        const list = universesByFilm.get(m.tmdb_id) ?? [];
        list.push(m.universe);
        universesByFilm.set(m.tmdb_id, list);
    }
    return rows.map((r) => ({
        ...r,
        upcoming: isUpcoming({ is_upcoming: upcomingIds.has(r.tmdb_id), film: r.film }),
        universes: (universesByFilm.get(r.tmdb_id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }));
}

export async function addToWatchlist(tmdbId) {
    await supabase.from("watchlist").insert({ tmdb_id: tmdbId }).then(check);
}

export async function removeFromWatchlist(tmdbId) {
    await supabase.from("watchlist").delete().eq("tmdb_id", tmdbId).then(check);
}

/** První neviděný povinný film v pořadí vydání, nebo null (univerzum je hotové). */
export function nextUnwatched(items, counts) {
    return items.find((item) => !item.is_optional && !counts.has(item.film.tmdb_id)) ?? null;
}

/** Postup v univerzu podle aktuálních počtů (volitelné filmy se nepočítají; chystané už v items nejsou). */
export function computeProgress(items, counts) {
    const required = items.filter((item) => !item.is_optional);
    const watched = required.filter((item) => (counts.get(item.film.tmdb_id)?.count ?? 0) > 0);
    return { total: required.length, watched: watched.length };
}

/** Procento z postupu (0–100). */
export function percent({ total, watched }) {
    return total === 0 ? 0 : Math.round((watched / total) * 100);
}

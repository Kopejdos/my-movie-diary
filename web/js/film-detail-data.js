// Detail filmu (V4.4.6) – čistá logika bez vykreslování: odkazy na trailer a TMDB,
// výběr popisu v jazyce aplikace, kolekce filmu. Okno je ve views/film-detail.js.

/** Je klíč videa na YouTube v pořádku? (stejné pravidlo jako v databázi) */
export const isTrailerKey = (key) => typeof key === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(key);

/** Odkaz na trailer na YouTube. */
export function youtubeUrl(key) {
    return isTrailerKey(key) ? `https://www.youtube.com/watch?v=${key}` : null;
}

/** Hledání traileru na YouTube – když TMDB trailer nemá (původní název + rok + „trailer“). */
export function youtubeSearchUrl(film) {
    const title = film.original_title || film.title || "";
    const year = film.release_date ? film.release_date.slice(0, 4) : "";
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${year} trailer`.replace(/\s+/g, " ").trim())}`;
}

/** Stránka filmu na TMDB (zdroj údajů – uvedení zdroje). */
export function tmdbUrl(tmdbId) {
    return `https://www.themoviedb.org/movie/${tmdbId}`;
}

/** Popis filmu v jazyce aplikace: překlad z TMDB, jinak anglický, jinak null. */
export function pickOverview(film, translation) {
    const local = translation?.overview?.trim();
    if (local) return local;
    return film?.overview?.trim() || null;
}

/**
 * Má se trailer dohledat přes Edge Function? Ne, když klíč už je, nebo když se kontroloval
 * nedávno (do 30 dní) a TMDB žádný neměl. Starý web bez sloupců (před migrací) → zkusí se.
 */
export function needsTrailerLookup(film, now = Date.now()) {
    if (!film) return false;
    if (isTrailerKey(film.trailer_key)) return false;
    if (!film.trailer_checked_at) return true;
    return now - Date.parse(film.trailer_checked_at) > 30 * 86_400_000;
}

/**
 * Kolekce, ve kterých film je (z dat hledání: universes + items), seřazené podle pořadí
 * kolekcí na přehledu; každá jen jednou.
 */
export function collectionsOf(tmdbId, { universes = [], items = [] } = {}) {
    const ids = new Set(items.filter((item) => (item.film?.tmdb_id ?? item.tmdb_id) === tmdbId).map((item) => item.universe_id));
    return universes.filter((u) => ids.has(u.id));
}

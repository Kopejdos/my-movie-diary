// Hledání a filtr na stránce Coming soon (V4.4.5) – čistá logika, nic nevykresluje.
// Film se hodí, když odpovídá textu (název, původní název, rok, název kolekce) a aspoň jedna
// jeho kolekce je zvoleného druhu (série, studio, režisér…) a v zvolené kategorii (žánru).
// Volitelně jen filmy z watchlistu.

import { normalize } from "./search.js";

/** Text, ve kterém se u filmu hledá (normalizovaný jednou pro všechny úhozy). */
export function soonHaystack(entry) {
    const { film, universes } = entry;
    const year = film.release_date ? film.release_date.slice(0, 4) : "";
    const text = normalize([film.title, film.original_title, year, ...universes.map((u) => u.name)].filter(Boolean).join(" "));
    return { text, compact: text.replace(/ /g, "") };
}

/** Každé slovo dotazu musí být v textu (ve slovech nebo „slepené“ – spiderman = Spider-Man). */
export function matchesQuery(haystack, query) {
    const words = normalize(query).split(" ").filter(Boolean);
    return words.every((word) => haystack.text.includes(word) || haystack.compact.includes(word));
}

/** Kolekce filmu, které projdou druhem a kategorií. */
function matchingUniverses(entry, kind, categoryId) {
    return entry.universes.filter((u) =>
        (kind === "all" || (u.kind ?? "series") === kind)
        && (categoryId === null || (u.categoryIds ?? []).includes(categoryId)));
}

/**
 * Filtr seznamu chystaných filmů.
 * options: { query, kind ("all" | series | studio | director | genre | path), categoryId (null = vše),
 *            watchlistOnly, watchlist (Set tmdb_id) }
 */
export function filterComingSoon(entries, { query = "", kind = "all", categoryId = null, watchlistOnly = false, watchlist = new Set() } = {}) {
    const hasQuery = normalize(query) !== "";
    return entries.filter((entry) => {
        if (watchlistOnly && !watchlist.has(entry.film.tmdb_id)) return false;
        if (matchingUniverses(entry, kind, categoryId).length === 0) return false;
        if (!hasQuery) return true;
        entry.haystack ??= soonHaystack(entry);
        return matchesQuery(entry.haystack, query);
    });
}

/**
 * Počty pro filtry: kinds = počet filmů v každém druhu (při zvolené kategorii),
 * categories = počet filmů v každé kategorii (při zvoleném druhu). Text a watchlist platí pro oba.
 */
export function soonFacets(entries, { query = "", kind = "all", categoryId = null, watchlistOnly = false, watchlist = new Set() } = {}, kinds, categories) {
    const base = filterComingSoon(entries, { query, kind: "all", categoryId: null, watchlistOnly, watchlist });
    const kindCounts = new Map(kinds.map((k) => [k, base.filter((e) => matchingUniverses(e, k, categoryId).length > 0).length]));
    const categoryCounts = new Map(categories.map((c) => [c.id, base.filter((e) => matchingUniverses(e, kind, c.id).length > 0).length]));
    return {
        all: base.filter((e) => matchingUniverses(e, "all", categoryId).length > 0).length,
        allCategories: base.filter((e) => matchingUniverses(e, kind, null).length > 0).length,
        kinds: kindCounts,
        categories: categoryCounts,
    };
}

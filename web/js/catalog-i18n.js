// Přeložená data katalogu (V4.2.2) – názvy filmů, kolekcí, kategorií, poznámky cest a obecné
// popisky (Phase 1, Remake…). V angličtině se nic nenačítá a funkce vrací data beze změny.
//
//   • názvy filmů: z databáze (film_titles – plní je import z TMDB), jeden dotaz při startu,
//   • kolekce, kategorie, poznámky a popisky: soubor js/i18n/catalog.<jazyk>.json (verzuje se s webem):
//       categories  { slug: název }             collections { slug: { name?, description? } }
//       notes       { anglická poznámka: překlad }   terms { anglický popisek: překlad }
//     Poznámky a popisky se hledají podle anglického textu – po úpravě v adminu se ukáže anglický,
//     dokud se překlad nedoplní.
// Překládá se přímo v načtených datech (data.js, lists.js…) a anglický název zůstane
// v title_en / name_en – hledání najde film i kolekci podle obou. Co přeložené není, zůstane anglicky.
// Admin panel si bere data bez překladu (fetchUniverse(slug, { original: true })), aby se do
// databáze neuložil přeložený text.

import { supabase } from "./supabase.js";
import { LANG } from "./texts.js";

/** Překládá se? (ne v angličtině) */
export const TRANSLATED = LANG !== "en";

const EMPTY = { categories: {}, collections: {}, notes: {}, terms: {} };
let titles = new Map();         // tmdb_id → přeložený název
let texts = EMPTY;

/** Překlady katalogu jsou načtené (chyba nevadí – zůstane angličtina). */
export const catalogReady = TRANSLATED ? load() : Promise.resolve();

async function load() {
    const [titleMap, file] = await Promise.all([
        supabase.rpc("film_titles", { p_lang: LANG })
            .then(({ data, error }) => (error ? null : data))
            .catch(() => null),
        fetch(new URL(`./i18n/catalog.${LANG}.json`, import.meta.url))
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null),
    ]);
    titles = new Map(Object.entries(titleMap ?? {}).map(([id, title]) => [Number(id), title]));
    texts = { ...EMPTY, ...(file ?? {}) };
}

/**
 * Přeloží název filmu (na místě). tmdbId zvlášť, když ho objekt filmu nemá
 * (zhlédnutí: { tmdb_id, film: { title… } }).
 */
export function localizeFilm(film, tmdbId = film?.tmdb_id) {
    const title = film ? titles.get(tmdbId) : null;
    if (title && title !== film.title) {
        film.title_en ??= film.title;
        film.title = title;
    }
    return film;
}

/** Přeloží řádky s filmem ({ tmdb_id?, film }) – zhlédnutí, watchlist, seznamy. */
export function localizeRows(rows) {
    if (!TRANSLATED) return rows;
    for (const row of rows ?? []) localizeFilm(row.film, row.tmdb_id ?? row.film?.tmdb_id);
    return rows;
}

/** Přeloží název a popis kolekce (podle slugu) a název filmu na obalu. */
export function localizeUniverse(universe) {
    if (!TRANSLATED || !universe) return universe;
    const text = texts.collections[universe.slug];
    if (text?.name && text.name !== universe.name) {
        universe.name_en ??= universe.name;
        universe.name = text.name;
    }
    if (text?.description) universe.description = text.description;
    if (universe.cover) localizeFilm(universe.cover, universe.cover_tmdb_id ?? universe.cover.tmdb_id);
    return universe;
}

/** Přeloží název kategorie (podle slugu). */
export function localizeCategory(category) {
    if (!TRANSLATED || !category) return category;
    const name = texts.categories[category.slug];
    if (name) category.name = name;
    return category;
}

/** Obecný popisek (skupina, série, štítek filmu – „Phase 1“, „Remake“); vlastní jména zůstanou. */
export function term(text) {
    return text ? texts.terms[text] ?? text : text;
}

/** Přeloží položku kolekce: film, skupinu, sérii, štítek a poznámku kroku cesty. */
export function localizeItem(item) {
    if (!TRANSLATED || !item) return item;
    localizeFilm(item.film);
    item.group_label = term(item.group_label);
    item.franchise = term(item.franchise);
    item.label = term(item.label);
    if (item.note) item.note = texts.notes[item.note] ?? item.note;
    return item;
}

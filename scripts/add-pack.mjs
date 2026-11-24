// =====================================================================
// My Movie Diary – přidání balíčku kolekcí do seedu (V4.3.2)
//
// Použití (obvykle přes ./scripts/add-pack.sh):
//   node scripts/add-pack.mjs supabase/packs/v4.3.2-westerns.json
//
// Balíček (supabase/packs/*.json) má stejný formát kolekcí jako seed:
//   "universes": [ … ]   nové kolekce – přidají se na konec seedu (kolekce, která v seedu už je, se přeskočí)
//   "update": { slug: { "addCategories": [ … ], "description": "…", "name": "…", "color": "…",
//                       "addFilms": [ { "title": "…", "year": 2026 } ] } }
//                        úpravy kolekcí, které už v seedu jsou; addFilms (V4.4.5) přidá filmy do
//                        kolekce (film, který v ní už je – stejný název a rok –, se přeskočí);
//                        od V4.4.6 na správné místo: do své skupiny (group) a podle roku
//   "fix": [ { "title": "300", "year": 2006, "tmdb": 1271 } ]           (V4.4.6)
//                        oprava filmu ve všech kolekcích, kde je (stejný název a rok): "tmdb" doplní
//                        ID filmu v TMDB (import pak vezme přesně tenhle film), "newTitle" přejmenuje;
//                        bez obojího se kolekce jen znovu naimportují (lepší hledání podle názvu)
// Seed se upravuje jako text – ostatní řádky zůstanou do písmene stejné (git diff ukáže jen změny).
// Jde spustit opakovaně: podruhé nic nepřidá. Poslední řádek výstupu = slugy k importu.
// =====================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Objekt filmu jako řádek seedu: { "title": "X", "year": 2024 } */
const formatObject = (obj) => `{ ${Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`;

/** Hodnota hlavičky kolekce (kategorie jako ["a", "b"]). */
const formatValue = (value) => (Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(", ")}]` : JSON.stringify(value));

const HEADER_ORDER = ["slug", "name", "kind", "categories", "color", "description"];

/** Řádky bloku nové kolekce ve stylu seedu (stejně jako sync-seed). */
function newBlock(universe, last) {
    const keys = [
        ...HEADER_ORDER.filter((key) => universe[key] !== undefined),
        ...Object.keys(universe).filter((key) => !HEADER_ORDER.includes(key) && key !== "films"),
    ];
    const films = universe.films ?? [];
    return [
        "    {",
        ...keys.map((key) => `      ${JSON.stringify(key)}: ${formatValue(universe[key])},`),
        `      "films": [`,
        ...films.map((film, i) => `        ${formatObject(film)}${i < films.length - 1 ? "," : ""}`),
        "      ]",
        last ? "    }" : "    },",
    ];
}

/** Najde blok kolekce podle slugu: { start, end, filmsLine } (indexy řádků). */
function findBlock(lines, slug) {
    const slugLine = lines.findIndex((line) => line.trim().replace(/,$/, "") === `"slug": ${JSON.stringify(slug)}`);
    if (slugLine < 0) return null;
    let start = slugLine;
    while (start > 0 && lines[start].trim() !== "{") start--;
    const indent = lines[start].match(/^\s*/)[0];
    let end = slugLine;
    while (end < lines.length && !new RegExp(`^${indent}\\},?\\s*$`).test(lines[end])) end++;
    const filmsLine = lines.slice(start, end).findIndex((line) => /^\s*"films":/.test(line));
    return { start, end, filmsLine: filmsLine < 0 ? end : start + filmsLine };
}

/** Řádky filmů v bloku kolekce: [{ index, film }] (film = objekt z řádku seedu). */
function filmLines(lines, block) {
    const rows = [];
    for (let i = block.filmsLine + 1; i < block.end; i++) {
        const text = lines[i].trim().replace(/,$/, "");
        if (!text.startsWith("{") || !text.endsWith("}")) continue;
        try {
            rows.push({ index: i, film: JSON.parse(text) });
        } catch {
            // víceřádkový zápis filmu – přeskočit (seed má film na řádek)
        }
    }
    return rows;
}

/**
 * Za který řádek film vložit (V4.4.6). Film se skupinou jde do své skupiny (nová skupina na
 * konec kolekce); uvnitř skupiny – nebo v kolekci bez skupin – podle roku, pokud jsou filmy
 * seřazené podle roku; jinak na konec skupiny / kolekce. Vrací index řádku (může být řádek
 * "films": [ – pak jde film na začátek) nebo null (prázdná kolekce).
 */
export function insertAfter(rows, film) {
    if (rows.length === 0) return null;
    const group = film.group ?? null;
    const pool = rows.filter((r) => (r.film.group ?? null) === group);
    if (pool.length === 0) return rows[rows.length - 1].index;
    const years = pool.map((r) => r.film.year ?? 0);
    const sorted = years.every((year, i) => i === 0 || years[i - 1] <= year);
    if (!sorted || !film.year) return pool[pool.length - 1].index;
    const before = pool.filter((r) => (r.film.year ?? 0) <= film.year);
    return before.length > 0 ? before[before.length - 1].index : pool[0].index - 1;
}

/**
 * Přidá filmy do pole "films" bloku kolekce (V4.4.5, od V4.4.6 na místo podle skupiny a roku).
 * Vrací true, když něco přidal.
 */
function appendFilms(lines, slug, films) {
    if (films.length === 0) return false;
    for (const film of films) {
        const block = findBlock(lines, slug);
        const rows = filmLines(lines, block);
        if (rows.length === 0) {
            // "films": [] na jednom řádku (nebo prázdné pole) → rozepsat
            const indent = lines[block.filmsLine].match(/^\s*/)[0];
            const comma = /,\s*$/.test(lines[block.filmsLine]) ? "," : "";
            let close = block.filmsLine;
            if (!/\[\s*\]/.test(lines[block.filmsLine])) {
                close = block.end - 1;
                while (close > block.filmsLine && !/^\s*\]\s*,?\s*$/.test(lines[close])) close--;
            }
            lines.splice(block.filmsLine, close - block.filmsLine + 1,
                `${indent}"films": [`, `${indent}  ${formatObject(film)}`, `${indent}]${comma}`);
            continue;
        }
        const indent = rows[0].index !== undefined ? lines[rows[0].index].match(/^\s*/)[0] : "        ";
        const after = insertAfter(rows, film);
        const lastRow = rows[rows.length - 1];
        if (after === lastRow.index) {
            // za poslední film: předchozí dostane čárku, nový je bez ní
            lines[after] = lines[after].replace(/,?\s*$/, ",");
            lines.splice(after + 1, 0, `${indent}${formatObject(film)}`);
        } else {
            lines.splice(after + 1, 0, `${indent}${formatObject(film)},`);
        }
    }
    return true;
}

/**
 * Oprava filmů ve všech kolekcích (V4.4.6): řádky se stejným názvem a rokem dostanou "tmdb"
 * (a případně nový název). Vrací slugy kolekcí, kde film je (ty se znovu naimportují).
 */
function fixFilms(lines, seed, fixes) {
    const touched = [];
    for (const universe of seed.universes) {
        let hit = false;
        for (const fix of fixes) {
            if (!universe.films.some((f) => f.title === fix.title && (f.year ?? null) === (fix.year ?? null))) continue;
            hit = true;
            const block = findBlock(lines, universe.slug);
            for (const row of filmLines(lines, block)) {
                if (row.film.title !== fix.title || (row.film.year ?? null) !== (fix.year ?? null)) continue;
                const film = { ...row.film };
                if (fix.newTitle) film.title = fix.newTitle;
                if (Number.isInteger(fix.tmdb) && fix.tmdb > 0) {
                    // "tmdb" hned za rok (jako řádky ze sync-seed)
                    const ordered = {};
                    for (const [key, value] of Object.entries(film)) {
                        if (key === "tmdb") continue;
                        ordered[key] = value;
                        if (key === "year") ordered.tmdb = fix.tmdb;
                    }
                    if (!("tmdb" in ordered)) ordered.tmdb = fix.tmdb;
                    Object.keys(film).forEach((key) => delete film[key]);
                    Object.assign(film, ordered);
                }
                const indent = lines[row.index].match(/^\s*/)[0];
                const comma = /,\s*$/.test(lines[row.index]) ? "," : "";
                lines[row.index] = `${indent}${formatObject(film)}${comma}`;
            }
        }
        if (hit) touched.push(universe.slug);
    }
    return touched;
}

/** Nastaví (nebo vloží před "films") řádek hlavičky kolekce. */
function setHeader(lines, block, key, value) {
    const pattern = new RegExp(`^(\\s*)${JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`);
    for (let i = block.start; i < block.filmsLine; i++) {
        const match = lines[i].match(pattern);
        if (match) {
            const line = `${match[1]}${JSON.stringify(key)}: ${formatValue(value)},`;
            if (lines[i] === line) return false;
            lines[i] = line;
            return true;
        }
    }
    lines.splice(block.filmsLine, 0, `      ${JSON.stringify(key)}: ${formatValue(value)},`);
    return true;
}

/**
 * Přidá balíček do textu seedu. Čistá funkce (testy). Vrací nový text, slugy nových
 * kolekcí, upravených kolekcí a přeskočených (už v seedu).
 */
export function applyPack(text, pack) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const seed = JSON.parse(text);
    const inSeed = new Map(seed.universes.map((u) => [u.slug, u]));
    const added = [];
    const updated = [];
    const skipped = [];
    // 0. Opravy filmů ve všech kolekcích (V4.4.6) – dřív než úpravy, ať addFilms vidí opravené řádky
    const fixed = Array.isArray(pack.fix) && pack.fix.length > 0 ? fixFilms(lines, seed, pack.fix) : [];

    // 1. Úpravy existujících kolekcí
    for (const [slug, change] of Object.entries(pack.update ?? {})) {
        const current = inSeed.get(slug);
        if (!current) {
            skipped.push(slug);
            continue;
        }
        let changed = false;
        if (Array.isArray(change.addCategories)) {
            const categories = [...new Set([...(current.categories ?? []), ...change.addCategories])];
            if (categories.length !== (current.categories ?? []).length) {
                changed = setHeader(lines, findBlock(lines, slug), "categories", categories) || changed;
            }
        }
        for (const key of ["name", "description", "color", "kind"]) {
            if (change[key] !== undefined && change[key] !== current[key]) {
                changed = setHeader(lines, findBlock(lines, slug), key, change[key]) || changed;
            }
        }
        if (Array.isArray(change.addFilms)) {
            const have = new Set((current.films ?? []).map((f) => `${f.title}|${f.year ?? ""}`));
            const fresh = change.addFilms.filter((f) => !have.has(`${f.title}|${f.year ?? ""}`));
            changed = appendFilms(lines, slug, fresh) || changed;
        }
        if (changed) updated.push(slug);
    }

    // 2. Nové kolekce na konec pole "universes"
    const fresh = (pack.universes ?? []).filter((universe) => {
        if (inSeed.has(universe.slug)) skipped.push(universe.slug);
        return !inSeed.has(universe.slug);
    });
    if (fresh.length > 0) {
        let end = lines.length - 1;
        while (end >= 0 && lines[end].trim() === "") end--;              // závěrečná "}"
        let close = end - 1;
        while (close >= 0 && lines[close].trim() === "") close--;        // "  ]" pole universes
        if (lines[end]?.trim() !== "}" || !/^\s*\]\s*$/.test(lines[close] ?? "")) {
            throw new Error("Seed must end with the universes array (  ] and }).");
        }
        let last = close - 1;
        while (last >= 0 && lines[last].trim() === "") last--;
        if (/\}\s*$/.test(lines[last])) lines[last] = lines[last].replace(/\s*$/, ",");
        lines.splice(close, 0, ...fresh.flatMap((universe, i) => newBlock(universe, i === fresh.length - 1)));
        added.push(...fresh.map((universe) => universe.slug));
    }

    const result = lines.join("\n");
    JSON.parse(result);              // pojistka: upravený seed musí být platný JSON
    return { text: result.replace(/\n/g, eol), added, updated, skipped, fixed };
}

// ---------------------------------------------------------------------
// Spuštění z příkazové řádky
// ---------------------------------------------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    const [packPath, seedPath = "supabase/seed/universes.json"] = process.argv.slice(2);
    if (!packPath) {
        console.error("Použití: node scripts/add-pack.mjs <balíček.json> [seed]");
        process.exit(1);
    }
    const pack = JSON.parse(readFileSync(packPath, "utf8"));
    const { text, added, updated, skipped, fixed } = applyPack(readFileSync(seedPath, "utf8"), pack);
    writeFileSync(seedPath, text);
    console.log(`Nové kolekce: ${added.length ? added.join(", ") : "žádné"}`);
    console.log(`Upravené kolekce: ${updated.length ? updated.join(", ") : "žádné"}`);
    if (skipped.length) console.log(`Už v seedu (přeskočeno): ${skipped.join(", ")}`);
    if (pack.fix?.length) console.log(`Opravené filmy jsou v kolekcích: ${fixed.length ? fixed.join(", ") : "žádných (už opravené nebo v seedu nejsou)"}`);
    // Import: nové + upravené; při opakovaném spuštění i ty z balíčku, které už v seedu jsou
    const slugs = [...new Set([...added, ...updated, ...fixed, ...(pack.universes ?? []).map((u) => u.slug), ...Object.keys(pack.update ?? {})])];
    console.log(slugs.join(" "));
}

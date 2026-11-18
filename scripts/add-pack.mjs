// =====================================================================
// My Movie Diary – přidání balíčku kolekcí do seedu (V4.3.2)
//
// Použití (obvykle přes ./scripts/add-pack.sh):
//   node scripts/add-pack.mjs supabase/packs/v4.3.2-westerns.json
//
// Balíček (supabase/packs/*.json) má stejný formát kolekcí jako seed:
//   "universes": [ … ]   nové kolekce – přidají se na konec seedu (kolekce, která v seedu už je, se přeskočí)
//   "update": { slug: { "addCategories": [ … ], "description": "…", "name": "…", "color": "…" } }
//                        úpravy kolekcí, které už v seedu jsou
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
    return { text: result.replace(/\n/g, eol), added, updated, skipped };
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
    const { text, added, updated, skipped } = applyPack(readFileSync(seedPath, "utf8"), pack);
    writeFileSync(seedPath, text);
    console.log(`Nové kolekce: ${added.length ? added.join(", ") : "žádné"}`);
    console.log(`Upravené kolekce: ${updated.length ? updated.join(", ") : "žádné"}`);
    if (skipped.length) console.log(`Už v seedu (přeskočeno): ${skipped.join(", ")}`);
    // Import: nové + upravené; při opakovaném spuštění i ty z balíčku, které už v seedu jsou
    const slugs = [...new Set([...added, ...updated, ...(pack.universes ?? []).map((u) => u.slug), ...Object.keys(pack.update ?? {})])];
    console.log(slugs.join(" "));
}

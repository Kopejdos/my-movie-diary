// Výhody za úroveň (V4.4) – s úrovní rostou limity požadavků a seznamů.
//
// Stejná tabulka je v databázi (funkce level_perks, migrace 20261122100000_level_perks.sql) a ta
// limity opravdu hlídá – Edge Function requests a triggery seznamů. Web z ní bere úroveň
// přihlášeného uživatele (my_perks) a ukazuje, co smí a co odemkne další úroveň.
// tests/perks.test.mjs hlídá, že tabulky v JS a SQL jsou stejné.

import { supabase } from "./supabase.js";
import { TEXTS, format } from "./texts.js";

/** Úroveň → limity. Dnešní limity (úroveň 1) se nikomu nesnižují. */
export const PERKS = [
    { level: 1, openRequests: 5, requestFilms: 30, listFilms: 300, lists: 50 },
    { level: 5, openRequests: 6, requestFilms: 30, listFilms: 400, lists: 50 },
    { level: 10, openRequests: 7, requestFilms: 40, listFilms: 500, lists: 60 },
    { level: 16, openRequests: 8, requestFilms: 40, listFilms: 600, lists: 70 },
    { level: 20, openRequests: 9, requestFilms: 50, listFilms: 800, lists: 80 },
    { level: 25, openRequests: 10, requestFilms: 50, listFilms: 1000, lists: 100 },
];

/** Názvy limitů v pořadí, jak se ukazují. */
export const PERK_KEYS = ["openRequests", "requestFilms", "listFilms", "lists"];

/** Limity pro úroveň (nejvyšší řádek, na který úroveň dosáhne). */
export function perksFor(level) {
    return [...PERKS].reverse().find((row) => (level ?? 1) >= row.level) ?? PERKS[0];
}

/** Další řádek tabulky nad úrovní (null = už má všechno). */
export function nextPerks(level) {
    return PERKS.find((row) => row.level > (level ?? 1)) ?? null;
}

/** Nejbližší úroveň, která zvedne daný limit (null = už je na maximu). */
export function levelRaising(key, level) {
    const now = perksFor(level)[key];
    return PERKS.find((row) => row.level > (level ?? 1) && row[key] > now) ?? null;
}

/** Věta k hlášce o limitu: „Level 10 raises it to 500.“ (prázdná, když už je na maximu). */
export function limitHint(key) {
    const row = levelRaising(key, current.level ?? 1);
    return row ? ` ${format("perksLimitHint", row.level, row[key])}` : "";
}

/** Název úrovně v jazyce aplikace (Extra, Stunt Double…). */
export function levelTitle(level) {
    const titles = [[1, "Extra"], [3, "Stand-in"], [5, "Stunt Double"], [7, "Supporting Actor"], [10, "Lead Actor"],
        [13, "Director"], [16, "Producer"], [20, "Studio Head"], [25, "Legend"]];
    const en = [...titles].reverse().find(([from]) => level >= from)[1];
    return TEXTS[`levelTitle_${en.replace(/[^A-Za-z]/g, "")}`] ?? en;
}

// ---------------------------------------------------------------------
// Výhody přihlášeného uživatele (podle úrovně z databáze)
// ---------------------------------------------------------------------

let current = { level: null, perks: PERKS[0] };
let pending = null;

/** Poslední známé výhody (synchronně – před načtením základní úroveň 1). */
export function currentPerks() {
    return current.perks;
}

/** Úroveň podle databáze (null = ještě nenačteno / nepřihlášený). */
export function currentLevel() {
    return current.level;
}

/** Výhody přihlášeného uživatele z databáze (my_perks); bez migrace V4.4 nebo při chybě úroveň 1. */
export function loadPerks() {
    pending ??= supabase.rpc("my_perks")
        .then(({ data, error }) => {
            if (error || !data) throw error ?? new Error("no perks");
            current = { level: data.level, perks: perksFor(data.level) };
            return current;
        })
        .catch(() => {
            pending = null;           // příště zkusit znovu
            return current;
        });
    return pending;
}

/** Po zhlédnutí, přihlášení nebo odhlášení se výhody načtou znovu. */
export function resetPerks() {
    pending = null;
    current = { level: null, perks: PERKS[0] };
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("watches-changed", () => { pending = null; });
}

// Výhody za úroveň (V4.4): tabulka limitů v JS (web/js/perks.js) a v SQL (level_perks v migraci)
// musí být stejná – limity hlídá databáze, web je jen ukazuje. Stejně tak vzorec úrovní a XP za
// úrovně achievementů (achievements.js × compute_user_xp). Shoda výpočtu XP na náhodných datech
// se ověřuje proti Postgresu při vývoji (docs/decisions.md, fáze 47).
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PERKS, PERK_KEYS, perksFor, nextPerks, levelRaising } = await import(web("perks.js"));
const { XP_RULES, xpForLevel } = await import(web("achievements.js"));
const SQL = readFileSync(new URL("../supabase/migrations/20261122100000_level_perks.sql", import.meta.url), "utf8");

test("tabulka výhod: JS = SQL (level_perks)", () => {
    const block = SQL.slice(SQL.indexOf("function public.level_perks"), SQL.indexOf("as t(level, open_requests"));
    const rows = [...block.matchAll(/\(\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g)]
        .map((m) => m.slice(1).map(Number))
        .map(([level, openRequests, requestFilms, listFilms, lists]) => ({ level, openRequests, requestFilms, listFilms, lists }));
    assert.deepEqual(rows, PERKS);
    // Další úrovně v user_perks = úrovně tabulky nad 1
    const next = SQL.match(/values \((\d+)\), \((\d+)\), \((\d+)\), \((\d+)\), \((\d+)\)\) as t\(level\)/).slice(1).map(Number);
    assert.deepEqual(next, PERKS.slice(1).map((row) => row.level));
});

test("výhody se s úrovní nikdy nesnižují a úroveň 1 = dnešní limity", () => {
    assert.deepEqual(perksFor(1), { level: 1, openRequests: 5, requestFilms: 30, listFilms: 300, lists: 50 });
    for (let i = 1; i < PERKS.length; i++) {
        for (const key of PERK_KEYS) assert.ok(PERKS[i][key] >= PERKS[i - 1][key], `${key} na úrovni ${PERKS[i].level}`);
    }
});

test("perksFor / nextPerks / levelRaising", () => {
    assert.equal(perksFor(4).level, 1);
    assert.equal(perksFor(9).listFilms, 400);
    assert.equal(perksFor(30).lists, 100);
    assert.equal(perksFor(null).level, 1);
    assert.equal(nextPerks(4).level, 5);
    assert.equal(nextPerks(25), null);
    assert.equal(levelRaising("requestFilms", 1).level, 10);        // úroveň 5 filmy v požadavku nezvedá
    assert.equal(levelRaising("lists", 5).level, 10);
    assert.equal(levelRaising("openRequests", 25), null);
});

test("vzorec úrovní a XP achievementů: JS = SQL", () => {
    assert.match(SQL, /round\(110 \* power\(\(p_level - 1\)::numeric, 2\.07\) \/ 50\) \* 50/);
    assert.equal(xpForLevel(2), 100);
    assert.equal(xpForLevel(25), 79150);
    const tiers = SQL.match(/array\[(\d+), (\d+), (\d+), (\d+), (\d+), (\d+)\]\)\[least/).slice(1).map(Number);
    assert.deepEqual(tiers, XP_RULES.tier);
    assert.match(SQL, /s\.distinct_films \* 10/);
    assert.match(SQL, /\(s\.total - s\.distinct_films\) \* 3/);
    assert.equal(XP_RULES.newFilm, 10);
    assert.equal(XP_RULES.rewatch, 3);
    assert.equal(XP_RULES.collectionPerFilm, 10);
});

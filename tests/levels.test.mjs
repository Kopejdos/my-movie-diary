// Úrovně a XP (V3.6.1 / V3.6.1.1): tabulka prahů, tituly a výpočet úrovně z XP.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { xpForLevel, levelFromXp, LEVEL_TITLES } = await import(web("achievements.js"));

test("prahy úrovní odpovídají tabulce z decisions.md", () => {
    const expected = { 1: 0, 2: 100, 3: 450, 5: 1950, 10: 10400, 15: 25950, 20: 48800, 25: 79150 };
    for (const [level, xp] of Object.entries(expected)) {
        assert.equal(xpForLevel(Number(level)), xp, `úroveň ${level}`);
    }
});

test("prahy rostou a jsou zaokrouhlené na 50", () => {
    for (let level = 2; level <= 40; level++) {
        assert.ok(xpForLevel(level) > xpForLevel(level - 1), `úroveň ${level} musí být dražší než ${level - 1}`);
        assert.equal(xpForLevel(level) % 50, 0, `úroveň ${level}`);
    }
});

test("levelFromXp – hranice úrovní", () => {
    assert.equal(levelFromXp(0).level, 1);
    assert.equal(levelFromXp(99).level, 1);
    assert.equal(levelFromXp(100).level, 2);
    assert.equal(levelFromXp(79149).level, 24);
    assert.equal(levelFromXp(79150).level, 25);
});

test("tituly podle úrovně", () => {
    const titles = { 1: "Extra", 3: "Stand-in", 5: "Stunt Double", 7: "Supporting Actor", 10: "Lead Actor",
        13: "Director", 16: "Producer", 20: "Studio Head", 25: "Legend" };
    for (const [level, title] of Object.entries(titles)) {
        assert.equal(levelFromXp(xpForLevel(Number(level))).title, title, `úroveň ${level}`);
    }
    assert.equal(LEVEL_TITLES.length, 9);
});

test("postup k další úrovni", () => {
    const state = levelFromXp(6764);          // příklad z praxe: 6 764 XP
    assert.equal(state.level, 8);
    assert.equal(state.intoLevel, 6764 - xpForLevel(8));
    assert.equal(state.toNext, xpForLevel(9) - 6764);
    assert.ok(state.progress >= 0 && state.progress < 100);
});

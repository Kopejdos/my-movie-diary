// Achievementy a XP z deníku: nové filmy, opakování, dokončené kolekce, Seen before.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { computeAchievements, XP_RULES } = await import(web("achievements.js"));

/** Jedno zhlédnutí (runtime v minutách). */
const watch = (tmdbId, date, runtime = 120, seenBefore = false) =>
    ({ tmdb_id: tmdbId, watched_on: date, created_at: date, film: { runtime }, seen_before: seenBefore });

const catalog = {
    universes: [{ id: 1, slug: "trilogy", name: "Trilogy" }, { id: 2, slug: "duo", name: "Duo" }],
    items: [
        { universe_id: 1, tmdb_id: 1 }, { universe_id: 1, tmdb_id: 2 }, { universe_id: 1, tmdb_id: 3 },
        { universe_id: 1, tmdb_id: 4, is_optional: true },        // volitelný – do dokončení se nepočítá
        { universe_id: 2, tmdb_id: 5 }, { universe_id: 2, tmdb_id: 6 },
    ],
    categories: [],
    links: [],
};

const card = (result, key) => result.cards.find((c) => c.key === key);

test("XP za nové filmy a opakování", () => {
    const result = computeAchievements({ ...catalog,
        watches: [watch(10, "2026-01-01"), watch(11, "2026-01-02"), watch(10, "2026-01-03")] });
    assert.equal(result.xp.films, 2 * XP_RULES.newFilm);
    assert.equal(result.xp.rewatches, 1 * XP_RULES.rewatch);
    assert.equal(result.xp.collections, 0);
});

test("dokončená kolekce: 10 XP za každý povinný film, volitelný film se nepočítá", () => {
    const result = computeAchievements({ ...catalog,
        watches: [watch(1, "2026-01-01"), watch(2, "2026-01-02"), watch(3, "2026-01-05")] });
    assert.deepEqual(result.completed.map((c) => c.universe.slug), ["trilogy"]);
    assert.equal(result.completed[0].date, "2026-01-05");      // den, kdy padl poslední povinný film
    assert.equal(result.xp.collections, 3 * XP_RULES.collectionPerFilm);
    assert.ok(card(result, "completionist").tiers[0].unlockedOn);
});

test("Seen before: počítá se do filmů a kolekcí, ne do času ani Marathonu", () => {
    // 5 × 10 h „někdy dřív“ – watched_on je u Seen before den zápisu (sloupec je povinný)
    const watches = [1, 2, 3, 5, 6].map((id) => watch(id, "2026-11-09", 600, true));
    const result = computeAchievements({ ...catalog, watches });
    assert.equal(result.values.distinctFilms, 5);
    assert.equal(result.values.hours, 0);
    assert.equal(result.values.bestDay, 0);
    assert.equal(result.completed.length, 2);
    assert.equal(card(result, "screen-time").tiers[0].unlockedOn, null);
    assert.equal(card(result, "marathon").tiers[0].unlockedOn, null);
});

test("Marathon a Rewatcher se odemknou v den, kdy padla hranice", () => {
    const watches = [
        watch(20, "2026-03-01"), watch(21, "2026-03-01"), watch(22, "2026-03-01"),   // 3 filmy za den
        watch(20, "2026-03-05"), watch(20, "2026-03-09"),                             // 3× stejný film
    ];
    const result = computeAchievements({ ...catalog, watches });
    assert.equal(card(result, "marathon").tiers[0].unlockedOn, "2026-03-01");
    assert.equal(card(result, "rewatcher").tiers[0].unlockedOn, "2026-03-09");
});

test("součet XP sedí s rozpadem", () => {
    const result = computeAchievements({ ...catalog,
        watches: [watch(1, "2026-01-01"), watch(2, "2026-01-01"), watch(3, "2026-01-01"), watch(1, "2026-02-01")] });
    const { films, rewatches, collections, achievements, total } = result.xp;
    assert.equal(total, films + rewatches + collections + achievements);
    assert.equal(result.level.xp, total);
});

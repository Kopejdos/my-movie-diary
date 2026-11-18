// Hledání a filtr na stránce Coming soon (V4.4.5, web/js/soon-filter.js).
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { filterComingSoon, soonFacets, soonHaystack, matchesQuery } = await import(web("soon-filter.js"));

const marvel = { id: 1, name: "Marvel Cinematic Universe", kind: "series", categoryIds: [10] };
const pixar = { id: 2, name: "Pixar", kind: "studio", categoryIds: [20] };
const cameron = { id: 3, name: "James Cameron", kind: "director", categoryIds: [30] };
const avatar = { id: 4, name: "Avatar", kind: "series", categoryIds: [30] };
const ENTRIES = [
    { film: { tmdb_id: 101, title: "Avengers: Secret Wars", release_date: "2027-12-17" }, universes: [marvel] },
    { film: { tmdb_id: 102, title: "Gatto", release_date: "2027-06-18" }, universes: [pixar] },
    { film: { tmdb_id: 103, title: "Avatar 4", original_title: "Avatar 4", release_date: "2029-12-21" }, universes: [avatar, cameron] },
    { film: { tmdb_id: 104, title: "Spider-Man: Beyond the Spider-Verse", release_date: null }, universes: [marvel] },
];
const ids = (list) => list.map((e) => e.film.tmdb_id);
const CATEGORIES = [{ id: 10, slug: "superhero" }, { id: 20, slug: "animation" }, { id: 30, slug: "scifi" }];
const KINDS = ["series", "studio", "director", "genre", "path"];

test("soon: bez filtru všechno, text hledá v názvu, roku i kolekci", () => {
    assert.deepEqual(ids(filterComingSoon(ENTRIES)), [101, 102, 103, 104]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { query: "avengers" })), [101]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { query: "2029" })), [103]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { query: "cameron" })), [103]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { query: "spiderman" })), [104]);       // slepená podoba
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { query: "marvel spider" })), [104]);   // všechna slova
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { query: "   " })), [101, 102, 103, 104]);
    assert.ok(matchesQuery(soonHaystack(ENTRIES[1]), "GÁTTO"));                          // bez diakritiky a velikosti
});

test("soon: druh kolekce, žánr a watchlist", () => {
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { kind: "studio" })), [102]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { kind: "director" })), [103]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { categoryId: 10 })), [101, 104]);
    // druh i žánr musí sedět na stejnou kolekci
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { kind: "studio", categoryId: 10 })), []);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { watchlistOnly: true, watchlist: new Set([102, 103]) })), [102, 103]);
    assert.deepEqual(ids(filterComingSoon(ENTRIES, { watchlistOnly: false, watchlist: new Set([102]) })), [101, 102, 103, 104]);
});

test("soon: počty u záložek a žánrů", () => {
    const facets = soonFacets(ENTRIES, { kind: "series" }, KINDS, CATEGORIES);
    assert.equal(facets.all, 4);
    assert.equal(facets.kinds.get("series"), 3);
    assert.equal(facets.kinds.get("director"), 1);
    assert.equal(facets.kinds.get("path"), 0);
    // žánry podle zvoleného druhu (Series): superhero 2, scifi 1 (Avatar), animation 0
    assert.equal(facets.allCategories, 3);
    assert.equal(facets.categories.get(10), 2);
    assert.equal(facets.categories.get(30), 1);
    assert.equal(facets.categories.get(20), 0);
    // text platí pro všechny počty
    const searched = soonFacets(ENTRIES, { query: "avatar" }, KINDS, CATEGORIES);
    assert.equal(searched.all, 1);
    assert.equal(searched.kinds.get("director"), 1);
});

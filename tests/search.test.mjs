// Hledání (search.js): normalizace textu a pořadí výsledků.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { normalize, parseQuery, buildSearchIndex, searchFilms } = await import(web("search.js"));

test("normalize – diakritika, apostrofy, interpunkce", () => {
    assert.equal(normalize("Bram Stoker's Dracula"), "bram stokers dracula");
    assert.equal(normalize("Amélie"), "amelie");
    assert.equal(normalize("Spider-Man: No Way Home"), "spider man no way home");
    assert.equal(normalize("Fast & Furious"), "fast and furious");
    assert.equal(normalize(null), "");
});

test("prázdný dotaz = žádné hledání", () => {
    assert.equal(parseQuery("   "), null);
    assert.deepEqual(parseQuery("Alien 1979").tokens, ["alien", "1979"]);
});

const film = (tmdbId, title, date) => ({ tmdb_id: tmdbId, title, original_title: title, release_date: date, runtime: 100 });
const universe = { id: 1, slug: "alien", name: "Alien", sort_order: 1, description: "" };
const index = buildSearchIndex([universe], [
    { universe_id: 1, film: film(1, "Alien", "1979-05-25") },
    { universe_id: 1, film: film(2, "Aliens", "1986-07-18") },
    { universe_id: 1, film: film(3, "Alien³", "1992-05-22") },
    { universe_id: 1, film: film(4, "Spider-Man", "2002-05-03") },
]);
const titles = (query) => searchFilms(index, parseQuery(query)).map((r) => r.entry.film.title);

test("přesná shoda první, pak starší filmy dřív", () => {
    assert.deepEqual(titles("alien"), ["Alien", "Aliens", "Alien³"]);
});

test("slepený název a rok", () => {
    assert.deepEqual(titles("spiderman"), ["Spider-Man"]);
    assert.deepEqual(titles("1986"), ["Aliens"]);
    assert.deepEqual(titles("alien3"), ["Alien³"]);          // „³“ se normalizuje na „3“
});

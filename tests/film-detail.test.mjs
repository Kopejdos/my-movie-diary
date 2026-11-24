// Detail filmu (V4.4.6): odkazy na trailer, výběr popisu, kolekce filmu.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const {
    isTrailerKey, youtubeUrl, youtubeSearchUrl, tmdbUrl, pickOverview, needsTrailerLookup, collectionsOf,
} = await import(web("film-detail-data.js"));

test("klíč traileru – jen bezpečné znaky YouTube", () => {
    assert.equal(isTrailerKey("dQw4w9WgXcQ"), true);
    assert.equal(isTrailerKey("abc"), false);
    assert.equal(isTrailerKey("x\"><script>"), false);
    assert.equal(isTrailerKey(null), false);
    assert.equal(youtubeUrl("dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(youtubeUrl("bad key!"), null);
});

test("hledání traileru – původní název, rok a „trailer“", () => {
    const url = youtubeSearchUrl({ title: "Jak svět přichází o básníky", original_title: "Jak svět přichází o básníky", release_date: "1982-11-01" });
    assert.equal(url, "https://www.youtube.com/results?search_query=" + encodeURIComponent("Jak svět přichází o básníky 1982 trailer"));
    assert.ok(youtubeSearchUrl({ title: "Alien" }).endsWith(encodeURIComponent("Alien trailer")));
    assert.equal(tmdbUrl(1271), "https://www.themoviedb.org/movie/1271");
});

test("popis – překlad, jinak anglický, jinak nic", () => {
    assert.equal(pickOverview({ overview: "English." }, { overview: "Česky." }), "Česky.");
    assert.equal(pickOverview({ overview: "English." }, { overview: "  " }), "English.");
    assert.equal(pickOverview({ overview: "English." }, null), "English.");
    assert.equal(pickOverview({}, null), null);
});

test("dohledání traileru – jen bez klíče a ne dřív než po 30 dnech", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    assert.equal(needsTrailerLookup({ trailer_key: "dQw4w9WgXcQ" }, now), false);
    assert.equal(needsTrailerLookup({}, now), true);                               // ještě nehledaný / stará databáze
    assert.equal(needsTrailerLookup({ trailer_checked_at: "2026-11-20T00:00:00Z" }, now), false);
    assert.equal(needsTrailerLookup({ trailer_checked_at: "2026-09-01T00:00:00Z" }, now), true);
    assert.equal(needsTrailerLookup(null, now), false);
});

test("kolekce filmu – v pořadí přehledu, každá jednou", () => {
    const universes = [{ id: 1, slug: "a" }, { id: 2, slug: "b" }, { id: 3, slug: "c" }];
    const items = [
        { universe_id: 3, film: { tmdb_id: 10 } },
        { universe_id: 1, film: { tmdb_id: 10 } },
        { universe_id: 1, film: { tmdb_id: 10 } },
        { universe_id: 2, film: { tmdb_id: 11 } },
    ];
    assert.deepEqual(collectionsOf(10, { universes, items }).map((u) => u.slug), ["a", "c"]);
    assert.deepEqual(collectionsOf(99, { universes, items }), []);
    assert.deepEqual(collectionsOf(10), []);
});

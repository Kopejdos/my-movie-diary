// Balíček kolekcí do seedu (V4.3.2, scripts/add-pack.mjs): nové kolekce na konec, úpravy
// existujících, ostatní řádky beze změny, opakované spuštění nic nepřidá.
import "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyPack, insertAfter } from "../scripts/add-pack.mjs";

const SEED = [
    "{",
    '  "_comment": "test",',
    '  "universes": [',
    "    {",
    '      "slug": "alpha",',
    '      "name": "Alpha",',
    '      "kind": "series",',
    '      "categories": ["action-adventure"],',
    '      "description": "Old text",',
    '      "films": [',
    '        { "title": "One", "year": 2001 }',
    "      ]",
    "    },",
    "    {",
    '      "slug": "beta",',
    '      "name": "Beta",',
    '      "films": [',
    '        { "title": "Two", "year": 2002, "tmdb": 2 }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
].join("\n");

const PACK = {
    update: { alpha: { addCategories: ["western"], description: "New text" }, beta: { addCategories: ["comedy"] }, missing: { addCategories: ["x"] } },
    universes: [
        { slug: "gamma", name: "Gamma", kind: "genre", categories: ["western"], color: "#123456", films: [{ title: "Three", year: 2003, group: "Together" }] },
        { slug: "beta", name: "Beta again", films: [] },
    ],
};

test("add-pack: nové kolekce na konec, úpravy existujících, platný JSON", () => {
    const { text, added, updated, skipped } = applyPack(SEED, PACK);
    const seed = JSON.parse(text);
    assert.deepEqual(added, ["gamma"]);
    assert.deepEqual(updated, ["alpha", "beta"]);
    assert.deepEqual(skipped.sort(), ["beta", "missing"]);
    assert.deepEqual(seed.universes.map((u) => u.slug), ["alpha", "beta", "gamma"]);
    assert.deepEqual(seed.universes[0].categories, ["action-adventure", "western"]);
    assert.equal(seed.universes[0].description, "New text");
    assert.deepEqual(seed.universes[1].categories, ["comedy"]);          // řádek přibyl před "films"
    assert.equal(seed.universes[2].films[0].group, "Together");
    // Ostatní řádky beze změny, nový film ve stylu seedu
    assert.ok(text.includes('        { "title": "One", "year": 2001 }'));
    assert.ok(text.includes('        { "title": "Three", "year": 2003, "group": "Together" }'));
    assert.ok(text.includes('      "categories": ["action-adventure", "western"],'));
});

test("add-pack: podruhé nic nezmění", () => {
    const once = applyPack(SEED, PACK).text;
    const twice = applyPack(once, PACK);
    assert.equal(twice.text, once);
    assert.deepEqual(twice.added, []);
    assert.deepEqual(twice.updated, []);
});

test("add-pack: zachová konce řádků Windows (CRLF)", () => {
    const { text } = applyPack(SEED.replace(/\n/g, "\r\n"), PACK);
    assert.ok(!/[^\r]\n/.test(text));
    JSON.parse(text);
});

test("balíček V4.3.2: platný, kolekce mají kategorii western a filmy s rokem", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.3.2-westerns.json", import.meta.url), "utf8"));
    for (const universe of pack.universes) {
        assert.ok(universe.categories.includes("western"), universe.slug);
        assert.ok(universe.films.length >= 3, universe.slug);
        for (const film of universe.films) assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
    }
});

test("balíček V4.3.5: režiséři mají typ director a filmy po desetiletích, cesty mají poznámky", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.3.5-directors.json", import.meta.url), "utf8"));
    const kinds = new Set(["series", "studio", "genre", "path", "director"]);
    assert.equal(pack.update["sergio-leone"].kind, "director");
    assert.equal(pack.universes.filter((u) => u.kind === "director").length, 10);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        assert.ok(kinds.has(universe.kind), universe.slug);
        assert.ok(universe.categories.length > 0 && universe.description, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            if (universe.kind === "director") assert.equal(film.group, `${Math.floor(film.year / 10) * 10}s`, `${universe.slug}: ${film.title}`);
            if (universe.kind === "path") assert.ok(film.note && film.note.length <= 300, `${universe.slug}: ${film.title}`);
        }
    }
    // Vítězové Oscara za nejlepší film: 98 ročníků (1927 – 2025), jeden film za ročník
    assert.equal(pack.universes.find((u) => u.slug === "best-picture-winners").films.length, 98);
});

test("balíček V4.3.6: platný, bez kolekcí, které už v katalogu jsou, cesta s poznámkami", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.3.6-series-monsters.json", import.meta.url), "utf8"));
    const kinds = new Set(["series", "studio", "genre", "path", "director"]);
    // Přidal je kamarád přes požadavky před V4.3.6 – v balíčku být nesmí
    const already = ["scary-movie", "hellraiser", "the-exorcist", "the-omen", "rec", "the-chronicles-of-riddick", "pacific-rim"];
    const slugs = pack.universes.map((u) => u.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of already) assert.ok(!slugs.includes(slug), slug);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        assert.ok(kinds.has(universe.kind) && universe.categories.length > 0 && universe.description, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            if (universe.kind === "path") assert.ok(film.note && film.note.length <= 300, `${universe.slug}: ${film.title}`);
        }
        assert.ok(universe.films.some((f) => !f.optional), `${universe.slug}: žádný povinný film`);
    }
});

test("balíček V4.3.7: anime a česká klasika v nových kategoriích, Studio Ghibli dostane Anime", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.3.7-anime-czech.json", import.meta.url), "utf8"));
    assert.deepEqual(pack.update["studio-ghibli"].addCategories, ["anime"]);
    const slugs = pack.universes.map((u) => u.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        assert.ok(universe.categories.length > 0 && universe.description, universe.slug);
        // Každá kolekce je v nové kategorii, kromě irského studia Cartoon Saloon (Animation)
        if (universe.slug !== "cartoon-saloon") {
            assert.ok(universe.categories.includes("anime") || universe.categories.includes("czech-slovak"), universe.slug);
        }
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            if (universe.kind === "path") assert.ok(film.note && film.note.length <= 300, `${universe.slug}: ${film.title}`);
        }
        assert.ok(universe.films.some((f) => !f.optional), `${universe.slug}: žádný povinný film`);
    }
});

test("balíček V4.3.8: 19 žánrových výběrů a 2 cesty v existujících kategoriích", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.3.8-genre-picks.json", import.meta.url), "utf8"));
    const categories = new Set(["superhero", "scifi", "fantasy", "animation", "anime", "family", "action-adventure", "comedy",
        "drama", "crime-thriller", "war", "western", "horror", "czech-slovak"]);
    assert.equal(pack.universes.filter((u) => u.kind === "genre").length, 19);
    assert.equal(pack.universes.filter((u) => u.kind === "path").length, 2);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        // Bez migrace – jen kategorie, které už v databázi jsou
        assert.ok(universe.categories.length > 0 && universe.categories.every((c) => categories.has(c)), universe.slug);
        assert.ok(universe.films.length >= 10 && universe.films.length <= 17, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            if (universe.kind === "path") assert.ok(film.note && film.note.length <= 300, `${universe.slug}: ${film.title}`);
        }
    }
});

test("balíček V4.4.1: animáky ve 28 kolekcích, úpravy kolekcí z kontroly seedu", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.4.1-animation.json", import.meta.url), "utf8"));
    const categories = new Set(["superhero", "scifi", "fantasy", "animation", "anime", "family", "action-adventure", "comedy",
        "drama", "crime-thriller", "war", "western", "horror", "czech-slovak"]);
    const kinds = new Set(["series", "studio", "genre", "path", "director"]);
    assert.equal(pack.universes.length, 28);
    const slugs = pack.universes.map((u) => u.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        assert.ok(kinds.has(universe.kind), universe.slug);
        // Bez migrace – jen kategorie, které už v databázi jsou
        assert.ok(universe.categories.length > 0 && universe.categories.every((c) => categories.has(c)), universe.slug);
        assert.match(universe.color, /^#[0-9a-f]{6}$/, universe.slug);
        assert.ok(universe.description && universe.description.length <= 160, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
        }
        assert.ok(universe.films.some((f) => !f.optional), `${universe.slug}: žádný povinný film`);
    }
    // Režiséři po desetiletích
    for (const universe of pack.universes.filter((u) => u.kind === "director")) {
        assert.ok(universe.films.every((f) => /^\d{4}s$/.test(f.group)), universe.slug);
    }
    // Úpravy: dvě kolekce přejdou na žánrový výběr, popisy jen krátké
    assert.equal(pack.update["r-and-revenge"].kind, "genre");
    assert.equal(pack.update["new-french-extremity"].kind, "genre");
    for (const [slug, change] of Object.entries(pack.update)) {
        assert.ok(Object.keys(change).every((key) => ["kind", "description"].includes(key)), slug);
        assert.ok(change.description.length <= 160, slug);
    }
});

test("balíček V4.4.2: 16 režisérů po desetiletích, přes 40 sérií, Neon a 6 výběrů", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.4.2-directors-series.json", import.meta.url), "utf8"));
    const categories = new Set(["superhero", "scifi", "fantasy", "animation", "anime", "family", "action-adventure", "comedy",
        "drama", "crime-thriller", "war", "western", "horror", "czech-slovak"]);
    const count = (kind) => pack.universes.filter((u) => u.kind === kind).length;
    assert.equal(count("director"), 16);
    assert.equal(count("studio"), 1);
    assert.equal(count("genre"), 6);
    assert.ok(count("series") >= 40);
    const slugs = pack.universes.map((u) => u.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        // Bez migrace – jen kategorie, které už v databázi jsou
        assert.ok(universe.categories.length > 0 && universe.categories.every((c) => categories.has(c)), universe.slug);
        assert.match(universe.color, /^#[0-9a-f]{6}$/, universe.slug);
        assert.ok(universe.description && universe.description.length <= 160, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            // Desetiletí režiséra odpovídá roku filmu
            if (universe.kind === "director") assert.equal(film.group, `${Math.floor(film.year / 10) * 10}s`, `${universe.slug}: ${film.title}`);
        }
        assert.ok(universe.films.some((f) => !f.optional), `${universe.slug}: žádný povinný film`);
    }
});

test("balíček V4.4.3: AFI 100 v pořadí, 70 oscarových mezinárodních filmů se zemí, 14 režisérů", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.4.3-lists-masters.json", import.meta.url), "utf8"));
    const categories = new Set(["superhero", "scifi", "fantasy", "animation", "anime", "family", "action-adventure", "comedy",
        "drama", "crime-thriller", "war", "western", "horror", "czech-slovak"]);
    const afi = pack.universes.find((u) => u.slug === "afi-100");
    assert.equal(afi.films.length, 100);
    assert.deepEqual(afi.films.map((f) => f.label), afi.films.map((_, i) => `#${i + 1}`));
    const intl = pack.universes.find((u) => u.slug === "best-international-feature-winners");
    assert.equal(intl.films.length, 70);
    assert.ok(intl.films.every((f) => f.label && f.group === `${Math.floor(f.year / 10) * 10}s`));
    assert.equal(pack.universes.filter((u) => u.kind === "director").length, 14);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        assert.ok(universe.categories.length > 0 && universe.categories.every((c) => categories.has(c)), universe.slug);
        assert.match(universe.color, /^#[0-9a-f]{6}$/, universe.slug);
        assert.ok(universe.description && universe.description.length <= 160, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            if (universe.kind === "director") assert.equal(film.group, `${Math.floor(film.year / 10) * 10}s`, `${universe.slug}: ${film.title}`);
        }
    }
});

test("balíček V4.4.4: 10 kinematografií zemí a 40 režisérů po desetiletích", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.4.4-world-directors.json", import.meta.url), "utf8"));
    const categories = new Set(["superhero", "scifi", "fantasy", "animation", "anime", "family", "action-adventure", "comedy",
        "drama", "crime-thriller", "war", "western", "horror", "czech-slovak"]);
    assert.equal(pack.universes.filter((u) => u.kind === "genre" && u.slug.startsWith("cinema-")).length, 10);
    assert.equal(pack.universes.filter((u) => u.kind === "director").length, 40);
    const slugs = pack.universes.map((u) => u.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const universe of pack.universes) {
        assert.match(universe.slug, /^[a-z0-9-]{2,40}$/, universe.slug);
        // Bez migrace – jen kategorie, které už v databázi jsou
        assert.ok(universe.categories.length > 0 && universe.categories.every((c) => categories.has(c)), universe.slug);
        assert.match(universe.color, /^#[0-9a-f]{6}$/, universe.slug);
        assert.ok(universe.description && universe.description.length <= 160, universe.slug);
        const keys = universe.films.map((f) => `${f.title}|${f.year}`);
        assert.equal(new Set(keys).size, keys.length, `${universe.slug}: film dvakrát`);
        for (const film of universe.films) {
            assert.ok(film.title && Number.isInteger(film.year), `${universe.slug}: ${film.title}`);
            assert.equal(film.group, `${Math.floor(film.year / 10) * 10}s`, `${universe.slug}: ${film.title}`);
        }
        assert.ok(universe.films.some((f) => !f.optional), `${universe.slug}: žádný povinný film`);
    }
});

test("add-pack: addFilms přidá filmy na konec kolekce, existující přeskočí (V4.4.5)", () => {
    const pack = { update: { alpha: { addFilms: [{ title: "One", year: 2001 }, { title: "Four", year: 2027, group: "2020s" }] } } };
    const { text, updated } = applyPack(SEED, pack);
    assert.deepEqual(updated, ["alpha"]);
    const alpha = JSON.parse(text).universes.find((u) => u.slug === "alpha");
    assert.deepEqual(alpha.films, [{ title: "One", year: 2001 }, { title: "Four", year: 2027, group: "2020s" }]);
    assert.ok(text.includes('        { "title": "One", "year": 2001 },\n        { "title": "Four", "year": 2027, "group": "2020s" }\n      ]'));
    // podruhé nic
    const again = applyPack(text, pack);
    assert.equal(again.text, text);
    assert.deepEqual(again.updated, []);
});

test("balíček V4.4.5: jen addFilms do existujících kolekcí, filmy s rokem", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.4.5-coming-soon.json", import.meta.url), "utf8"));
    assert.equal(pack.universes, undefined);
    for (const [slug, change] of Object.entries(pack.update)) {
        assert.deepEqual(Object.keys(change), ["addFilms"], slug);
        for (const film of change.addFilms) {
            assert.ok(film.title && Number.isInteger(film.year) && film.year >= 2026, `${slug}: ${film.title}`);
            if (film.group) assert.equal(film.group, `${Math.floor(film.year / 10) * 10}s`, `${slug}: ${film.title}`);
        }
    }
});

const GROUPED = [
    "{",
    '  "universes": [',
    "    {",
    '      "slug": "duo",',
    '      "name": "Duo",',
    '      "films": [',
    '        { "title": "T1", "year": 1970, "group": "Together" },',
    '        { "title": "B1", "year": 1973, "group": "Bud" },',
    '        { "title": "B2", "year": 1980, "group": "Bud" },',
    '        { "title": "H1", "year": 1975, "group": "Hill" },',
    '        { "title": "H2", "year": 1990, "group": "Hill" }',
    "      ]",
    "    },",
    "    {",
    '      "slug": "robots",',
    '      "name": "Robots",',
    '      "films": [',
    '        { "title": "R1", "year": 1986 },',
    '        { "title": "R2", "year": 2004, "tmdb": 5 },',
    '        { "title": "R3", "year": 2024 }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
].join("\n");

test("add-pack: addFilms zařadí film do jeho skupiny a podle roku (V4.4.6)", () => {
    const pack = { update: {
        duo: { addFilms: [
            { title: "B0", year: 1977, group: "Bud" },      // doprostřed skupiny Bud
            { title: "H0", year: 1972, group: "Hill" },     // na začátek skupiny Hill
            { title: "H9", year: 2018, group: "Hill" },     // na konec kolekce
            { title: "N1", year: 2000, group: "New" },      // nová skupina na konec
        ] },
        robots: { addFilms: [{ title: "R0", year: 1988 }, { title: "R9", year: 2011 }] },
    } };
    const { text } = applyPack(GROUPED, pack);
    const seed = JSON.parse(text);
    assert.deepEqual(seed.universes[0].films.map((f) => f.title), ["T1", "B1", "B0", "B2", "H0", "H1", "H2", "H9", "N1"]);
    assert.deepEqual(seed.universes[1].films.map((f) => f.title), ["R1", "R0", "R2", "R9", "R3"]);
    // čárky sedí (platný JSON výše) a poslední film je bez čárky
    assert.ok(text.includes('        { "title": "N1", "year": 2000, "group": "New" }\n      ]'));
    assert.equal(applyPack(text, pack).text, text);
});

test("add-pack: insertAfter – neseřazená kolekce a film bez roku jdou na konec", () => {
    const rows = [{ index: 5, film: { title: "A", year: 2000 } }, { index: 6, film: { title: "B", year: 1990 } }];
    assert.equal(insertAfter(rows, { title: "X", year: 1995 }), 6);
    assert.equal(insertAfter([{ index: 5, film: { title: "A", year: 2000 } }], { title: "X" }), 5);
    assert.equal(insertAfter([], { title: "X", year: 2000 }), null);
    assert.equal(insertAfter([{ index: 5, film: { title: "A", year: 2000 } }], { title: "X", year: 1990 }), 4);
});

test("add-pack: fix doplní tmdb a přejmenuje film ve všech kolekcích (V4.4.6)", () => {
    const pack = { fix: [
        { title: "B1", year: 1973, tmdb: 46091 },
        { title: "R2", year: 2004, tmdb: 7 },                         // nahradí staré tmdb
        { title: "R3", year: 2024, newTitle: "R3 Renamed" },
        { title: "Missing", year: 1999, tmdb: 1 },
    ] };
    const { text, fixed, updated } = applyPack(GROUPED, pack);
    const seed = JSON.parse(text);
    assert.deepEqual(fixed, ["duo", "robots"]);
    assert.deepEqual(updated, []);
    assert.ok(text.includes('        { "title": "B1", "year": 1973, "tmdb": 46091, "group": "Bud" },'));
    assert.ok(text.includes('        { "title": "R2", "year": 2004, "tmdb": 7 },'));
    assert.equal(seed.universes[1].films[2].title, "R3 Renamed");
    // znovu: nic dalšího, B1 už tmdb má (R3 se podruhé nenajde – už je přejmenovaný)
    const again = applyPack(text, pack);
    assert.equal(again.text, text);
    assert.deepEqual(again.fixed, ["duo", "robots"]);           // znovu naimportovat smí
});

test("nextGoal: 2 000, pak po 500", async () => {
    const { nextGoal } = await import("../web/js/admin.js");
    assert.equal(nextGoal(1264), 2000);
    assert.equal(nextGoal(2000), 2500);
    assert.equal(nextGoal(2499), 2500);
    assert.equal(nextGoal(2500), 3000);
});

test("balíček V4.4.6: opravy s ověřeným ID, filmy do skupin, nová série", () => {
    const pack = JSON.parse(readFileSync(new URL("../supabase/packs/v4.4.6-fixes.json", import.meta.url), "utf8"));
    const keys = new Set();
    for (const fix of pack.fix) {
        assert.ok(fix.title && Number.isInteger(fix.year), fix.title);
        assert.ok(fix.tmdb === undefined || (Number.isInteger(fix.tmdb) && fix.tmdb > 0), fix.title);
        const key = `${fix.title}|${fix.year}`;
        assert.ok(!keys.has(key), `dvakrát: ${key}`);
        keys.add(key);
    }
    const duo = pack.update["bud-spencer-terence-hill"].addFilms;
    for (const film of duo) assert.ok(["Bud Spencer", "Terence Hill"].includes(film.group), film.title);
    assert.deepEqual(pack.universes.map((u) => u.slug), ["short-circuit"]);

    // Použití na malý seed: oprava doplní tmdb, filmy se zařadí do skupiny podle roku
    const seed = [
        "{",
        '  "universes": [',
        "    {",
        '      "slug": "bud-spencer-terence-hill",',
        '      "name": "Bud Spencer & Terence Hill",',
        '      "films": [',
        '        { "title": "Ace High", "year": 1968, "group": "Together" },',
        '        { "title": "Flatfoot", "year": 1973, "group": "Bud Spencer" },',
        '        { "title": "Banana Joe", "year": 1982, "group": "Bud Spencer" },',
        '        { "title": "My Name Is Nobody", "year": 1973, "group": "Terence Hill" },',
        '        { "title": "Don Camillo", "year": 1983, "group": "Terence Hill", "optional": true }',
        "      ]",
        "    },",
        "    {",
        '      "slug": "300",',
        '      "name": "300",',
        '      "films": [',
        '        { "title": "300", "year": 2006 }',
        "      ]",
        "    }",
        "  ]",
        "}",
        "",
    ].join("\n");
    const result = applyPack(seed, { fix: pack.fix, update: { "bud-spencer-terence-hill": pack.update["bud-spencer-terence-hill"] } });
    const parsed = JSON.parse(result.text);
    const duoFilms = parsed.universes[0].films.map((f) => `${f.group}:${f.title}`);
    assert.deepEqual(duoFilms.slice(0, 2), ["Together:Ace High", "Bud Spencer:Flatfoot"]);
    assert.ok(duoFilms.indexOf("Bud Spencer:Charleston") < duoFilms.indexOf("Bud Spencer:Banana Joe"));
    assert.ok(duoFilms.indexOf("Terence Hill:Man of the East") < duoFilms.indexOf("Terence Hill:My Name Is Nobody"));
    assert.equal(duoFilms.at(-1), "Terence Hill:My Name Is Thomas");
    assert.equal(parsed.universes[1].films[0].tmdb, 1271);
    assert.deepEqual(result.fixed.sort(), ["300", "bud-spencer-terence-hill"]);
});

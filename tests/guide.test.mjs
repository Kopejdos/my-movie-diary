// Průvodce pro nováčky (V4.3.4): která prohlídka se kde spustí, kroky pro nepřihlášené
// a zapamatování („už viděl“) – i bez úložiště.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { TOURS, GUIDE_KEY, GUIDE_VERSION, tourFor, stepsFor, loadSeen, markSeen, resetSeen } = await import(web("guide.js"));
const EN = (await import(web("i18n/en.js"))).default;

/** Úložiště v paměti (jako localStorage). */
function fakeStorage() {
    const data = new Map();
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        data,
    };
}

test("tourFor: přehled pro každého, kolekce jen přihlášenému, viděné ne", () => {
    assert.equal(tourFor("/", false, {}), "overview");
    assert.equal(tourFor("/", true, {}), "overview");
    assert.equal(tourFor("/collection/alien", false, {}), null);
    assert.equal(tourFor("/collection/alien", true, {}), "collection");
    assert.equal(tourFor("/search", true, {}), null);
    assert.equal(tourFor("/", true, { overview: GUIDE_VERSION }), null);
    assert.equal(tourFor("/collection/alien", true, { collection: GUIDE_VERSION }), null);
    assert.equal(tourFor("/", true, { overview: GUIDE_VERSION - 1 }), "overview");    // starší verze prohlídky
});

test("stepsFor: nepřihlášený nevidí kroky watchlistu, požadavků a profilu", () => {
    const guest = stepsFor("overview", false).map((step) => step.id);
    const user = stepsFor("overview", true).map((step) => step.id);
    for (const id of ["watchlist", "requests", "profile"]) {
        assert.ok(!guest.includes(id), id);
        assert.ok(user.includes(id), id);
    }
    assert.equal(guest[0], "welcome");
    assert.equal(guest.at(-1), "done");
});

test("každý krok má texty ve slovníku a poslední je final", () => {
    for (const [name, tour] of Object.entries(TOURS)) {
        for (const step of tour.steps) {
            for (const key of [step.title, step.text, step.guestText].filter(Boolean)) {
                assert.equal(typeof EN[key], "string", `${name}.${step.id}: ${key}`);
            }
        }
        assert.ok(tour.steps.at(-1).final, name);
    }
});

test("markSeen / resetSeen: zapamatuje si prohlídku a dá se ukázat znovu", () => {
    const storage = fakeStorage();
    assert.deepEqual(loadSeen(storage), {});
    markSeen("overview", storage);
    assert.equal(JSON.parse(storage.data.get(GUIDE_KEY)).overview, GUIDE_VERSION);
    assert.equal(tourFor("/", true, loadSeen(storage)), null);
    resetSeen(["overview"], storage);
    assert.equal(tourFor("/", true, loadSeen(storage)), "overview");
});

test("bez úložiště (soukromé okno) se prohlídka ukáže jen jednou za návštěvu", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    resetSeen(["collection"], broken);
    assert.equal(tourFor("/collection/x", true, loadSeen(broken)), "collection");
    markSeen("collection", broken);
    assert.equal(tourFor("/collection/x", true, loadSeen(broken)), null);
});

// Překlady kolekcí (V4.3.4): co web ukazuje (oprava z databáze → soubor → angličtina), rozdíly
// proti návrhům z TMDB a co uložit po ruční úpravě v admin panelu.
import "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const {
    sameName, buildTranslationState, differingSuggestion, planTranslationSave,
} = await import("../web/js/collection-texts.js");
const { mergeCollections } = await import("../web/js/catalog-i18n.js");

const UNIVERSES = [
    { id: 1, slug: "happy-death-day", name: "Happy Death Day", description: "Same birthday.", kind: "series" },
    { id: 2, slug: "alien", name: "Alien", description: "In space.", kind: "series" },
    { id: 3, slug: "jurassic-park", name: "Jurassic Park", description: "Dinosaurs.", kind: "series" },
];
const FILES = {
    cs: { collections: {
        "happy-death-day": { name: "Šťastný den smrti", description: "Pořád tytéž narozeniny." },
        alien: { name: "Vetřelec" },
    } },
};
const SUGGESTIONS = new Map([
    [1, { names: { cs: { name: "Všechno nejhorší", from: "series" } } }],
    [2, { names: { cs: { name: "Vetřelec!", from: "series" }, de: { name: "Alien", from: "series" } } }],
    [3, { names: { cs: { name: "Jurský park", from: "series" } } }],
]);

test("sameName: bez ohledu na velikost písmen a interpunkci, diakritika se počítá", () => {
    assert.ok(sameName("Smrtonosná past", "smrtonosná  past!"));
    assert.ok(sameName("Rychle & zběsile", "Rychle zběsile"));
    assert.ok(!sameName("Smrtonosna past", "Smrtonosná past"));
    assert.ok(!sameName("Rychle a zběsile", "Rychle a zběsile 2"));
});

test("buildTranslationState: databáze → soubor → angličtina, se stavem", () => {
    const rows = [{ universe_id: 3, lang: "cs", name: "Jurský park", description: null, source: "tmdb" }];
    const [hdd, alien, jurassic] = buildTranslationState(UNIVERSES, rows, FILES);
    assert.equal(hdd.langs.cs.name, "Šťastný den smrti");
    assert.equal(hdd.langs.cs.status, "file");
    assert.equal(hdd.langs.de.name, null);
    assert.equal(hdd.langs.de.status, "english");
    assert.equal(alien.langs.cs.description, null);
    assert.equal(jurassic.langs.cs.name, "Jurský park");
    assert.equal(jurassic.langs.cs.status, "tmdb");
});

test("differingSuggestion: jen skutečný rozdíl a ne u ručně potvrzeného názvu", () => {
    const state = buildTranslationState(UNIVERSES, [], FILES);
    assert.equal(differingSuggestion(state[0], "cs", SUGGESTIONS)?.name, "Všechno nejhorší");
    assert.equal(differingSuggestion(state[1], "cs", SUGGESTIONS), null);      // „Vetřelec!“ = „Vetřelec“
    assert.equal(differingSuggestion(state[1], "de", SUGGESTIONS), null);      // anglicky „Alien“ = návrh
    assert.equal(differingSuggestion(state[2], "cs", SUGGESTIONS)?.name, "Jurský park");
    assert.equal(differingSuggestion(state[0], "cs", null), null);             // bez kontroly nic

    const kept = buildTranslationState(UNIVERSES,
        [{ universe_id: 1, lang: "cs", name: "Šťastný den smrti", description: null, source: "manual" }], FILES);
    assert.equal(differingSuggestion(kept[0], "cs", SUGGESTIONS), null);
});

test("planTranslationSave: beze změny nic, návrat na soubor smaže opravu, popis ze souboru se neukládá", () => {
    const [hdd] = buildTranslationState(UNIVERSES, [], FILES);
    const cs = hdd.langs.cs;
    assert.deepEqual(planTranslationSave(cs, "Šťastný den smrti", "Pořád tytéž narozeniny."), { action: "none" });
    assert.deepEqual(planTranslationSave(cs, " Všechno  nejhorší ", "Pořád tytéž narozeniny."),
        { action: "upsert", name: "Všechno nejhorší", description: null, source: "manual" });

    const [edited] = buildTranslationState(UNIVERSES,
        [{ universe_id: 1, lang: "cs", name: "Všechno nejhorší", description: "Nový popis", source: "manual" }], FILES);
    assert.deepEqual(planTranslationSave(edited.langs.cs, "Šťastný den smrti", "Pořád tytéž narozeniny."), { action: "delete" });
    assert.deepEqual(planTranslationSave(edited.langs.cs, "Všechno nejhorší", "Jiný popis"),
        { action: "upsert", name: "Všechno nejhorší", description: "Jiný popis", source: "manual" });

    const [, , jurassic] = buildTranslationState(UNIVERSES, [], FILES);
    assert.deepEqual(planTranslationSave(jurassic.langs.de, "", ""), { action: "none" });
    assert.equal(planTranslationSave(jurassic.langs.cs, "x".repeat(100), "").name.length, 80);
});

test("mergeCollections: oprava z databáze má přednost po polích", () => {
    const merged = mergeCollections(FILES.cs.collections, {
        "happy-death-day": { name: "Všechno nejhorší" },
        "jurassic-park": { name: "Jurský park", description: "Dinosauři." },
    });
    assert.deepEqual(merged["happy-death-day"], { name: "Všechno nejhorší", description: "Pořád tytéž narozeniny." });
    assert.deepEqual(merged["jurassic-park"], { name: "Jurský park", description: "Dinosauři." });
    assert.deepEqual(merged.alien, { name: "Vetřelec" });
    assert.deepEqual(mergeCollections(FILES.cs.collections, null), FILES.cs.collections);
});

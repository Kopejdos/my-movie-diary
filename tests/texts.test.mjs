// Slovníky jazyků (V4.2): každý jazyk má všechny texty uživatelské části (admin zůstává anglicky),
// stejné zástupné znaky {0}, {1}… jako angličtina a tvary podle počtu pro svá pravidla.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const LANGUAGES = ["cs", "de", "es", "uk"];
const LOCALES = { cs: "cs-CZ", de: "de-DE", es: "es-ES", uk: "uk-UA" };
const EN = (await import(web("i18n/en.js"))).default;

/** Zástupné znaky v textu (i v polích a tvarech podle počtu), seřazené – „{0}{1}“. */
const placeholders = (value) => (JSON.stringify(value).match(/\{\d+\}/g) ?? []).sort().join("");

for (const lang of LANGUAGES) {
    const dictionary = (await import(web(`i18n/${lang}.js`))).default;

    test(`${lang}: obsahuje všechny texty mimo admin`, () => {
        const missing = Object.keys(EN).filter((key) => !key.startsWith("admin") && !(key in dictionary));
        assert.deepEqual(missing, []);
    });

    test(`${lang}: žádné neznámé klíče`, () => {
        assert.deepEqual(Object.keys(dictionary).filter((key) => !(key in EN)), []);
    });

    test(`${lang}: stejné zástupné znaky jako angličtina`, () => {
        const different = Object.keys(dictionary).filter((key) =>
            typeof EN[key] === "string" && placeholders(EN[key]) !== placeholders(dictionary[key]));
        assert.deepEqual(different, []);
    });

    test(`${lang}: tvary podle počtu pro všechna čísla`, () => {
        const rules = new Intl.PluralRules(LOCALES[lang]);
        for (const key of Object.keys(EN).filter((name) => name.startsWith("plural_"))) {
            for (const count of [0, 1, 2, 3, 5, 11, 21, 22, 25, 101]) {
                const form = dictionary[key][rules.select(count)] ?? dictionary[key].other;
                assert.ok(form?.includes("{0}"), `${key} pro ${count}`);
            }
        }
    });
}

test("texts.js: bez volby jazyka a s anglickým prohlížečem je aplikace anglicky", async () => {
    const { LANG, TEXTS, movies } = await import(web("texts.js"));
    assert.equal(LANG, "en");
    assert.equal(TEXTS.navSearch, "Search");
    assert.equal(movies(1), "1 movie");
    assert.equal(movies(3), "3 movies");
});

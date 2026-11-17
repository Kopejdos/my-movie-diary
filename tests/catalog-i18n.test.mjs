// Přeložená data katalogu (V4.2.2): soubory web/js/i18n/catalog.<jazyk>.json mají správný tvar.
// Nekontroluje se, že každá kolekce z seedu má překlad – co chybí, ukáže se anglicky
// (a nová kolekce z admin panelu nesmí zastavit nasazení).
import "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LANGUAGES = ["cs", "de", "es", "uk"];
const SECTIONS = ["categories", "collections", "notes", "terms"];
const read = (lang) => JSON.parse(readFileSync(new URL(`../web/js/i18n/catalog.${lang}.json`, import.meta.url), "utf8"));

for (const lang of LANGUAGES) {
    test(`catalog.${lang}.json: platný JSON se čtyřmi oddíly`, () => {
        const data = read(lang);
        assert.deepEqual(Object.keys(data).sort(), [...SECTIONS].sort());
    });

    test(`catalog.${lang}.json: žádné prázdné texty, kolekce jen s name / description`, () => {
        const data = read(lang);
        for (const section of ["categories", "notes", "terms"]) {
            for (const [key, value] of Object.entries(data[section])) {
                assert.ok(typeof value === "string" && value.trim() !== "", `${section}.${key}`);
            }
        }
        for (const [slug, text] of Object.entries(data.collections)) {
            assert.match(slug, /^[a-z0-9-]{2,40}$/, slug);
            assert.ok(Object.keys(text).every((key) => key === "name" || key === "description"), slug);
            assert.ok(Object.values(text).every((value) => typeof value === "string" && value.trim() !== ""), slug);
        }
    });
}

test("stejné kolekce a kategorie ve všech jazycích", () => {
    const [first, ...rest] = LANGUAGES.map(read);
    for (const other of rest) {
        assert.deepEqual(Object.keys(other.collections).sort(), Object.keys(first.collections).sort());
        assert.deepEqual(Object.keys(other.categories).sort(), Object.keys(first.categories).sort());
        assert.deepEqual(Object.keys(other.notes).sort(), Object.keys(first.notes).sort());
    }
});

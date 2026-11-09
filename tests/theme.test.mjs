// Kontrast barev kolekcí (V3.6.2): tlačítka v barvě kolekce musí mít text čitelný
// podle WCAG AA (poměr aspoň 4.5 : 1) – i u barev, které by jinak nevyšly (např. červená MCU).
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { inkFor, fillFor } = await import(web("theme.js"));

/** Kontrastní poměr dvou barev #rrggbb podle WCAG. */
function contrast(a, b) {
    const lum = (hex) => {
        const v = parseInt(hex.slice(-6), 16);
        const c = (s) => {
            const x = ((v >> s) & 0xff) / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * c(16) + 0.7152 * c(8) + 0.0722 * c(0);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const readable = (color) => contrast(fillFor(color), inkFor(fillFor(color)));

test("inkFor volí čitelnější z bílé a tmavé", () => {
    assert.equal(inkFor("#ffffff"), "#14181d");
    assert.equal(inkFor("#000000"), "#ffffff");
    assert.equal(inkFor("nesmysl"), "#14181d");
});

test("fillFor nemění barvy, které už kontrast mají", () => {
    assert.equal(fillFor("#1f4e8c"), "#1f4e8c");
    assert.equal(fillFor("#f5c518"), "#f5c518");
});

test("fillFor ztmaví problematické barvy (červená MCU)", () => {
    assert.notEqual(fillFor("#e23636"), "#e23636");
    assert.ok(readable("#e23636") >= 4.5);
});

test("všechny barvy kolekcí v seedu dají čitelné tlačítko", async (t) => {
    let seed;
    try {
        seed = JSON.parse(await readFile(new URL("../supabase/seed/universes.json", import.meta.url), "utf8"));
    } catch {
        t.skip("supabase/seed/universes.json chybí");
        return;
    }
    const universes = Array.isArray(seed) ? seed : seed.universes ?? [];
    const colors = [...new Set(universes.map((u) => u.color).filter(Boolean))];
    assert.ok(colors.length > 0, "seed nemá žádné barvy");
    for (const color of colors) {
        assert.ok(readable(color) >= 4.5, `${color} → ${fillFor(color)} má kontrast jen ${readable(color).toFixed(2)}`);
    }
});

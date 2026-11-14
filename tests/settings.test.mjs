// Nastavení vzhledu (V4.0): výchozí hodnoty, neplatné volby, zápis na <html>.
import { web } from "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { getSettings, setSetting, onSettingsChange, DEFAULT_SETTINGS, SETTING_OPTIONS } = await import(web("settings.js"));

test("bez uloženého nastavení platí výchozí", () => {
    assert.deepEqual(getSettings(), DEFAULT_SETTINGS);
    assert.equal(document.documentElement.dataset.style, "modern");
    assert.equal(document.documentElement.dataset.accent, "collection");
});

test("každá výchozí hodnota je mezi povolenými volbami", () => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        assert.ok(SETTING_OPTIONS[key].includes(value), key);
    }
});

test("změna se zapíše na <html> a ohlásí posluchačům", () => {
    const seen = [];
    const stop = onSettingsChange((s) => seen.push(s.style));
    setSetting("style", "paper");
    setSetting("mode", "light");
    stop();
    assert.equal(document.documentElement.dataset.style, "paper");
    assert.equal(document.documentElement.dataset.theme, "light");
    assert.deepEqual(seen, ["paper", "paper"]);
});

test("neplatná volba se ignoruje", () => {
    const before = getSettings();
    setSetting("accent", "rainbow");
    setSetting("nesmysl", "x");
    assert.deepEqual(getSettings(), before);
});

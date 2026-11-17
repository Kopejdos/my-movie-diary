// Texty rozhraní a jazyk aplikace (V4.2 – angličtina, čeština, němčina, španělština, ukrajinština).
// Slovníky jsou v js/i18n/<jazyk>.js; angličtina je vždy načtená a slouží jako záloha pro chybějící klíče,
// ostatní jazyk se načte před startem aplikace (await níže). Zástupné znaky {0}, {1}… nahrazuje format().

import EN from "./i18n/en.js";

/** Jazyky aplikace – názvy v daném jazyce (do výběru v nastavení). */
export const LANGUAGES = { en: "English", cs: "Čeština", de: "Deutsch", es: "Español", uk: "Українська" };

/** Formát dat a čísel podle jazyka. */
const LOCALES = { en: "en-GB", cs: "cs-CZ", de: "de-DE", es: "es-ES", uk: "uk-UA" };

/**
 * Jazyk: volba v nastavení (mmd-settings.language), jinak podle prohlížeče (slovenština → čeština),
 * jinak angličtina. Čte se přímo z úložiště – texty potřebuje každý modul hned při načtení.
 */
function pickLanguage() {
    let chosen = "auto";
    try {
        chosen = JSON.parse(localStorage.getItem("mmd-settings") ?? "{}")?.language ?? "auto";
    } catch {
        // bez úložiště – podle prohlížeče
    }
    if (chosen in LANGUAGES) return chosen;
    const wanted = (globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? "en"])
        .map((code) => String(code).toLowerCase().split("-")[0])
        .map((code) => (code === "sk" ? "cs" : code));
    return wanted.find((code) => code in LANGUAGES) ?? "en";
}

/** Aktuální jazyk ("en", "cs", …) a locale pro data ("cs-CZ"). */
export const LANG = pickLanguage();
export const LOCALE = LOCALES[LANG];

let translation = {};
if (LANG !== "en") {
    try {
        translation = (await import(`./i18n/${LANG}.js`)).default;
    } catch (error) {
        // offline bez uloženého slovníku – aplikace poběží anglicky
        console.warn(`Language ${LANG} failed to load`, error);
    }
}

/** Všechny texty v aktuálním jazyce (chybějící klíče anglicky). */
export const TEXTS = { ...EN, ...translation };

if (globalThis.document?.documentElement) document.documentElement.lang = LANG;

const pluralRules = new Intl.PluralRules(LOCALE);

/** Text podle počtu: plural("plural_movies", 3) → „3 filmy“ (tvary one / few / many / other). */
export function plural(key, count) {
    const forms = TEXTS[key] ?? EN[key];
    const template = forms?.[pluralRules.select(count)] ?? forms?.other ?? `???${key}???`;
    return template.replace("{0}", String(count));
}

/** „1 collection“ / „12 collections“. */
export const collections = (count) => plural("plural_collections", count);

/** „1 step“ / „12 steps“ – kroky cesty. */
export const steps = (count) => plural("plural_steps", count);

/** „☆ 1 follower“ / „☆ 12 followers“ – sledující seznamu (V4.1.3). */
export const followers = (count) => plural("plural_followers", count);

/** „1 movie“ / „12 movies“ – správný tvar podle počtu. */
export const movies = (count) => plural("plural_movies", count);

/** Číslo podle jazyka: number(57.7, 1) → „57,7“ v češtině, number(1384) → „1 384“. */
export function number(value, digits = 0) {
    return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Měsíc a rok podle jazyka: monthYear("2026-11") → „November 2026“ / „listopad 2026“. */
export function monthYear(isoMonth) {
    const [year, month] = isoMonth.split("-").map(Number);
    return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

/** Vrátí text podle klíče a dosadí parametry: format("listBy", "kopec") → "by @kopec". */
export function format(key, ...args) {
    const template = TEXTS[key] ?? `???${key}???`;
    return template.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)] ?? ""));
}

// Překlady názvů a popisů kolekcí v admin panelu (V4.3.4, záložka Translations) – čistá logika.
//
// Odkud se bere text kolekce v jazyce (stejně jako na webu, catalog-i18n.js):
//   1. oprava v databázi (universe_translations – „manual“ od správce, „tmdb“ převzatý z TMDB),
//   2. soubor web/js/i18n/catalog.<jazyk>.json (výchozí překlady, verzují se s webem),
//   3. angličtina (název kolekce v databázi).
// Kontrola s TMDB (Edge Function admin, collection-names) navrhne název série v jazyce; rozdíl se
// ukáže, dokud ho správce nepřevezme („Use“) nebo nepotvrdí vlastní název („Keep“ = manual).
// Nic nevykresluje ani neukládá.

/** Jazyky s překlady kolekcí (angličtina je originál). */
export const TRANSLATION_LANGS = ["cs", "de", "es", "uk"];

/** Název pro porovnání: malá písmena, bez interpunkce a nadbytečných mezer (diakritika zůstává). */
export function normalizeName(text) {
    return (text ?? "")
        .normalize("NFC")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

/** Jde o stejný název? („Smrtonosná past“ = „Smrtonosná past!“, „Rychle a zběsile“ ≠ „Rychle a zběsile 2“) */
export function sameName(a, b) {
    return normalizeName(a) === normalizeName(b);
}

/**
 * Stav překladů všech kolekcí.
 *   universes – [{ id, slug, name, description, kind }]
 *   rows      – řádky universe_translations [{ universe_id, lang, name, description, source }]
 *   files     – { cs: { collections: { slug: { name?, description? } } }, … }
 * Vrací [{ universe, langs: { cs: { name, description, fileName, fileDescription, row, status } } }],
 * kde name / description = co web právě ukazuje (null = anglicky) a status je
 * "manual" | "tmdb" | "file" | "english".
 */
export function buildTranslationState(universes, rows, files) {
    const rowMap = new Map((rows ?? []).map((row) => [`${row.universe_id}:${row.lang}`, row]));
    return (universes ?? []).map((universe) => {
        const langs = {};
        for (const lang of TRANSLATION_LANGS) {
            const file = files?.[lang]?.collections?.[universe.slug] ?? {};
            const row = rowMap.get(`${universe.id}:${lang}`) ?? null;
            const name = row?.name ?? file.name ?? null;
            const status = row?.name
                ? (row.source === "tmdb" ? "tmdb" : "manual")
                : file.name ? "file" : "english";
            langs[lang] = {
                name,
                description: row?.description ?? file.description ?? null,
                fileName: file.name ?? null,
                fileDescription: file.description ?? null,
                row,
                status,
            };
        }
        return { universe, langs };
    });
}

/**
 * Návrh z TMDB pro kolekci a jazyk, jen když se liší od toho, co web ukazuje
 * (a správce název nepotvrdil ručně). Vrací { name, from } nebo null.
 *   suggestions – Map universe_id → { names: { cs: { name, from } } } (výsledek collection-names)
 */
export function differingSuggestion(entry, lang, suggestions) {
    const suggestion = suggestions?.get(entry.universe.id)?.names?.[lang];
    if (!suggestion?.name) return null;
    const text = entry.langs[lang];
    if (text.status === "manual") return null;
    const shown = text.name ?? entry.universe.name;
    return sameName(shown, suggestion.name) ? null : suggestion;
}

/**
 * Co uložit po úpravě jednoho jazyka v editoru. Vstup: stav jazyka (z buildTranslationState) a nový
 * název a popis z polí. Vrací { action: "none" } | { action: "delete" } |
 * { action: "upsert", name, description, source: "manual" }.
 *   • beze změny → nic,
 *   • vše zase jako v souboru (nebo prázdné) → smazat opravu z databáze (platí zase soubor / angličtina),
 *   • jinak oprava; popis stejný jako v souboru se neukládá (null = vezme se ze souboru).
 */
export function planTranslationSave(text, nameInput, descriptionInput) {
    const name = clean(nameInput, 80);
    const description = clean(descriptionInput, 400);
    if (name === (text.name ?? null) && description === (text.description ?? null)) return { action: "none" };
    const backToFile = name === (text.fileName ?? null) && description === (text.fileDescription ?? null);
    if (backToFile || (name === null && description === null)) {
        return text.row ? { action: "delete" } : { action: "none" };
    }
    return {
        action: "upsert",
        name,
        description: description === (text.fileDescription ?? null) ? null : description,
        source: "manual",
    };
}

/** Text z pole: oříznutý, nejvýš max znaků, prázdný = null. */
function clean(value, max) {
    const text = (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    return text === "" ? null : text;
}

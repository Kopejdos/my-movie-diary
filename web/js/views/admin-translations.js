// Překlady kolekcí v admin panelu (#/admin/translations, V4.3.4).
//
// Názvy a popisy kolekcí v češtině, němčině, španělštině a ukrajinštině:
//   • u každé kolekce a jazyka je vidět, co web ukazuje a odkud to je (oprava, TMDB, soubor, angličtina),
//   • „Check with TMDB“ stáhne název série v každém jazyce (série TMDB, jinak první film) a ukáže
//     kolekce, kde se liší – „Use“ převezme název z TMDB, „Keep ours“ potvrdí náš (už se neukáže),
//   • název i popis jde přepsat ručně a uložit (oprava v databázi – bez nového vydání webu),
//   • „Use TMDB for untranslated“ převezme návrhy u všech kolekcí, které jsou zatím jen anglicky.
// Logika (co web ukazuje, co uložit) je v collection-texts.js.

import {
    fetchTranslationData, saveCollectionTranslation, saveCollectionTranslations, deleteCollectionTranslation,
    checkCollectionNames,
} from "../admin.js";
import {
    TRANSLATION_LANGS, buildTranslationState, differingSuggestion, planTranslationSave,
} from "../collection-texts.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, pill, toast, loadingView, errorView } from "../dom.js";
import { requireAdminView, adminHeader } from "./admin.js";
import { adminSearch, matchesQuery } from "./admin-search.js";

const PAGE = 30;                                    // kolik kolekcí se vykreslí najednou
const SUGGESTIONS_KEY = "mmd-admin-tmdb-names";     // výsledek kontroly s TMDB (po dobu návštěvy)
const LANG_KEY = "mmd-admin-translations-lang";
const LANG_LABELS = { cs: "CS", de: "DE", es: "ES", uk: "UK" };
const KIND_LABELS = { series: "kindSeries", studio: "kindStudio", genre: "kindGenre", path: "kindPathOption" };

/** Návrhy z TMDB – Map universe_id → { names } (v paměti a v sessionStorage). */
let suggestions = loadSuggestions();

function loadSuggestions() {
    try {
        const raw = sessionStorage.getItem(SUGGESTIONS_KEY);
        if (raw) return new Map(JSON.parse(raw).map((item) => [item.universe_id, item]));
    } catch {
        // bez úložiště
    }
    return null;
}

function storeSuggestions(list) {
    suggestions = new Map(list.map((item) => [item.universe_id, item]));
    try {
        sessionStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(list));
    } catch {
        // bez úložiště jen v paměti
    }
}

function loadLang() {
    try {
        const lang = sessionStorage.getItem(LANG_KEY);
        if (lang === "all" || TRANSLATION_LANGS.includes(lang)) return lang;
    } catch {
        // bez úložiště
    }
    return "all";
}

export async function adminTranslationsView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTranslationsTitle} · ${TEXTS.adminTitle}`;
    mount(container, adminHeader("translations"), loadingView());

    let data;
    try {
        data = await fetchTranslationData(TRANSLATION_LANGS);
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, adminHeader("translations"),
            errorView(format("errorGeneric", error.message), () => adminTranslationsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    let rows = data.rows;
    let state = buildTranslationState(data.universes, rows, data.files);
    let lang = loadLang();
    let shown = PAGE;

    const activeLangs = () => (lang === "all" ? TRANSLATION_LANGS : [lang]);
    const listBox = h("ul", { class: "translation-list" });
    const moreBox = h("div", { class: "translation-more" });
    const summary = h("p", { class: "muted translation-summary", "aria-live": "polite" });
    const bulkBox = h("div", { class: "translation-bulk" });

    // ----- Filtry ------------------------------------------------------------

    const search = adminSearch({
        key: "translations",
        placeholder: TEXTS.adminTranslationsSearch,
        filters: [
            { value: "all", label: TEXTS.adminTranslationsFilter_all },
            { value: "diff", label: TEXTS.adminTranslationsFilter_diff },
            { value: "untranslated", label: TEXTS.adminTranslationsFilter_untranslated },
        ],
        onChange: () => {
            shown = PAGE;
            renderList();
        },
    });

    const langBox = h("div", { class: "segmented", role: "group", "aria-label": TEXTS.adminTranslationsLang });
    function renderLangs() {
        mount(langBox, ["all", ...TRANSLATION_LANGS].map((value) => h("button", {
            class: `segmented__option${lang === value ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(lang === value),
            onClick: () => {
                lang = value;
                try {
                    sessionStorage.setItem(LANG_KEY, value);
                } catch {
                    // bez úložiště
                }
                renderLangs();
                shown = PAGE;
                renderList();
            },
        }, value === "all" ? TEXTS.adminTranslationsLangAll : LANG_LABELS[value])));
    }
    renderLangs();

    // ----- Kontrola s TMDB ---------------------------------------------------

    const checkButton = h("button", { class: "btn btn--primary btn--small", type: "button" }, TEXTS.adminTranslationsCheck);
    checkButton.addEventListener("click", async () => {
        checkButton.disabled = true;
        checkButton.textContent = TEXTS.adminTranslationsChecking;
        try {
            storeSuggestions(await checkCollectionNames());
            search.setFilter("diff");
            renderList();
            toast(format("adminTranslationsChecked", suggestions.size, countDifferences()));
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        } finally {
            checkButton.disabled = false;
            checkButton.textContent = TEXTS.adminTranslationsCheck;
        }
    });

    /** Počet rozdílů (kolekce × jazyk) v aktivních jazycích. */
    function countDifferences() {
        let count = 0;
        for (const entry of state) {
            for (const l of activeLangs()) if (differingSuggestion(entry, l, suggestions)) count++;
        }
        return count;
    }

    /** Návrhy z TMDB pro jazyky, které jsou zatím jen anglicky (hromadné převzetí). */
    function untranslatedSuggestions() {
        const result = [];
        for (const entry of state) {
            for (const l of activeLangs()) {
                const text = entry.langs[l];
                const suggestion = differingSuggestion(entry, l, suggestions);
                if (suggestion && text.status === "english") {
                    result.push({ universe_id: entry.universe.id, lang: l, name: suggestion.name, description: text.row?.description ?? null, source: "tmdb" });
                }
            }
        }
        return result;
    }

    function renderBulk() {
        const pending = suggestions ? untranslatedSuggestions() : [];
        if (pending.length === 0) {
            mount(bulkBox);
            return;
        }
        const button = h("button", { class: "btn btn--small", type: "button" }, format("adminTranslationsUseAll", pending.length));
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                const saved = await saveCollectionTranslations(pending);
                applySaved(saved);
                toast(format("adminTranslationsUsedAll", saved.length));
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                button.disabled = false;
            }
        });
        mount(bulkBox, button);
    }

    // ----- Seznam ------------------------------------------------------------

    /** Projde kolekce filtrem (hledání, rozdíly / nepřeložené) v aktivních jazycích. */
    function filtered() {
        const query = search.query();
        const filter = search.filter();
        return state.filter((entry) => {
            const names = activeLangs().map((l) => entry.langs[l].name);
            if (!matchesQuery(query, entry.universe.name, entry.universe.slug, ...names)) return false;
            if (filter === "diff") return activeLangs().some((l) => differingSuggestion(entry, l, suggestions));
            if (filter === "untranslated") return activeLangs().some((l) => entry.langs[l].status === "english");
            return true;
        });
    }

    function renderList() {
        const list = filtered();
        search.setCount(list.length, state.length);
        mount(summary, suggestions
            ? format("adminTranslationsSummary", suggestions.size, countDifferences())
            : TEXTS.adminTranslationsNoCheck);
        renderBulk();
        if (list.length === 0) {
            mount(listBox, h("li", { class: "muted translation-empty" },
                search.filter() === "diff" && !suggestions ? TEXTS.adminTranslationsNoCheck : TEXTS.adminTranslationsEmpty));
            mount(moreBox);
            return;
        }
        mount(listBox, list.slice(0, shown).map(card));
        mount(moreBox, list.length > shown
            ? h("button", {
                class: "btn btn--small", type: "button",
                onClick: () => {
                    shown += PAGE;
                    renderList();
                },
            }, format("adminTranslationsMore", list.length - shown))
            : null);
    }

    /** Uložené řádky → stav všech kolekcí (a překreslení). */
    function applySaved(saved, removed = []) {
        const key = (row) => `${row.universe_id}:${row.lang}`;
        const drop = new Set([...saved, ...removed].map(key));
        rows = [...rows.filter((row) => !drop.has(key(row))), ...saved];
        state = buildTranslationState(data.universes, rows, data.files);
        renderList();
    }

    // ----- Karta kolekce -----------------------------------------------------

    function card(entry) {
        const { universe } = entry;
        const fields = [];          // { lang, name, description } – pole pro uložení
        const saveButton = h("button", { class: "btn btn--primary btn--small", type: "button", disabled: true }, TEXTS.adminTranslationsSave);
        const markChanged = () => {
            saveButton.disabled = !fields.some(({ lang: l, name, description }) =>
                planTranslationSave(entry.langs[l], name.value, description.value).action !== "none");
        };

        const langRows = activeLangs().map((l) => {
            const text = entry.langs[l];
            const id = `tr-${universe.id}-${l}`;
            const name = h("input", {
                id: `${id}-name`, class: "translation-row__name", type: "text", maxlength: 80,
                value: text.name ?? "", placeholder: universe.name, lang: l,
                "aria-label": format("adminTranslationsNameAria", LANG_LABELS[l], universe.name),
            });
            const description = h("textarea", {
                id: `${id}-description`, class: "translation-row__description", rows: 2, maxlength: 400,
                placeholder: universe.description ?? "", lang: l,
                "aria-label": format("adminTranslationsDescriptionAria", LANG_LABELS[l], universe.name),
            });
            description.value = text.description ?? "";
            name.addEventListener("input", markChanged);
            description.addEventListener("input", markChanged);
            fields.push({ lang: l, name, description });

            const suggestion = differingSuggestion(entry, l, suggestions);
            return h("div", { class: "translation-row" },
                h("div", { class: "translation-row__head" },
                    h("span", { class: "translation-row__lang" }, LANG_LABELS[l]),
                    h("span", { class: `translation-status translation-status--${text.status}` },
                        TEXTS[`adminTranslationsStatus_${text.status}`])),
                name,
                description,
                suggestion
                    ? h("div", { class: "translation-suggestion" },
                        h("span", {}, TEXTS[`adminTranslationsFrom_${suggestion.from}`], " ",
                            h("strong", { lang: l }, `„${suggestion.name}“`)),
                        h("button", {
                            class: "btn btn--small", type: "button",
                            onClick: () => save([{ universe_id: universe.id, lang: l, name: suggestion.name, description: text.row?.description ?? null, source: "tmdb" }]),
                        }, TEXTS.adminTranslationsUse),
                        h("button", {
                            class: "btn btn--small btn--ghost", type: "button",
                            onClick: () => save([{ universe_id: universe.id, lang: l, name: text.name ?? universe.name, description: text.row?.description ?? null, source: "manual" }]),
                        }, TEXTS.adminTranslationsKeep))
                    : null);
        });

        /** Uloží opravy (Use / Keep). */
        async function save(list) {
            try {
                applySaved(await saveCollectionTranslations(list));
                toast(TEXTS.adminTranslationsSaved);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
            }
        }

        saveButton.addEventListener("click", async () => {
            saveButton.disabled = true;
            const saved = [];
            const removed = [];
            try {
                for (const { lang: l, name, description } of fields) {
                    const plan = planTranslationSave(entry.langs[l], name.value, description.value);
                    if (plan.action === "upsert") {
                        saved.push(await saveCollectionTranslation(universe.id, l, plan));
                    } else if (plan.action === "delete") {
                        await deleteCollectionTranslation(universe.id, l);
                        removed.push({ universe_id: universe.id, lang: l });
                    }
                }
                applySaved(saved, removed);
                toast(TEXTS.adminTranslationsSaved);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                saveButton.disabled = false;
            }
        });

        return h("li", { class: "translation-card" },
            h("div", { class: "translation-card__head" },
                h("strong", { class: "translation-card__name" }, universe.name),
                pill(TEXTS[KIND_LABELS[universe.kind] ?? "kindSeries"]),
                h("a", { class: "translation-card__link", href: `#/admin/collection/${universe.slug}` }, TEXTS.adminTranslationsEdit)),
            h("div", { class: "translation-card__rows" }, langRows),
            h("div", { class: "translation-card__actions" }, saveButton));
    }

    mount(container,
        adminHeader("translations"),
        h("section", { class: "admin-form translation-intro" },
            h("p", { class: "muted" }, TEXTS.adminTranslationsIntro),
            h("div", { class: "translation-toolbar" }, checkButton, bulkBox),
            summary),
        h("div", { class: "translation-filters" }, search.element, langBox),
        listBox,
        moreBox);
    renderList();
}

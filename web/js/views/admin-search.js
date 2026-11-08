// Vyhledávání v admin panelu (V3.5.2.2) – společné pole pro záložky Collections, Users,
// Nicknames a Requests. Filtruje se v prohlížeči nad už načteným seznamem (okamžitě,
// bez dotazů do databáze). Hledaný text a zvolený filtr si záložka pamatuje po dobu
// návštěvy (sessionStorage) – po návratu z detailu kolekce zůstane filtr, jak byl.
// Klávesa „/“ skočí do pole, Esc ho vymaže.

import { normalize } from "../search.js";
import { TEXTS, format } from "../texts.js";
import { h, mount } from "../dom.js";

/** Uložený stav hledání záložky (bez úložiště = jen v paměti). */
const memory = new Map();

function loadState(key) {
    try {
        const raw = sessionStorage.getItem(`mmd-admin-search-${key}`);
        if (raw) return JSON.parse(raw);
    } catch {
        // bez úložiště
    }
    return memory.get(key) ?? { query: "", filter: "all" };
}

function saveState(key, state) {
    memory.set(key, state);
    try {
        sessionStorage.setItem(`mmd-admin-search-${key}`, JSON.stringify(state));
    } catch {
        // bez úložiště jen v paměti
    }
}

/** Obsahuje některý z textů hledaný výraz? (bez ohledu na velikost písmen a diakritiku) */
export function matchesQuery(query, ...texts) {
    const needle = normalize(query);
    if (needle === "") return true;
    return texts.some((text) => normalize(text).includes(needle));
}

/**
 * Text se zvýrazněným hledaným výrazem (<mark>). Porovnává se bez diakritiky;
 * když se výraz v původním textu najít nedá (jiná interpunkce), vrátí text beze změny.
 */
export function highlight(text, query) {
    const value = text ?? "";
    const needle = (query ?? "").trim().toLowerCase();
    if (needle.length < 2) return value;
    const plain = value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const index = plain.indexOf(needle.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    // NFD může text prodloužit – zvýrazňuje se jen tam, kde délky sedí
    if (index < 0 || plain.length !== value.length) return value;
    return [value.slice(0, index), h("mark", { class: "admin-mark" }, value.slice(index, index + needle.length)),
        value.slice(index + needle.length)];
}

/**
 * Pole pro hledání + volitelné přepínače filtru.
 *   key        – jméno záložky (pro zapamatování stavu)
 *   placeholder
 *   filters    – [{ value, label }] (první = „vše“), nebo []
 *   onChange   – zavolá se po každé změně (hledání / filtr)
 * Vrací { element, query(), filter(), setCount(shown, total), active() }.
 */
export function adminSearch({ key, placeholder, filters = [], onChange }) {
    const state = loadState(key);
    if (!filters.some((f) => f.value === state.filter)) state.filter = filters[0]?.value ?? "all";

    const input = h("input", {
        class: "search-box__input", type: "search", value: state.query,
        placeholder, "aria-label": placeholder,
        autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search",
    });
    const clear = h("button", {
        class: "search-box__clear", type: "button", hidden: state.query === "",
        title: TEXTS.searchClear, "aria-label": TEXTS.searchClear,
    }, "×");
    const counter = h("span", { class: "muted admin-filter__count", "aria-live": "polite" });
    const filterBox = filters.length > 0
        ? h("div", { class: "segmented admin-filter__filters", role: "group", "aria-label": TEXTS.adminSearchFilter })
        : null;

    const changed = () => {
        saveState(key, state);
        clear.hidden = state.query === "";
        onChange();
    };

    const renderFilters = () => {
        if (!filterBox) return;
        mount(filterBox, filters.map((f) => h("button", {
            class: `segmented__option${state.filter === f.value ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(state.filter === f.value),
            onClick: () => {
                state.filter = f.value;
                renderFilters();
                changed();
            },
        }, f.label)));
    };
    renderFilters();

    input.addEventListener("input", () => {
        state.query = input.value;
        changed();
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && input.value !== "") {
            event.preventDefault();
            input.value = "";
            state.query = "";
            changed();
        }
    });
    clear.addEventListener("click", () => {
        input.value = "";
        state.query = "";
        changed();
        input.focus();
    });

    // „/“ = skok do pole (mimo jiná pole); po odchodu ze stránky se posluchač sám odebere
    const onSlash = (event) => {
        if (!document.body.contains(input)) {
            document.removeEventListener("keydown", onSlash);
            return;
        }
        const target = event.target;
        const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            input.focus();
        }
    };
    document.addEventListener("keydown", onSlash);

    const element = h("div", { class: "admin-filter" },
        h("div", { class: "search-box admin-filter__box" },
            h("span", { class: "search-icon", "aria-hidden": "true" }),
            input, clear),
        h("div", { class: "admin-filter__bar" }, filterBox, counter));

    return {
        element,
        query: () => state.query.trim(),
        filter: () => state.filter,
        /** Je hledání / filtr zapnutý? */
        active: () => state.query.trim() !== "" || state.filter !== (filters[0]?.value ?? "all"),
        /** Zrušit hledání i filtr. */
        reset: () => {
            input.value = "";
            state.query = "";
            state.filter = filters[0]?.value ?? "all";
            renderFilters();
            changed();
        },
        setCount: (shown, total) => {
            counter.textContent = shown === total ? format("adminSearchTotal", total) : format("adminSearchShown", shown, total);
        },
    };
}

/** Prázdný výsledek hledání s tlačítkem pro zrušení. */
export function noResults(onReset) {
    return h("div", { class: "empty-filter" },
        h("p", { style: "margin: 0 0 12px" }, TEXTS.adminSearchEmpty),
        onReset ? h("button", { class: "btn", type: "button", onClick: onReset }, TEXTS.filterReset) : null);
}

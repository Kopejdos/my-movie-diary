// Obrazovka: Coming soon (#/coming-soon, V3.3.1) – všechny oznámené filmy ze všech kolekcí
// v jednom seznamu, nejbližší premiéra nahoře, rozdělené po čtvrtletích (leden–březen…).
// Hranice: do konce roku letos + 5 (posouvá se sama, viz comingSoonLastYear v data.js).
//
// V4.4.5: hledání (název, rok, kolekce) a filtr jako na přehledu – druh kolekce (Series, Studios,
// Directors…) a žánr – plus „jen můj watchlist“. Logika filtru je v ../soon-filter.js; druh a žánr
// se pamatují, hledaný text je v adrese (?q=…), aby šel sdílet.

import {
    fetchComingSoon, groupByQuarter, comingSoonLastYear, fetchWatchlistIds, fetchCategories, KIND_ORDER,
} from "../data.js";
import { filterComingSoon, soonFacets } from "../soon-filter.js";
import { isSignedIn } from "../auth.js";
import { replaceQuery } from "../router.js";
import { setAccent, inkFor } from "../theme.js";
import { loadPref, savePref } from "../prefs.js";
import { TEXTS, format, movies, LOCALE } from "../texts.js";
import { h, mount, loadingView, errorView } from "../dom.js";
import { soonPill, soonPoster } from "./coming-soon.js";
import { filmOpener } from "./film-detail.js";
import { watchlistStar, collectionPill } from "./film-controls.js";
import { kindLabel } from "./universes.js";

export async function comingSoonView(container, context) {
    setAccent(null);
    document.title = `${TEXTS.navComingSoon} · ${TEXTS.appName}`;
    mount(container, loadingView());
    const signedIn = isSignedIn();

    let entries, watchlist, categories;
    try {
        [entries, watchlist, categories] = await Promise.all([fetchComingSoon(), fetchWatchlistIds(signedIn), fetchCategories()]);
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => comingSoonView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    // Stav filtru: druh a žánr z minula (neexistující = vše), text z adresy
    const state = {
        query: context.query?.get("q") ?? "",
        kind: loadPref("soon-kind", "all"),
        category: loadPref("soon-category", "all"),
        watchlistOnly: signedIn && loadPref("soon-watchlist", "0") === "1",
    };
    if (state.kind !== "all" && !KIND_ORDER.includes(state.kind)) state.kind = "all";
    if (state.category !== "all" && !categories.some((c) => c.slug === state.category)) state.category = "all";
    const categoryId = () => categories.find((c) => c.slug === state.category)?.id ?? null;
    const options = () => ({ query: state.query, kind: state.kind, categoryId: categoryId(), watchlistOnly: state.watchlistOnly, watchlist });

    // --- Hledání ---
    const input = h("input", {
        class: "search-box__input", type: "search", name: "q",
        placeholder: TEXTS.comingSoonSearch, "aria-label": TEXTS.comingSoonSearch,
        autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search",
        value: state.query,
    });
    const clear = h("button", {
        class: "search-box__clear", type: "button", title: TEXTS.searchClear, "aria-label": TEXTS.searchClear,
    }, "×");
    clear.hidden = state.query === "";
    let typingTimer = null;
    input.addEventListener("input", () => {
        state.query = input.value;
        clear.hidden = input.value === "";
        renderAll();
        // adresu stačí přepsat, až uživatel dopíše
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => replaceQuery(state.query.trim() ? { q: state.query.trim() } : {}), 400);
    });
    clear.addEventListener("click", () => {
        input.value = "";
        state.query = "";
        clear.hidden = true;
        replaceQuery({});
        renderAll();
        input.focus();
    });

    // --- Filtry a seznam ---
    const kindTabs = h("div", { class: "kind-tabs", role: "tablist", "aria-label": TEXTS.filterKindLabel });
    const chips = h("div", { class: "chips", role: "tablist", "aria-label": TEXTS.filterGenreLabel });
    const watchlistToggle = signedIn
        ? h("button", {
            class: "chip soon-watchlist-toggle", type: "button", "aria-pressed": String(state.watchlistOnly),
            onClick: () => {
                state.watchlistOnly = !state.watchlistOnly;
                savePref("soon-watchlist", state.watchlistOnly ? "1" : "0");
                renderAll();
            },
        }, `★ ${TEXTS.comingSoonWatchlistOnly}`)
        : null;
    const count = h("span", { class: "muted" });
    const list = h("div", { class: "soon-results", "aria-live": "polite" });

    function renderAll() {
        const facets = soonFacets(entries, options(), KIND_ORDER, categories);

        // 1. vrstva – druh kolekce (prázdné druhy se skryjí, kromě zvoleného)
        mount(kindTabs,
            tab(state.kind === "all", TEXTS.kindAll, facets.all, () => selectKind("all")),
            KIND_ORDER
                .filter((kind) => facets.kinds.get(kind) > 0 || kind === state.kind)
                .map((kind) => tab(state.kind === kind, kindLabel(kind), facets.kinds.get(kind), () => selectKind(kind))),
        );
        // 2. vrstva – žánr
        mount(chips,
            chip(state.category === "all", TEXTS.categoryAll, null, facets.allCategories, () => selectCategory("all")),
            categories
                .filter((c) => facets.categories.get(c.id) > 0 || c.slug === state.category)
                .map((c) => chip(state.category === c.slug, c.name, c.color, facets.categories.get(c.id), () => selectCategory(c.slug))),
        );
        if (watchlistToggle) {
            watchlistToggle.classList.toggle("chip--active", state.watchlistOnly);
            watchlistToggle.setAttribute("aria-pressed", String(state.watchlistOnly));
        }

        const visible = filterComingSoon(entries, options());
        const filtered = visible.length !== entries.length;
        count.textContent = filtered ? format("comingSoonFiltered", visible.length, entries.length) : movies(entries.length);

        if (entries.length === 0) {
            mount(list, h("div", { class: "empty-filter" }, TEXTS.comingSoonPageEmpty));
            return;
        }
        if (visible.length === 0) {
            mount(list, h("div", { class: "empty-filter" },
                h("p", { style: "margin: 0 0 12px" }, TEXTS.comingSoonFilterEmpty),
                h("button", { class: "btn", type: "button", onClick: resetFilters }, TEXTS.comingSoonFilterReset)));
            return;
        }
        mount(list, groupByQuarter(visible).map((group) => h("section", { class: "soon-quarter" },
            h("h2", { class: "soon-quarter__title" },
                quarterLabel(group),
                group.quarter ? h("span", { class: "soon-quarter__tag" }, format("comingSoonQuarterTag", group.quarter)) : null,
                h("span", { class: "soon-quarter__count" }, String(group.items.length))),
            h("ol", { class: "film-list" }, group.items.map((entry) => row(entry, watchlist, signedIn))),
        )));
    }

    function selectKind(kind) {
        state.kind = kind;
        savePref("soon-kind", kind);
        renderAll();
    }
    function selectCategory(slug) {
        state.category = slug;
        savePref("soon-category", slug);
        renderAll();
    }
    function resetFilters() {
        state.query = "";
        input.value = "";
        clear.hidden = true;
        replaceQuery({});
        state.watchlistOnly = false;
        savePref("soon-watchlist", "0");
        selectKind("all");
        selectCategory("all");
    }

    mount(container,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, h("span", { class: "calendar-icon", "aria-hidden": "true" }), TEXTS.comingSoonEyebrow),
            h("h1", {}, TEXTS.comingSoonTitle),
            h("p", { class: "muted" }, format("comingSoonPageIntro", comingSoonLastYear())),
            entries.length > 0
                ? h("div", { class: "search-box soon-search" },
                    h("span", { class: "search-icon", "aria-hidden": "true" }), input, clear)
                : null,
        ),
        entries.length > 0 ? kindTabs : null,
        entries.length > 0 ? chips : null,
        h("div", { class: "section-title soon-toolbar" }, watchlistToggle ?? h("span"), count),
        list,
    );
    renderAll();
}

/** Záložka druhu (stejný vzhled jako na přehledu). */
function tab(active, label, n, onClick) {
    return h("button", {
        class: `kind-tab${active ? " kind-tab--active" : ""}`,
        type: "button", role: "tab", "aria-selected": String(active), onClick,
    }, label, h("span", { class: "kind-tab__count" }, String(n ?? 0)));
}

/** Tlačítko žánru v barvě kategorie (stejný vzhled jako na přehledu). */
function chip(active, label, color, n, onClick) {
    const button = h("button", {
        class: `chip${active ? " chip--active" : ""}`,
        type: "button", role: "tab", "aria-selected": String(active), onClick,
    }, label, h("span", { class: "chip__count" }, String(n ?? 0)));
    if (color) {
        button.style.setProperty("--c", color);
        button.style.setProperty("--c-ink", inkFor(color));
    }
    return button;
}

/** Nadpis čtvrtletí: „October – December 2026“, filmy bez data „Date to be announced“. */
export function quarterLabel(group) {
    if (!group.quarter) return TEXTS.comingSoonTbaGroup;
    const month = (index) => new Date(2000, index, 1).toLocaleDateString(LOCALE, { month: "long" });
    const first = (group.quarter - 1) * 3;
    return format("comingSoonQuarter", month(first), month(first + 2), group.year);
}

/** Řádek filmu: plakát, název, datum s odpočtem, kolekce, ☆ watchlist. */
function row(entry, watchlist, signedIn) {
    const { film } = entry;
    return h("li", { class: "film film--soon" },
        filmOpener(film, soonPoster(film, "film__poster"), "film-open film-open--poster"),
        h("div", { class: "film__info" },
            h("h3", { class: "film__title" }, filmOpener(film, film.title)),
            h("div", { class: "film__meta" },
                soonPill(film),
                entry.universes.map((u) => collectionPill(u)),
            ),
        ),
        signedIn ? h("div", { class: "film__actions" }, watchlistStar(film, watchlist)) : null,
    );
}

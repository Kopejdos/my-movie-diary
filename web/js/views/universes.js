// Obrazovka: přehled – nahoře „Co dneska?“ (V3.3; tři tipy pro přihlášeného) nebo
// uvítací karta, pod tím mřížka univerz.
// Filtr má dvě vrstvy (V3.1.2): 1. druh kolekce (Series / Studios / Genre picks / Paths),
// 2. žánr (kategorie). Počty v každé vrstvě se počítají podle volby v té druhé.
// V3.5.2.2: kolekce se řadí podle abecedy (volitelně nejnovější / můj postup) a v přehledu
// všech druhů ukazuje každá skupina jen první dvě řady – zbytek po „Show all“.
// V3.5.4: úplně dole sekce Community – jedna řada 7 nejzobrazovanějších veřejných seznamů
// uživatelů (řídí se žánrem); záložka Community ukáže všechny.

import {
    fetchUniverses, fetchCategories, fetchMyFilmCounts, fetchWatchlistIds, fetchSearchData, percent, KIND_ORDER,
    prefetchUniverse,
} from "../data.js";
import { loadPref, savePref } from "../prefs.js";
import { isSignedIn, getUser } from "../auth.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies, collections, steps } from "../texts.js";
import { h, mount, poster, loadingView, errorView } from "../dom.js";
import { todayPanel, todayPlaceholder } from "./today.js";
import { fetchCommunityLists } from "../lists.js";
import { listCard, listGrid } from "./list-card.js";

/** Kolik seznamů ukáže řada Community v přehledu. */
const COMMUNITY_ROW = 7;

/** Kolik řad kolekcí ukáže sbalená skupina (na úzkém displeji se 2 sloupci 3 řady). */
const COLLAPSED_ROWS = 2;
const COLLAPSED_ROWS_NARROW = 3;

/** Rozbalené skupiny (druhy kolekcí) – pamatují se do obnovení stránky. */
const expandedKinds = new Set();

/** Způsoby řazení kolekcí; „progress“ jen pro přihlášené. */
const SORTS = ["alpha", "newest", "progress"];

/** Název pro řazení podle abecedy: bez úvodního členu („The Purge“ → „Purge“). */
function sortName(name) {
    return (name ?? "").replace(/^(the|a|an)\s+/i, "");
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Seřadí kolekce podle zvoleného způsobu (vrací novou kopii). */
export function sortUniverses(list, sort) {
    const byName = (a, b) => collator.compare(sortName(a.name), sortName(b.name));
    const sorted = [...list];
    if (sort === "newest") {
        sorted.sort((a, b) => b.id - a.id);                 // novější kolekce mají vyšší ID
    } else if (sort === "progress") {
        // Rozkoukané nahoře (nejvíc zhlédnuté první), pak nenačaté, dokoukané až na konci –
        // uvnitř nenačatých a dokoukaných podle abecedy. Opakovaná zhlédnutí pořadí nemění.
        const pct = (u) => (u.totalCount > 0 ? Math.min(1, u.watchedCount / u.totalCount) : 0);
        const group = (u) => (pct(u) >= 1 ? 2 : pct(u) > 0 ? 0 : 1);
        sorted.sort((a, b) => group(a) - group(b) || (group(a) === 0 ? pct(b) - pct(a) : 0) || byName(a, b));
    } else {
        sorted.sort(byName);
    }
    return sorted;
}

/** Kolik sloupců má mřížka kolekcí při dané šířce (stejně jako CSS .universe-grid). */
function gridColumns(width) {
    const wide = window.matchMedia("(min-width: 720px)").matches;
    const [min, gap] = wide ? [190, 18] : [150, 14];
    return Math.max(1, Math.floor((width + gap) / (min + gap)));
}

export async function universesView(container, context) {
    const { isCurrent } = context;
    document.title = TEXTS.appName;
    setAccent(null);
    mount(container, loadingView());

    const signedIn = isSignedIn();
    // Kolekce a kategorie se načtou souběžně; „Co dneska?“ (potřebuje zhlédnutí, watchlist
    // a seznam filmů) se doplní nahoru později – nezdržuje vykreslení mřížky
    const todayPromise = signedIn
        ? Promise.all([fetchSearchData(), fetchCategories(), fetchMyFilmCounts(true), fetchWatchlistIds(true)])
        : Promise.resolve(null);
    todayPromise.catch(() => null);

    // Seznamy komunity se doplní, až dorazí (nezdržují mřížku kolekcí)
    let community = [];
    let communityLoaded = false;
    const communityPromise = fetchCommunityLists();

    let universes, categories;
    try {
        [universes, categories] = await Promise.all([fetchUniverses(), fetchCategories()]);
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => universesView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    // Zvolený druh a žánr se pamatují; neexistující (smazaná kategorie) = vše
    let selectedKind = loadPref("kind", "all");
    if (selectedKind !== "all" && selectedKind !== "community" && !KIND_ORDER.includes(selectedKind)) selectedKind = "all";
    let selected = loadPref("category", "all");
    if (selected !== "all" && !categories.some((c) => c.slug === selected)) selected = "all";
    let sort = loadPref("sort", "alpha");
    if (!SORTS.includes(sort) || (sort === "progress" && !signedIn)) sort = "alpha";

    const sortSelect = h("select", {
        class: "sort-select", "aria-label": TEXTS.sortLabel,
        onChange: () => {
            sort = sortSelect.value;
            savePref("sort", sort);
            renderCollections();
        },
    }, SORTS.filter((s) => s !== "progress" || signedIn)
        .map((s) => h("option", { value: s, selected: s === sort }, TEXTS[`sort_${s}`])));

    const kindTabs = h("div", { class: "kind-tabs", role: "tablist", "aria-label": TEXTS.filterKindLabel });
    const chips = h("div", { class: "chips", role: "tablist", "aria-label": TEXTS.filterGenreLabel });
    const count = h("span", { class: "muted" });
    const grid = h("div", { class: "collection-sections" });

    const kindOf = (u) => u.kind ?? "series";
    const inKind = (u, kind) => kind === "all" || kindOf(u) === kind;
    const inCategory = (u, slug) => {
        if (slug === "all") return true;
        const category = categories.find((c) => c.slug === slug);
        return Boolean(category) && u.categoryIds.includes(category.id);
    };

    /** Seznam komunity v žánru (kategorie podle id). */
    const listInCategory = (list, slug) => {
        if (slug === "all") return true;
        const category = categories.find((c) => c.slug === slug);
        return Boolean(category) && (list.category_ids ?? []).includes(category.id);
    };

    /** Překreslí oba filtry a mřížku podle zvoleného druhu a žánru (bez nového načítání). */
    function renderCollections() {
        const communityMode = selectedKind === "community";
        const visible = communityMode ? [] : sortUniverses(universes.filter((u) => inKind(u, selectedKind) && inCategory(u, selected)), sort);
        const communityVisible = community.filter((l) => listInCategory(l, selected));

        // 1. vrstva – druh; počet podle zvoleného žánru. Prázdné druhy se skryjí (kromě zvoleného).
        const forCategory = universes.filter((u) => inCategory(u, selected));
        mount(kindTabs,
            kindTab("all", TEXTS.kindAll, forCategory.length),
            KIND_ORDER
                .map((kind) => ({ kind, n: forCategory.filter((u) => kindOf(u) === kind).length }))
                .filter(({ kind, n }) => n > 0 || kind === selectedKind)
                .map(({ kind, n }) => kindTab(kind, kindLabel(kind), n)),
            communityVisible.length > 0 || communityMode ? kindTab("community", TEXTS.kindCommunity, communityVisible.length) : null,
        );

        // 2. vrstva – žánr; počet podle zvoleného druhu (u Community podle seznamů)
        const forKind = universes.filter((u) => inKind(u, selectedKind));
        mount(chips,
            chip("all", TEXTS.categoryAll, null, communityMode ? community.length : forKind.length),
            categories
                .map((c) => ({
                    c,
                    n: communityMode
                        ? community.filter((l) => (l.category_ids ?? []).includes(c.id)).length
                        : forKind.filter((u) => u.categoryIds.includes(c.id)).length,
                }))
                .filter(({ c, n }) => n > 0 || c.slug === selected)
                .map(({ c, n }) => chip(c.slug, c.name, c.color, n)),
        );
        count.textContent = communityMode ? format("communityCount", communityVisible.length) : collections(visible.length);
        sortSelect.hidden = communityMode;          // komunita je vždy podle zobrazení

        // Záložka Community – všechny veřejné seznamy (podle zobrazení)
        if (communityMode) {
            sections = [];
            if (!communityLoaded) {
                mount(grid, loadingView());
                return;
            }
            mount(grid, communityVisible.length === 0
                ? h("div", { class: "empty-filter" },
                    h("p", { style: "margin: 0 0 12px" }, TEXTS.communityEmpty),
                    h("button", { class: "btn", type: "button", onClick: () => selectCategory("all") }, TEXTS.filterReset))
                : h("section", { class: "collection-section" },
                    h("p", { class: "hint community-hint" }, TEXTS.kindCommunityHint),
                    listGrid(communityVisible, { showAuthor: true })));
            return;
        }

        if (visible.length === 0 && (selectedKind !== "all" || communityVisible.length === 0)) {
            // Kombinace bez výsledku (např. Paths + Comedy) – nabídnout zrušení filtru
            mount(grid, h("div", { class: "empty-filter" },
                h("p", { style: "margin: 0 0 12px" }, TEXTS.filterEmptyCollections),
                h("button", {
                    class: "btn", type: "button",
                    onClick: () => { selectKind("all"); selectCategory("all"); },
                }, TEXTS.filterReset)));
            return;
        }

        // Seskupení podle druhu (série, studia, žánrové výběry, cesty); nadpisy jen když je druhů víc
        const groups = KIND_ORDER
            .map((kind) => ({ kind, items: visible.filter((u) => kindOf(u) === kind) }))
            .filter((g) => g.items.length > 0);
        // Víc skupin = přehled → každá skupina sbalená na pár řad (V3.5.2.2)
        const collapsible = groups.length > 1;
        sections = groups.map((g) => {
            const cards = g.items.map((u, i) => universeCard(u, signedIn, groups.indexOf(g) === 0 && i < 5));
            const toggle = h("button", { class: "btn btn--small section-toggle", type: "button", hidden: true });
            const element = h("section", { class: "collection-section" },
                collapsible ? kindHeading(g.kind) : null,
                h("div", { class: "universe-grid" }, cards),
                h("div", { class: "section-toggle__row" }, toggle));
            const section = { kind: g.kind, cards, toggle, element, collapsible };
            toggle.addEventListener("click", () => {
                if (expandedKinds.has(g.kind)) {
                    expandedKinds.delete(g.kind);
                    layoutSection(section);
                    // po sbalení ať skupina nezůstane mimo obrazovku
                    if (element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: "start" });
                } else {
                    expandedKinds.add(g.kind);
                    layoutSection(section);
                }
            });
            return section;
        });
        // Řada Community pod všemi skupinami (jen v přehledu všech druhů)
        const communityRow = selectedKind === "all" && communityVisible.length > 0
            ? h("section", { class: "collection-section community-section" },
                kindHeading("community"),
                h("div", { class: "list-row" }, communityVisible.slice(0, COMMUNITY_ROW).map((l) => listCard(l, { showAuthor: true }))),
                communityVisible.length > COMMUNITY_ROW
                    ? h("div", { class: "section-toggle__row" },
                        h("button", { class: "btn btn--small", type: "button", onClick: () => { selectKind("community"); grid.scrollIntoView({ block: "start" }); } },
                            `${format("communityShowAll", communityVisible.length)} →`))
                    : null)
            : null;
        mount(grid, sections.map((section) => section.element), communityRow);
        layoutSections();
    }

    /** Sbalení / rozbalení skupiny podle počtu sloupců mřížky. */
    let sections = [];
    let columns = 0;
    function layoutSection(section) {
        const rows = columns <= 2 ? COLLAPSED_ROWS_NARROW : COLLAPSED_ROWS;
        const limit = columns * rows;
        const tooMany = section.collapsible && section.cards.length > limit;
        const open = !tooMany || expandedKinds.has(section.kind);
        section.cards.forEach((card, i) => card.classList.toggle("is-collapsed", !open && i >= limit));
        section.toggle.hidden = !tooMany;
        section.toggle.textContent = open
            ? `${TEXTS.collectionsShowFewer} ▴`
            : `${format("collectionsShowAll", section.cards.length)} ▾`;
        section.toggle.setAttribute("aria-expanded", String(open));
    }
    function layoutSections() {
        columns = gridColumns(grid.clientWidth || container.clientWidth);
        sections.forEach(layoutSection);
    }
    // Změna šířky okna → jiný počet sloupců → přepočítat sbalení
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
        if (!document.body.contains(grid)) {
            observer.disconnect();
            return;
        }
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            if (gridColumns(grid.clientWidth) !== columns) layoutSections();
        });
    });
    observer.observe(grid);

    function selectKind(kind) {
        selectedKind = kind;
        savePref("kind", kind);
        renderCollections();
    }

    function selectCategory(slug) {
        selected = slug;
        savePref("category", slug);
        renderCollections();
    }

    /** Záložka 1. vrstvy (druh kolekce). */
    function kindTab(kind, label, n) {
        const active = selectedKind === kind;
        return h("button", {
            class: `kind-tab${active ? " kind-tab--active" : ""}`,
            type: "button", role: "tab", "aria-selected": String(active),
            onClick: () => selectKind(kind),
        }, label, h("span", { class: "kind-tab__count" }, String(n)));
    }

    /** Tlačítko 2. vrstvy (žánr / kategorie). */
    function chip(slug, label, color, n) {
        const active = selected === slug;
        const button = h("button", {
            class: `chip${active ? " chip--active" : ""}`,
            type: "button", role: "tab", "aria-selected": String(active),
            onClick: () => selectCategory(slug),
        }, label, h("span", { class: "chip__count" }, String(n)));
        if (color) {
            button.style.setProperty("--c", color);
            button.style.setProperty("--c-ink", inkFor(color));
        }
        return button;
    }

    const heroSlot = h("div", { class: "hero-slot" }, signedIn ? todayPlaceholder() : heroCard(false));
    if (signedIn) {
        todayPromise
            .then(([search, allCategories, counts, watchlist]) => {
                if (!isCurrent()) return;
                // Úplný nováček (nic neviděl, nic si neuložil) dostane uvítání místo tipů
                if (counts.size === 0 && watchlist.size === 0) {
                    mount(heroSlot, heroCard(true));
                    return;
                }
                mount(heroSlot, todayPanel({
                    universes: search.universes, items: search.items, categories: allCategories,
                    counts, watchlist, userId: getUser()?.id,
                }, () => universesView(container, context)));
            })
            .catch(() => { if (isCurrent()) mount(heroSlot, heroCard(true)); });
    }

    mount(container,
        heroSlot,
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.universesTitle),
            h("span", { class: "section-title__side" }, count, sortSelect),
        ),
        searchEntry(),
        kindTabs,
        chips,
        grid,
    );
    renderCollections();
    communityPromise.then((lists) => {
        if (!isCurrent()) return;
        communityLoaded = true;
        community = lists;
        if (lists.length > 0 || selectedKind === "community") renderCollections();
    });
}

/** Lišta „Search movies and collections…“ – vede na stránku hledání. */
function searchEntry() {
    return h("a", { class: "search-entry", href: "#/search" },
        h("span", { class: "search-icon", "aria-hidden": "true" }),
        h("span", { class: "search-entry__text" }, TEXTS.searchPlaceholder),
        h("span", { class: "kbd", "aria-hidden": "true" }, "/"),
    );
}

/** Nadpis skupiny podle typu kolekce. */
/** Název druhu kolekce. */
function kindLabel(kind) {
    return {
        path: TEXTS.kindPath, series: TEXTS.kindSeries, studio: TEXTS.kindStudio, genre: TEXTS.kindGenre,
        community: TEXTS.kindCommunity,
    }[kind] ?? kind;
}

function kindHeading(kind) {
    const label = kindLabel(kind);
    const hint = { genre: TEXTS.kindGenreHint, path: TEXTS.kindPathHint, community: TEXTS.kindCommunityHint }[kind];
    return h("div", { class: "kind-heading" },
        h("h3", {}, label),
        hint ? h("span", { class: "muted" }, hint) : null,
    );
}

/** Uvítací karta nahoře: představení aplikace (host), nebo první krok (nováček). */
function heroCard(signedIn) {
    if (!signedIn) {
        return h("section", { class: "hero-card" },
            h("div", { class: "hero-card__body" },
                h("span", { class: "eyebrow" }, TEXTS.heroGuestEyebrow),
                h("h1", { class: "hero-card__title" }, TEXTS.heroGuestTitle),
                h("p", { class: "hero-card__text" }, TEXTS.heroGuestText),
                h("div", { class: "hero-card__actions" },
                    h("a", { class: "btn btn--primary", href: "#/register" }, TEXTS.navRegister),
                    h("a", { class: "btn", href: "#/login" }, TEXTS.navSignIn),
                ),
            ),
        );
    }
    return h("section", { class: "hero-card" },
        h("div", { class: "hero-card__body" },
            h("span", { class: "eyebrow" }, TEXTS.heroWelcomeEyebrow),
            h("h1", { class: "hero-card__title" }, TEXTS.heroWelcomeTitle),
            h("p", { class: "hero-card__text" }, TEXTS.heroWelcomeText),
        ),
    );
}

/** Kartička univerza – odkaz na detail (používá ji i vyhledávání). */
export function universeCard(universe, signedIn, eager = false) {
    const progress = { total: universe.totalCount, watched: universe.watchedCount };
    const value = percent(progress);
    const complete = signedIn && progress.total > 0 && progress.watched === progress.total;

    const card = h("a", { class: "universe-card", href: `#/collection/${universe.slug}` },
        h("div", { class: "universe-card__media" },
            poster(universe.cover?.poster_path, universe.name, "universe-card__cover", eager),
        ),
        complete ? h("span", { class: "universe-card__badge" }, `✓ ${TEXTS.complete}`) : null,
        universe.kind === "path" ? h("span", { class: "universe-card__kind" }, `🧭 ${TEXTS.kindPathBadge}`) : null,
        h("div", { class: "universe-card__body" },
            h("h2", { class: "universe-card__title" }, universe.name),
            signedIn
                ? [
                    h("div", { class: "progress", role: "progressbar",
                            "aria-label": format("progressCount", progress.watched, progress.total),
                            "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": value },
                        h("div", { class: "progress__bar", style: `width: ${value}%` }),
                    ),
                    h("p", { class: "universe-card__meta" },
                        format("progressCount", progress.watched, progress.total)),
                ]
                : h("p", { class: "universe-card__meta" },
                    universe.kind === "path" ? steps(progress.total) : movies(progress.total)),
        ),
    );
    if (universe.color) {
        card.style.setProperty("--c", universe.color);
        card.style.setProperty("--c-ink", inkFor(universe.color));
    }
    // Přednačtení: data a banner se začnou stahovat už při najetí / dotyku,
    // takže detail je po kliknutí hned hotový (V2.1)
    const warm = () => prefetchUniverse(universe.slug, universe.cover?.backdrop_path ?? null);
    card.addEventListener("pointerenter", warm);
    card.addEventListener("focus", warm);
    card.addEventListener("touchstart", warm, { passive: true });
    return card;
}

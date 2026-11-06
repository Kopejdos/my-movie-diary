// Obrazovka: přehled – nahoře „Co dneska?“ (V3.3; tři tipy pro přihlášeného) nebo
// uvítací karta, pod tím mřížka univerz.
// Filtr má dvě vrstvy (V3.1.2): 1. druh kolekce (Series / Studios / Genre picks / Paths),
// 2. žánr (kategorie). Počty v každé vrstvě se počítají podle volby v té druhé.

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
    if (selectedKind !== "all" && !KIND_ORDER.includes(selectedKind)) selectedKind = "all";
    let selected = loadPref("category", "all");
    if (selected !== "all" && !categories.some((c) => c.slug === selected)) selected = "all";

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

    /** Překreslí oba filtry a mřížku podle zvoleného druhu a žánru (bez nového načítání). */
    function renderCollections() {
        const visible = universes.filter((u) => inKind(u, selectedKind) && inCategory(u, selected));

        // 1. vrstva – druh; počet podle zvoleného žánru. Prázdné druhy se skryjí (kromě zvoleného).
        const forCategory = universes.filter((u) => inCategory(u, selected));
        mount(kindTabs,
            kindTab("all", TEXTS.kindAll, forCategory.length),
            KIND_ORDER
                .map((kind) => ({ kind, n: forCategory.filter((u) => kindOf(u) === kind).length }))
                .filter(({ kind, n }) => n > 0 || kind === selectedKind)
                .map(({ kind, n }) => kindTab(kind, kindLabel(kind), n)),
        );

        // 2. vrstva – žánr; počet podle zvoleného druhu
        const forKind = universes.filter((u) => inKind(u, selectedKind));
        mount(chips,
            chip("all", TEXTS.categoryAll, null, forKind.length),
            categories
                .map((c) => ({ c, n: forKind.filter((u) => u.categoryIds.includes(c.id)).length }))
                .filter(({ c, n }) => n > 0 || c.slug === selected)
                .map(({ c, n }) => chip(c.slug, c.name, c.color, n)),
        );
        count.textContent = collections(visible.length);

        if (visible.length === 0) {
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
        mount(grid, groups.map((g) => h("section", { class: "collection-section" },
            groups.length > 1 ? kindHeading(g.kind) : null,
            h("div", { class: "universe-grid" }, g.items.map((u, i) => universeCard(u, signedIn, groups.indexOf(g) === 0 && i < 5))),
        )));
    }

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
            count,
        ),
        searchEntry(),
        kindTabs,
        chips,
        grid,
    );
    renderCollections();
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
    }[kind] ?? kind;
}

function kindHeading(kind) {
    const label = kindLabel(kind);
    const hint = { genre: TEXTS.kindGenreHint, path: TEXTS.kindPathHint }[kind];
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

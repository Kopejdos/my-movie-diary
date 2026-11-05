// Obrazovka: přehled – hero karta (Continue watching / vítání) a mřížka univerz.

import {
    fetchUniverses, fetchCategories, fetchMyFilmCounts, fetchContinueWatching, addWatch, percent, KIND_ORDER,
} from "../data.js";
import { loadPref, savePref } from "../prefs.js";
import { isSignedIn } from "../auth.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies, collections } from "../texts.js";
import { h, mount, poster, posterUrl, pill, yearOf, toast, loadingView, errorView } from "../dom.js";

export async function universesView(container, context) {
    const { isCurrent } = context;
    document.title = TEXTS.appName;
    setAccent(null);
    mount(container, loadingView());

    const signedIn = isSignedIn();
    // Kolekce a kategorie se načtou souběžně; „Continue watching“ (potřebuje zhlédnutí
    // a další dotazy) se doplní do hero karty později – nezdržuje vykreslení mřížky
    const continuePromise = signedIn
        ? fetchMyFilmCounts(true).then(fetchContinueWatching)
        : Promise.resolve(null);
    continuePromise.catch(() => null);

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

    // Zvolená kategorie se pamatuje; neexistující (smazaná) = vše
    let selected = loadPref("category", "all");
    if (selected !== "all" && !categories.some((c) => c.slug === selected)) selected = "all";

    const chips = h("div", { class: "chips", role: "tablist" });
    const count = h("span", { class: "muted" });
    const grid = h("div", { class: "collection-sections" });

    /** Překreslí filtr a mřížku podle zvolené kategorie (bez nového načítání). */
    function renderCollections() {
        const category = categories.find((c) => c.slug === selected);
        const visible = category
            ? universes.filter((u) => u.categoryIds.includes(category.id))
            : universes;

        mount(chips,
            chip("all", TEXTS.categoryAll, null, universes.length),
            categories
                .map((c) => ({ c, n: universes.filter((u) => u.categoryIds.includes(c.id)).length }))
                .filter(({ n }) => n > 0)
                .map(({ c, n }) => chip(c.slug, c.name, c.color, n)),
        );
        count.textContent = collections(visible.length);

        // Seskupení podle typu (série, studia, žánrové výběry); nadpisy jen když je typů víc
        const groups = KIND_ORDER
            .map((kind) => ({ kind, items: visible.filter((u) => (u.kind ?? "series") === kind) }))
            .filter((g) => g.items.length > 0);
        mount(grid, groups.map((g) => h("section", { class: "collection-section" },
            groups.length > 1 ? kindHeading(g.kind) : null,
            h("div", { class: "universe-grid" }, g.items.map((u, i) => universeCard(u, signedIn, groups.indexOf(g) === 0 && i < 5))),
        )));
    }

    /** Tlačítko filtru kategorie. */
    function chip(slug, label, color, n) {
        const active = selected === slug;
        const button = h("button", {
            class: `chip${active ? " chip--active" : ""}`,
            type: "button", role: "tab", "aria-selected": String(active),
            onClick: () => {
                selected = slug;
                savePref("category", slug);
                renderCollections();
            },
        }, label, h("span", { class: "chip__count" }, String(n)));
        if (color) {
            button.style.setProperty("--c", color);
            button.style.setProperty("--c-ink", inkFor(color));
        }
        return button;
    }

    const heroSlot = h("div", { class: "hero-slot" },
        signedIn ? h("div", { class: "hero-card hero-card--loading", "aria-hidden": "true" }) : heroCard(false, null));
    if (signedIn) {
        continuePromise
            .then((continueWatching) => {
                if (isCurrent()) mount(heroSlot, heroCard(true, continueWatching, () => universesView(container, context)));
            })
            .catch(() => { if (isCurrent()) mount(heroSlot, heroCard(true, null)); });
    }

    mount(container,
        heroSlot,
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.universesTitle),
            count,
        ),
        chips,
        grid,
    );
    renderCollections();
}

/** Nadpis skupiny podle typu kolekce. */
function kindHeading(kind) {
    const label = { series: TEXTS.kindSeries, studio: TEXTS.kindStudio, genre: TEXTS.kindGenre }[kind] ?? kind;
    return h("div", { class: "kind-heading" },
        h("h3", {}, label),
        kind === "genre" ? h("span", { class: "muted" }, TEXTS.kindGenreHint) : null,
    );
}

/** Velká karta nahoře: pokračování v univerzu, nebo přivítání. */
function heroCard(signedIn, continueWatching, refresh) {
    // Nepřihlášený – představení aplikace
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

    // Přihlášený, ale ještě nic neviděl (nebo má vše hotové)
    if (!continueWatching) {
        return h("section", { class: "hero-card" },
            h("div", { class: "hero-card__body" },
                h("span", { class: "eyebrow" }, TEXTS.heroWelcomeEyebrow),
                h("h1", { class: "hero-card__title" }, TEXTS.heroWelcomeTitle),
                h("p", { class: "hero-card__text" }, TEXTS.heroWelcomeText),
            ),
        );
    }

    // Continue watching – další neviděný film z naposledy sledovaného univerza
    const { universe, next } = continueWatching;
    const film = next.film;
    const color = universe.color;
    const markButton = h("button", {
        class: "btn btn--universe",
        type: "button",
        onClick: async () => {
            markButton.disabled = true;
            try {
                await addWatch(film.tmdb_id);
                refresh();
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                markButton.disabled = false;
            }
        },
    }, `+ ${TEXTS.markWatched}`);

    const card = h("section", { class: "hero-card" },
        h("div", { class: "hero-card__body" },
            h("span", { class: "eyebrow" }, format("continueEyebrow", universe.name)),
            h("h1", { class: "hero-card__title" }, film.title),
            h("div", { class: "pills" },
                pill(yearOf(film.release_date)),
                film.runtime ? pill(format("minutes", film.runtime)) : null,
                next.group_label ? pill(next.group_label, true) : null,
            ),
            h("div", { class: "hero-card__actions" },
                markButton,
                h("a", { class: "btn", href: `#/collection/${universe.slug}` }, TEXTS.openUniverse),
            ),
        ),
        posterUrl(film.poster_path)
            ? poster(film.poster_path, film.title, "hero-card__poster")
            : null,
    );
    if (color) {
        // barva univerza pro záři karty a tlačítko
        card.style.setProperty("--hc", color);
        card.style.setProperty("--u", color);
        card.style.setProperty("--u-ink", inkFor(color));
    }
    return card;
}

/** Kartička univerza – odkaz na detail. */
function universeCard(universe, signedIn, eager = false) {
    const progress = { total: universe.totalCount, watched: universe.watchedCount };
    const value = percent(progress);
    const complete = signedIn && progress.total > 0 && progress.watched === progress.total;

    const card = h("a", { class: "universe-card", href: `#/collection/${universe.slug}` },
        h("div", { class: "universe-card__media" },
            poster(universe.cover?.poster_path, universe.name, "universe-card__cover", eager),
        ),
        complete ? h("span", { class: "universe-card__badge" }, `✓ ${TEXTS.complete}`) : null,
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
                : h("p", { class: "universe-card__meta" }, movies(progress.total)),
        ),
    );
    if (universe.color) {
        card.style.setProperty("--c", universe.color);
        card.style.setProperty("--c-ink", inkFor(universe.color));
    }
    return card;
}

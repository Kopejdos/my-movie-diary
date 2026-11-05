// Obrazovka: přehled – hero karta (Continue watching / vítání) a mřížka univerz.

import { fetchUniverses, fetchMyFilmCounts, fetchContinueWatching, addWatch, percent } from "../data.js";
import { isSignedIn } from "../auth.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, posterUrl, pill, yearOf, toast, loadingView, errorView } from "../dom.js";

export async function universesView(container, context) {
    const { isCurrent } = context;
    document.title = TEXTS.appName;
    setAccent(null);
    mount(container, loadingView());

    const signedIn = isSignedIn();
    let universes, continueWatching;
    try {
        const counts = await fetchMyFilmCounts(signedIn);
        [universes, continueWatching] = await Promise.all([
            fetchUniverses(),
            signedIn ? fetchContinueWatching(counts) : Promise.resolve(null),
        ]);
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => universesView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    mount(container,
        heroCard(signedIn, continueWatching, () => universesView(container, context)),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.universesTitle),
            h("span", { class: "muted" }, format("universesCount", universes.length)),
        ),
        h("div", { class: "universe-grid" },
            universes.map((universe) => universeCard(universe, signedIn)),
        ),
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
                h("a", { class: "btn", href: `#/universe/${universe.slug}` }, TEXTS.openUniverse),
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
function universeCard(universe, signedIn) {
    const progress = { total: universe.totalCount, watched: universe.watchedCount };
    const value = percent(progress);
    const complete = signedIn && progress.total > 0 && progress.watched === progress.total;

    const card = h("a", { class: "universe-card", href: `#/universe/${universe.slug}` },
        h("div", { class: "universe-card__media" },
            poster(universe.cover?.poster_path, universe.name, "universe-card__cover"),
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

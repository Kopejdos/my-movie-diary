// Obrazovka: Coming soon (#/coming-soon, V3.3.1) – všechny oznámené filmy ze všech kolekcí
// v jednom seznamu, nejbližší premiéra nahoře, rozdělené po čtvrtletích (leden–březen…).
// Bez filtrů – kdo chce jen jednu sérii nebo studio, otevře si kolekci (oddíl Coming soon dole).
// Hranice: do konce roku letos + 5 (posouvá se sama, viz comingSoonLastYear v data.js).

import {
    fetchComingSoon, groupByQuarter, comingSoonLastYear, fetchWatchlistIds,
} from "../data.js";
import { isSignedIn } from "../auth.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, loadingView, errorView } from "../dom.js";
import { soonPill, soonPoster } from "./coming-soon.js";
import { watchlistStar, collectionPill } from "./film-controls.js";

export async function comingSoonView(container, context) {
    setAccent(null);
    document.title = `${TEXTS.navComingSoon} · ${TEXTS.appName}`;
    mount(container, loadingView());
    const signedIn = isSignedIn();

    let entries, watchlist;
    try {
        [entries, watchlist] = await Promise.all([fetchComingSoon(), fetchWatchlistIds(signedIn)]);
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => comingSoonView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const groups = groupByQuarter(entries);
    mount(container,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, h("span", { class: "calendar-icon", "aria-hidden": "true" }), TEXTS.comingSoonEyebrow),
            h("h1", {}, TEXTS.comingSoonTitle),
            h("p", { class: "muted" }, format("comingSoonPageIntro", comingSoonLastYear())),
        ),
        h("div", { class: "section-title" }, h("span"), h("span", { class: "muted" }, movies(entries.length))),
        entries.length === 0
            ? h("div", { class: "empty-filter" }, TEXTS.comingSoonPageEmpty)
            : groups.map((group) => h("section", { class: "soon-quarter" },
                h("h2", { class: "soon-quarter__title" },
                    quarterLabel(group),
                    group.quarter ? h("span", { class: "soon-quarter__tag" }, format("comingSoonQuarterTag", group.quarter)) : null,
                    h("span", { class: "soon-quarter__count" }, String(group.items.length))),
                h("ol", { class: "film-list" }, group.items.map((entry) => row(entry, watchlist, signedIn))),
            )),
    );
}

/** Nadpis čtvrtletí: „October – December 2026“, filmy bez data „Date to be announced“. */
export function quarterLabel(group) {
    if (!group.quarter) return TEXTS.comingSoonTbaGroup;
    const month = (index) => new Date(2000, index, 1).toLocaleDateString("en-GB", { month: "long" });
    const first = (group.quarter - 1) * 3;
    return format("comingSoonQuarter", month(first), month(first + 2), group.year);
}

/** Řádek filmu: plakát, název, datum s odpočtem, kolekce, ☆ watchlist. */
function row(entry, watchlist, signedIn) {
    const { film } = entry;
    return h("li", { class: "film film--soon" },
        soonPoster(film, "film__poster"),
        h("div", { class: "film__info" },
            h("h3", { class: "film__title" }, film.title),
            h("div", { class: "film__meta" },
                soonPill(film),
                entry.universes.map((u) => collectionPill(u)),
            ),
        ),
        signedIn ? h("div", { class: "film__actions" }, watchlistStar(film, watchlist)) : null,
    );
}


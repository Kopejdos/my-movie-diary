// Obrazovka: přehled univerz (kartičky s obalem a postupem).

import { fetchUniverses, percent } from "../data.js";
import { isSignedIn } from "../auth.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, poster, loadingView, errorView } from "../dom.js";

export async function universesView(container, { isCurrent }) {
    document.title = `${TEXTS.universesTitle} · ${TEXTS.appName}`;
    mount(container, loadingView());

    let universes;
    try {
        universes = await fetchUniverses();
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => universesView(container, { isCurrent })));
        return;
    }
    if (!isCurrent()) return;

    const signedIn = isSignedIn();

    mount(container,
        h("section", { class: "page-header" },
            h("h1", {}, TEXTS.universesTitle),
            h("p", { class: "muted" }, signedIn ? TEXTS.universesIntro : TEXTS.universesGuestHint),
        ),
        h("div", { class: "universe-grid" },
            universes.map((universe) => universeCard(universe, signedIn)),
        ),
    );
}

/** Kartička univerza – odkaz na detail. */
function universeCard(universe, signedIn) {
    const progress = { total: universe.totalCount, watched: universe.watchedCount };
    const value = percent(progress);
    const complete = progress.total > 0 && progress.watched === progress.total;

    return h("a", {
            class: `universe-card${complete ? " universe-card--complete" : ""}`,
            href: `#/universe/${universe.slug}`,
        },
        poster(universe.cover?.poster_path, universe.name, "universe-card__cover"),
        h("div", { class: "universe-card__body" },
            h("h2", { class: "universe-card__title" }, universe.name),
            signedIn
                ? [
                    h("div", { class: "progress", role: "progressbar",
                            "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": value },
                        h("div", { class: "progress__bar", style: `width: ${value}%` }),
                    ),
                    h("p", { class: "universe-card__meta" },
                        complete ? TEXTS.progressDone : format("progressCount", progress.watched, progress.total),
                    ),
                ]
                : h("p", { class: "universe-card__meta" }, format("movieCount", progress.total)),
        ),
    );
}

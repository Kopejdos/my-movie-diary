// Obrazovka: detail univerza – filmy v pořadí vydání, skupiny a counter zhlédnutí.

import {
    fetchUniverse, fetchMyFilmCounts, addWatch, removeLatestWatch,
    computeProgress, percent, todayLocal,
} from "../data.js";
import { isSignedIn } from "../auth.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, poster, yearOf, formatDate, toast, loadingView, errorView } from "../dom.js";

export async function universeView(container, { params, isCurrent }) {
    mount(container, loadingView());
    const signedIn = isSignedIn();

    let universe, counts;
    try {
        [universe, counts] = await Promise.all([
            fetchUniverse(params.slug),
            fetchMyFilmCounts(signedIn),
        ]);
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => universeView(container, { params, isCurrent })));
        return;
    }
    if (!isCurrent()) return;

    if (!universe) {
        mount(container,
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("div", { class: "state" }, h("p", {}, TEXTS.universeNotFound)),
        );
        return;
    }

    document.title = `${universe.name} · ${TEXTS.appName}`;
    new UniversePage(container, universe, counts, signedIn).render();
}

/**
 * Stránka univerza drží počty zhlédnutí a po kliknutí na +/− překreslí
 * jen dotčený film a ukazatel postupu, ne celou stránku.
 */
class UniversePage {
    constructor(container, universe, counts, signedIn) {
        this.container = container;
        this.universe = universe;
        this.counts = counts;
        this.signedIn = signedIn;
        this.progressBar = null;
        this.progressText = null;
    }

    render() {
        const { universe } = this;
        const hasOptional = universe.items.some((item) => item.is_optional);

        mount(this.container,
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("section", { class: "page-header" },
                h("h1", {}, universe.name),
                universe.description ? h("p", { class: "muted" }, universe.description) : null,
                this.signedIn ? this.renderProgress() : null,
                hasOptional ? h("p", { class: "hint" }, TEXTS.optionalHint) : null,
            ),
            h("ol", { class: "film-list" }, this.renderItems()),
        );
        this.updateProgress();
    }

    renderProgress() {
        this.progressBar = h("div", { class: "progress__bar" });
        this.progressText = h("p", { class: "progress-text" });
        return h("div", { class: "universe-progress" },
            h("div", { class: "progress progress--large" }, this.progressBar),
            this.progressText,
        );
    }

    /** Filmy s nadpisy skupin (nadpis se vloží při každé změně skupiny). */
    renderItems() {
        const nodes = [];
        let lastGroup;
        for (const item of this.universe.items) {
            if (item.group_label && item.group_label !== lastGroup) {
                nodes.push(h("li", { class: "film-group" }, item.group_label));
            }
            lastGroup = item.group_label;

            const row = h("li", { class: "film" });
            this.fillRow(row, item);
            nodes.push(row);
        }
        return nodes;
    }

    /** Obsah řádku filmu – volá se znovu po každé změně počtu. */
    fillRow(row, item, busy = false) {
        const { film } = item;
        const info = this.counts.get(film.tmdb_id);
        const count = info?.count ?? 0;

        row.className = `film${count > 0 ? " film--watched" : ""}${item.is_optional ? " film--optional" : ""}`;

        const meta = [yearOf(film.release_date), film.runtime ? format("minutes", film.runtime) : null]
            .filter(Boolean).join(" · ");

        mount(row,
            poster(film.poster_path, film.title, "film__poster"),
            h("div", { class: "film__info" },
                h("h3", { class: "film__title" }, film.title),
                h("p", { class: "film__meta" },
                    meta,
                    item.is_optional ? h("span", { class: "badge" }, TEXTS.optionalBadge) : null,
                ),
                this.signedIn
                    ? h("p", { class: "film__status" },
                        count > 0
                            ? `${format("watchedTimes", count)} · ${format("lastWatched", formatDate(info.lastWatchedOn))}`
                            : TEXTS.notWatched)
                    : null,
            ),
            this.signedIn
                ? this.renderCounter(row, item, count, busy)
                : h("a", { class: "btn btn--small btn--ghost", href: "#/login" }, TEXTS.signInToTrack),
        );
    }

    renderCounter(row, item, count, busy) {
        return h("div", { class: "counter" },
            h("button", {
                class: "counter__btn", type: "button",
                "aria-label": TEXTS.removeWatch, title: TEXTS.removeWatch,
                disabled: busy || count === 0,
                onClick: () => this.change(row, item, -1),
            }, "−"),
            h("span", { class: "counter__value", "aria-live": "polite" }, String(count)),
            h("button", {
                class: "counter__btn counter__btn--add", type: "button",
                "aria-label": TEXTS.addWatch, title: TEXTS.addWatch,
                disabled: busy,
                onClick: () => this.change(row, item, +1),
            }, "+"),
        );
    }

    /** +1 / −1: okamžitě upraví zobrazení, při chybě ho vrátí zpět. */
    async change(row, item, delta) {
        const tmdbId = item.film.tmdb_id;
        const before = this.counts.get(tmdbId);
        const beforeCount = before?.count ?? 0;
        const today = todayLocal();

        // Optimistická změna – uživatel vidí výsledek hned
        const optimistic = beforeCount + delta;
        if (optimistic <= 0) {
            this.counts.delete(tmdbId);
        } else {
            this.counts.set(tmdbId, {
                count: optimistic,
                lastWatchedOn: delta > 0 ? today : before?.lastWatchedOn,
            });
        }
        this.fillRow(row, item, true);
        this.updateProgress();

        try {
            if (delta > 0) {
                await addWatch(tmdbId);
            } else {
                await removeLatestWatch(tmdbId);
                // Po smazání se může změnit datum posledního zhlédnutí – načíst přesně
                const fresh = await fetchMyFilmCounts(true);
                const exact = fresh.get(tmdbId);
                if (exact) this.counts.set(tmdbId, exact); else this.counts.delete(tmdbId);
            }
        } catch (error) {
            // Vrátit původní stav
            if (before) this.counts.set(tmdbId, before); else this.counts.delete(tmdbId);
            toast(format("errorGeneric", error.message), "error");
        }
        this.fillRow(row, item, false);
        this.updateProgress();
    }

    updateProgress() {
        if (!this.progressBar) return;
        const progress = computeProgress(this.universe.items, this.counts);
        const value = percent(progress);
        this.progressBar.style.width = `${value}%`;
        this.progressText.textContent =
            progress.total > 0 && progress.watched === progress.total
                ? `${TEXTS.progressDone} ${format("progressCount", progress.watched, progress.total)}`
                : `${format("progressCount", progress.watched, progress.total)} · ${value} %`;
    }
}

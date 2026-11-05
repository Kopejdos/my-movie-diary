// Obrazovka: detail univerza – banner z filmu, Up next, filmy se skupinami a counterem.

import {
    fetchUniverse, fetchMyFilmCounts, addWatch, removeLatestWatch,
    computeProgress, percent, todayLocal, nextUnwatched,
} from "../data.js";
import { isSignedIn } from "../auth.js";
import { setAccent } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import {
    h, mount, poster, pill, backdropUrl, yearOf, formatDate, toast, loadingView, errorView,
} from "../dom.js";

export async function universeView(container, context) {
    const { params, isCurrent } = context;
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
            () => universeView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    if (!universe) {
        setAccent(null);
        mount(container,
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("div", { class: "state" }, h("p", {}, TEXTS.universeNotFound)),
        );
        return;
    }

    document.title = `${universe.name} · ${TEXTS.appName}`;
    setAccent(universe.color);
    new UniversePage(container, universe, counts, signedIn).render();
}

/**
 * Stránka univerza drží počty zhlédnutí a po kliknutí na +/− překreslí
 * jen dotčený film, Up next a ukazatel postupu, ne celou stránku.
 */
class UniversePage {
    constructor(container, universe, counts, signedIn) {
        this.container = container;
        this.universe = universe;
        this.counts = counts;
        this.signedIn = signedIn;
        this.rows = new Map();          // tmdb_id → prvek řádku
        this.progressBar = null;
        this.progressText = null;
        this.upNext = h("section", { class: "up-next-slot" });
    }

    render() {
        const { universe } = this;
        const hasOptional = universe.items.some((item) => item.is_optional);

        mount(this.container,
            this.renderBanner(),
            this.signedIn ? this.upNext : null,
            hasOptional ? h("p", { class: "hint", style: "margin-top: 18px" }, TEXTS.optionalHint) : null,
            h("ol", { class: "film-list" }, this.renderItems()),
        );
        this.updateProgress();
    }

    /** Banner: záběr z filmu přes celou šířku, přechází do pozadí. */
    renderBanner() {
        const { universe } = this;
        const image = backdropUrl(universe.cover?.backdrop_path ?? this.firstBackdrop());
        const required = universe.items.filter((item) => !item.is_optional).length;

        const banner = h("section", { class: "banner" },
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("div", { class: "banner__content" },
                h("h1", { class: "banner__title" }, universe.name),
                universe.description ? h("p", { class: "banner__description" }, universe.description) : null,
                h("div", { class: "pills" }, pill(format("movieCount", required), true)),
                this.signedIn ? this.renderProgress() : null,
            ),
        );
        if (image) banner.style.setProperty("--banner-image", `url("${image}")`);
        return banner;
    }

    /** Záložní banner, když obalový film nemá záběr. */
    firstBackdrop() {
        return this.universe.items.find((item) => item.film.backdrop_path)?.film.backdrop_path ?? null;
    }

    renderProgress() {
        this.progressBar = h("div", { class: "progress__bar" });
        this.progressText = h("p", { class: "progress-text" });
        return h("div", { class: "banner__progress" },
            h("div", { class: "progress progress--large" }, this.progressBar),
            this.progressText,
        );
    }

    /** Karta „Up next“ – další neviděný film, nebo gratulace k dokončení. */
    renderUpNext() {
        if (!this.signedIn) return;
        const next = nextUnwatched(this.universe.items, this.counts);

        if (!next) {
            mount(this.upNext,
                h("div", { class: "up-next up-next--done" },
                    h("span", { class: "up-next__trophy", "aria-hidden": "true" }, "🏆"),
                    h("div", { class: "up-next__info" },
                        h("span", { class: "eyebrow" }, TEXTS.universeComplete),
                        h("p", { class: "muted", style: "margin: 0" }, TEXTS.universeCompleteText),
                    ),
                ),
            );
            return;
        }

        const { film } = next;
        mount(this.upNext,
            h("div", { class: "up-next" },
                poster(film.poster_path, film.title, "up-next__poster"),
                h("div", { class: "up-next__info" },
                    h("span", { class: "eyebrow" }, TEXTS.upNext),
                    h("h2", { class: "up-next__title" }, film.title),
                    h("div", { class: "pills" },
                        pill(yearOf(film.release_date)),
                        film.runtime ? pill(format("minutes", film.runtime)) : null,
                        next.group_label ? pill(next.group_label) : null,
                    ),
                ),
                h("button", {
                    class: "btn btn--universe",
                    type: "button",
                    onClick: () => this.change(this.rows.get(film.tmdb_id), next, +1),
                }, `+ ${TEXTS.markWatched}`),
            ),
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
            this.rows.set(item.film.tmdb_id, row);
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

        mount(row,
            poster(film.poster_path, film.title, "film__poster"),
            h("div", { class: "film__info" },
                h("h3", { class: "film__title" }, film.title),
                h("div", { class: "film__meta" },
                    pill(yearOf(film.release_date)),
                    film.runtime ? pill(format("minutes", film.runtime)) : null,
                    item.is_optional ? pill(TEXTS.optionalBadge) : null,
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
                : h("a", { class: "btn btn--small", href: "#/login" }, TEXTS.signInToTrack),
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

        // Optimistická změna – uživatel vidí výsledek hned
        const optimistic = beforeCount + delta;
        if (optimistic <= 0) {
            this.counts.delete(tmdbId);
        } else {
            this.counts.set(tmdbId, {
                count: optimistic,
                lastWatchedOn: delta > 0 ? todayLocal() : before?.lastWatchedOn,
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

    /** Ukazatel postupu v banneru a karta Up next. */
    updateProgress() {
        this.renderUpNext();
        if (!this.progressBar) return;
        const progress = computeProgress(this.universe.items, this.counts);
        const value = percent(progress);
        this.progressBar.style.width = `${value}%`;
        this.progressText.textContent =
            progress.total > 0 && progress.watched === progress.total
                ? `🏆 ${TEXTS.progressDone} ${format("progressCount", progress.watched, progress.total)}`
                : `${format("progressCount", progress.watched, progress.total)} · ${value} %`;
    }
}

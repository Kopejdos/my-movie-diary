// Obrazovka: detail univerza – banner z filmu, Up next, filmy se skupinami a counterem.

import {
    fetchUniverse, fetchMyFilmCounts, addWatch, removeLatestWatch,
    computeProgress, percent, todayLocal, nextUnwatched,
    fetchWatchlistIds, addToWatchlist, removeFromWatchlist,
} from "../data.js";
import { isSignedIn } from "../auth.js";
import { setAccent } from "../theme.js";
import { loadPref, savePref } from "../prefs.js";
import { TEXTS, format, movies, steps } from "../texts.js";
import {
    h, mount, poster, pill, backdropUrl, yearOf, formatDate, toast, loadingView, errorView,
} from "../dom.js";

export async function universeView(container, context) {
    const { params, isCurrent } = context;
    mount(container, loadingView());
    const signedIn = isSignedIn();

    let universe, counts, watchlist;
    try {
        [universe, counts, watchlist] = await Promise.all([
            fetchUniverse(params.slug),
            fetchMyFilmCounts(signedIn),
            fetchWatchlistIds(signedIn),
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
    new UniversePage(container, universe, counts, watchlist, signedIn).render();
}

/**
 * Stránka univerza drží počty zhlédnutí a po kliknutí na +/− překreslí
 * jen dotčený film, Up next a ukazatel postupu, ne celou stránku.
 */
class UniversePage {
    constructor(container, universe, counts, watchlist, signedIn) {
        this.container = container;
        this.universe = universe;
        this.counts = counts;
        this.watchlist = watchlist;     // Set tmdb_id filmů ve watchlistu
        this.signedIn = signedIn;
        this.rows = new Map();          // tmdb_id → prvek řádku
        this.progressBar = null;
        this.progressText = null;
        this.upNext = h("section", { class: "up-next-slot" });
        this.list = h("ol", { class: "film-list" });
        this.toolbar = h("div", { class: "toolbar" });

        // Cesta = pevné pořadí kroků s poznámkami (bez přepínače pořadí)
        this.isPath = universe.kind === "path";
        this.stepNumbers = new Map(universe.items.map((item, index) => [item.film.tmdb_id, index + 1]));
        this.list.classList.toggle("film-list--path", this.isPath);

        // Pořadí příběhu má smysl jen tam, kde ho některý film má vyplněné
        this.hasStory = !this.isPath && universe.items.some((item) => item.story_order !== null);
        this.order = this.hasStory ? loadPref("order", "release") : "release";
        this.unwatchedOnly = signedIn && loadPref("unwatched", "0") === "1";
    }

    /** Filmy v aktuálně zvoleném pořadí. */
    sortedItems() {
        if (this.order !== "story") return this.universe.items;
        // Film bez čísla v příběhu jde za ty očíslované, v pořadí vydání
        const key = (item) => item.story_order ?? 10000 + item.release_order;
        return [...this.universe.items].sort((a, b) => key(a) - key(b));
    }

    render() {
        const { universe } = this;
        const hasOptional = universe.items.some((item) => item.is_optional);

        mount(this.container,
            this.renderBanner(),
            this.signedIn ? this.upNext : null,
            this.toolbar,
            hasOptional ? h("p", { class: "hint", style: "margin: 0 0 8px" }, TEXTS.optionalHint) : null,
            this.list,
        );
        this.renderToolbar();
        this.renderList();
        this.updateProgress();
    }

    /** Přepínač pořadí (jen když univerzum má pořadí příběhu) a filtr neviděných. */
    renderToolbar() {
        const option = (value, label) => h("button", {
            class: `segmented__option${this.order === value ? " segmented__option--active" : ""}`,
            type: "button",
            "aria-pressed": String(this.order === value),
            onClick: () => {
                this.order = value;
                savePref("order", value);
                this.renderToolbar();
                this.renderList();
                this.renderUpNext();
            },
        }, label);

        mount(this.toolbar,
            this.hasStory
                ? h("div", { class: "segmented", role: "group" },
                    option("release", TEXTS.orderRelease),
                    option("story", TEXTS.orderStory))
                : h("span"),
            this.signedIn
                ? h("button", {
                    class: "switch", type: "button", role: "switch",
                    "aria-checked": String(this.unwatchedOnly),
                    onClick: () => {
                        this.unwatchedOnly = !this.unwatchedOnly;
                        savePref("unwatched", this.unwatchedOnly ? "1" : "0");
                        this.renderToolbar();
                        this.renderList();
                    },
                }, h("span", { class: "switch__track", "aria-hidden": "true" }), TEXTS.unwatchedOnly)
                : null,
        );
    }

    /** Seznam filmů podle pořadí a filtru. */
    renderList() {
        const nodes = this.renderItems();
        mount(this.list, nodes.length > 0 ? nodes : h("li", { class: "empty-filter" }, TEXTS.filterEmpty));
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
                h("div", { class: "pills" },
                    pill(this.isPath ? steps(required) : movies(required), true),
                    universe.kind === "genre" ? pill(TEXTS.kindGenre) : null,
                    this.isPath ? pill(`🧭 ${TEXTS.kindPathBadge}`) : null,
                    (universe.categories ?? [])
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((c) => pill(c.name))),
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

    /** Karta „Up next“ – další neviděný film (v aktuálním pořadí), nebo gratulace. */
    renderUpNext() {
        if (!this.signedIn) return;
        const next = nextUnwatched(this.sortedItems(), this.counts);

        if (!next) {
            mount(this.upNext,
                h("div", { class: "up-next up-next--done" },
                    h("span", { class: "up-next__trophy", "aria-hidden": "true" }, "🏆"),
                    h("div", { class: "up-next__info" },
                        h("span", { class: "eyebrow" }, this.isPath ? TEXTS.pathComplete : TEXTS.universeComplete),
                        h("p", { class: "muted", style: "margin: 0" },
                            this.isPath ? TEXTS.pathCompleteText : TEXTS.universeCompleteText),
                    ),
                ),
            );
            return;
        }

        const { film } = next;
        mount(this.upNext,
            h("div", { class: "up-next" },
                poster(film.poster_path, film.title, "up-next__poster", false, "small"),
                h("div", { class: "up-next__info" },
                    h("span", { class: "eyebrow" }, this.isPath ? TEXTS.nextStep : TEXTS.upNext),
                    h("h2", { class: "up-next__title" }, film.title),
                    h("div", { class: "pills" },
                        this.isPath
                            ? pill(format("stepOf", this.stepNumbers.get(film.tmdb_id), this.universe.items.length), true)
                            : null,
                        pill(yearOf(film.release_date)),
                        film.runtime ? pill(format("minutes", film.runtime)) : null,
                        next.group_label ? pill(next.group_label) : null,
                    ),
                    this.isPath && next.note ? h("p", { class: "up-next__note" }, next.note) : null,
                ),
                h("button", {
                    class: "btn btn--universe",
                    type: "button",
                    onClick: () => this.change(this.rows.get(film.tmdb_id) ?? null, next, +1),
                }, `+ ${TEXTS.markWatched}`),
            ),
        );
    }

    /**
     * Řádky filmů. V pořadí vydání s nadpisy skupin (nadpis při každé změně skupiny);
     * v pořadí příběhu bez nich – skupiny by se rozházely.
     */
    renderItems() {
        const nodes = [];
        const showGroups = this.order === "release";
        this.rows.clear();
        let lastGroup;
        for (const item of this.sortedItems()) {
            if (this.unwatchedOnly && this.counts.has(item.film.tmdb_id)) continue;

            if (showGroups && item.group_label && item.group_label !== lastGroup) {
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

        row.className = `film${count > 0 ? " film--watched" : ""}${item.is_optional ? " film--optional" : ""}`
            + (this.isPath ? " film--step" : "");

        mount(row,
            // Číslo kroku cesty (viděný krok = ✓)
            this.isPath
                ? h("span", { class: "film__step", "aria-label": format("stepOf", this.stepNumbers.get(film.tmdb_id), this.universe.items.length) },
                    count > 0 ? "✓" : String(this.stepNumbers.get(film.tmdb_id)))
                : null,
            poster(film.poster_path, film.title, "film__poster", false, "small"),
            h("div", { class: "film__info" },
                h("h3", { class: "film__title" }, film.title),
                h("div", { class: "film__meta" },
                    pill(yearOf(film.release_date)),
                    film.runtime ? pill(format("minutes", film.runtime)) : null,
                    item.is_optional ? pill(TEXTS.optionalBadge) : null,
                ),
                this.isPath && item.note ? h("p", { class: "film__note" }, item.note) : null,
                this.signedIn
                    ? h("p", { class: "film__status" },
                        count > 0
                            ? `${format("watchedTimes", count)} · ${format("lastWatched", formatDate(info.lastWatchedOn))}`
                            : TEXTS.notWatched)
                    : null,
            ),
            this.signedIn
                ? h("div", { class: "film__actions" },
                    this.renderWatchlistButton(row, item),
                    this.renderCounter(row, item, count, busy))
                : h("a", { class: "btn btn--small", href: "#/login" }, TEXTS.signInToTrack),
        );
    }

    /** Hvězdička ☆ / ★ – přidá film do watchlistu nebo ho odebere. */
    renderWatchlistButton(row, item) {
        const tmdbId = item.film.tmdb_id;
        const inList = this.watchlist.has(tmdbId);
        const label = inList ? TEXTS.watchlistRemove : TEXTS.watchlistAdd;

        return h("button", {
            class: `star-btn${inList ? " star-btn--active" : ""}`,
            type: "button",
            title: label,
            "aria-label": label,
            "aria-pressed": String(inList),
            onClick: async () => {
                // Optimisticky – hvězdička se změní hned
                if (inList) this.watchlist.delete(tmdbId); else this.watchlist.add(tmdbId);
                this.fillRow(row, item);
                try {
                    if (inList) await removeFromWatchlist(tmdbId); else await addToWatchlist(tmdbId);
                    toast(inList ? TEXTS.watchlistRemoved : TEXTS.watchlistAdded);
                } catch (error) {
                    if (inList) this.watchlist.add(tmdbId); else this.watchlist.delete(tmdbId);
                    this.fillRow(row, item);
                    toast(format("errorGeneric", error.message), "error");
                }
            },
        }, inList ? "★" : "☆");
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
        if (row) this.fillRow(row, item, true);
        this.updateProgress();

        try {
            if (delta > 0) {
                await addWatch(tmdbId);
                this.watchlist.delete(tmdbId);   // viděný film opustí watchlist (trigger v databázi)
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
        if (this.unwatchedOnly) {
            this.renderList();          // viděný film z filtru zmizí
        } else if (row) {
            this.fillRow(row, item, false);
        }
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

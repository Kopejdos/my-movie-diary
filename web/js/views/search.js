// Obrazovka: vyhledávání filmů a kolekcí (#/search?q=…).
// Výsledky se počítají v prohlížeči při každém úhozu (logika v ../search.js).

import {
    fetchSearchData, fetchMyFilmCounts, fetchWatchlistIds,
    addWatch, removeLatestWatch, addToWatchlist, removeFromWatchlist, todayLocal,
} from "../data.js";
import {
    buildSearchIndex, parseQuery, searchFilms, searchCollections, filterByWatched,
    MAX_FILM_RESULTS, MAX_COLLECTION_RESULTS,
} from "../search.js";
import { isSignedIn } from "../auth.js";
import { replaceQuery } from "../router.js";
import { setAccent, inkFor } from "../theme.js";
import { loadPref, savePref } from "../prefs.js";
import { TEXTS, format, movies, collections } from "../texts.js";
import { h, mount, poster, pill, yearOf, formatDate, toast, loadingView, errorView } from "../dom.js";
import { universeCard } from "./universes.js";

const FILTERS = ["all", "unwatched", "watched"];

export async function searchView(container, context) {
    const { query, isCurrent } = context;
    document.title = `${TEXTS.searchTitle} · ${TEXTS.appName}`;
    setAccent(null);
    const signedIn = isSignedIn();

    // Pole pro hledání je tu hned – data se načtou na pozadí
    const input = h("input", {
        class: "search-box__input",
        type: "search",
        name: "q",
        placeholder: TEXTS.searchPlaceholder,
        "aria-label": TEXTS.searchPlaceholder,
        autocomplete: "off",
        autocapitalize: "off",
        spellcheck: "false",
        enterkeyhint: "search",
        value: query.get("q") ?? "",
    });
    const clear = h("button", {
        class: "search-box__clear", type: "button",
        title: TEXTS.searchClear, "aria-label": TEXTS.searchClear,
    }, "×");
    const results = h("div", { class: "search-page", "aria-live": "polite" }, loadingView());

    mount(container,
        h("section", { class: "page-header" },
            h("h1", {}, TEXTS.searchTitle),
            h("div", { class: "search-box" },
                h("span", { class: "search-icon", "aria-hidden": "true" }),
                input,
                clear),
        ),
        results,
    );
    input.focus();

    let data, counts, watchlist;
    const load = () => Promise.all([
        fetchSearchData(),
        fetchMyFilmCounts(signedIn),
        fetchWatchlistIds(signedIn),
    ]);
    try {
        [data, counts, watchlist] = await load();
    } catch (error) {
        if (!isCurrent()) return;
        mount(results, errorView(format("errorGeneric", error.message), () => searchView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    const page = new SearchPage(results, buildSearchIndex(data.universes, data.items), counts, watchlist, signedIn);
    // Klik na příklad v nápovědě = jako by ho uživatel napsal
    page.onExample = (text) => {
        input.value = text;
        update();
        input.focus();
    };

    // Psaní: výsledky s malým zpožděním (plakáty neproblikávají), adresa se přepíše bez historie
    let timer = null;
    const update = () => {
        clear.hidden = input.value === "";
        clearTimeout(timer);
        timer = setTimeout(() => {
            const text = input.value.trim();
            replaceQuery(text ? { q: text } : {});
            page.search(text);
        }, 120);
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (input.value) {
                input.value = "";
                update();
            } else {
                input.blur();
            }
        } else if (event.key === "Enter") {
            input.blur();          // na telefonu schová klávesnici, ať jsou vidět výsledky
        }
    });
    clear.addEventListener("click", () => {
        input.value = "";
        update();
        input.focus();
    });

    clear.hidden = input.value === "";
    page.search(input.value.trim());
}

/**
 * Výsledky hledání. Drží počty zhlédnutí a watchlist, takže +1 / −1
 * a hvězdička překreslí jen svůj řádek.
 */
class SearchPage {
    constructor(container, index, counts, watchlist, signedIn) {
        this.container = container;
        this.index = index;
        this.counts = counts;
        this.watchlist = watchlist;
        this.signedIn = signedIn;
        this.text = "";
        this.onExample = () => {};
        this.filter = signedIn && FILTERS.includes(loadPref("searchFilter", "all"))
            ? loadPref("searchFilter", "all")
            : "all";
    }

    search(text) {
        this.text = text;
        this.render();
    }

    render() {
        const query = parseQuery(this.text);
        if (!query) {
            mount(this.container, this.renderIntro());
            return;
        }

        const foundCollections = searchCollections(this.index, query);
        const allFilms = searchFilms(this.index, query);
        const films = filterByWatched(allFilms, this.filter, this.counts);

        if (foundCollections.length === 0 && allFilms.length === 0) {
            mount(this.container,
                h("div", { class: "empty-filter" },
                    h("p", { style: "margin: 0 0 6px" }, format("searchNoResults", this.text)),
                    h("p", { class: "hint", style: "margin: 0" }, TEXTS.searchNoResultsHint)));
            return;
        }

        mount(this.container,
            foundCollections.length > 0
                ? [
                    h("div", { class: "section-title" },
                        h("h2", {}, TEXTS.searchCollections),
                        h("span", { class: "muted" }, collections(foundCollections.length))),
                    h("div", { class: "universe-grid universe-grid--search" },
                        foundCollections.slice(0, MAX_COLLECTION_RESULTS)
                            .map((r) => universeCard(r.universe, this.signedIn))),
                ]
                : null,
            allFilms.length > 0 ? this.renderFilms(films) : null,
        );
    }

    /** Prázdné pole – nápověda s příklady (klikací). */
    renderIntro() {
        const example = (text) => h("button", {
            class: "chip", type: "button", onClick: () => this.onExample(text),
        }, text);

        return h("div", { class: "search-intro" },
            h("p", { class: "muted", style: "margin: 0 0 12px" },
                format("searchIntro", movies(this.index.films.length), collections(this.index.collections.length))),
            h("div", { class: "chips chips--wrap" }, TEXTS.searchExamples.map(example)),
            h("p", { class: "hint", style: "margin: 14px 0 0" }, TEXTS.searchShortcutHint),
        );
    }

    renderFilms(films) {
        const shown = films.slice(0, MAX_FILM_RESULTS);
        return [
            h("div", { class: "section-title" },
                h("h2", {}, TEXTS.searchMovies),
                h("span", { class: "muted" }, movies(films.length))),
            this.signedIn ? this.renderFilter() : null,
            h("ol", { class: "film-list" },
                shown.length > 0
                    ? shown.map((r) => this.renderRow(r.entry))
                    : h("li", { class: "empty-filter" }, TEXTS.searchFilterEmpty)),
            films.length > shown.length
                ? h("p", { class: "hint search-more" }, format("searchMore", shown.length, films.length))
                : null,
        ];
    }

    /** All / Unwatched / Watched – pamatuje se. */
    renderFilter() {
        const labels = { all: TEXTS.searchFilterAll, unwatched: TEXTS.searchFilterUnwatched, watched: TEXTS.searchFilterWatched };
        return h("div", { class: "toolbar" },
            h("div", { class: "segmented", role: "group" },
                FILTERS.map((value) => h("button", {
                    class: `segmented__option${this.filter === value ? " segmented__option--active" : ""}`,
                    type: "button",
                    "aria-pressed": String(this.filter === value),
                    onClick: () => {
                        this.filter = value;
                        savePref("searchFilter", value);
                        this.render();
                    },
                }, labels[value]))),
        );
    }

    /** Řádek filmu: plakát, název, rok, kolekce, stav a ovládání. */
    renderRow(entry) {
        const row = h("li", { class: "film film--search" });
        this.fillRow(row, entry);
        return row;
    }

    fillRow(row, entry, busy = false) {
        const { film } = entry;
        const info = this.counts.get(film.tmdb_id);
        const count = info?.count ?? 0;
        row.className = `film film--search${count > 0 ? " film--watched" : ""}`;

        mount(row,
            poster(film.poster_path, film.title, "film__poster"),
            h("div", { class: "film__info" },
                h("h3", { class: "film__title" }, film.title),
                h("div", { class: "film__meta" },
                    pill(yearOf(film.release_date)),
                    film.runtime ? pill(format("minutes", film.runtime)) : null,
                    entry.universes.map(collectionLink),
                ),
                this.signedIn
                    ? h("p", { class: "film__status" },
                        count > 0
                            ? `${format("watchedTimes", count)} · ${format("lastWatched", formatDate(info.lastWatchedOn))}`
                            : TEXTS.notWatched)
                    : null,
            ),
            this.signedIn
                ? h("div", { class: "film__actions" },
                    this.renderStar(row, entry),
                    this.renderCounter(row, entry, count, busy))
                : null,
        );
    }

    /** Hvězdička ☆ / ★ – watchlist. */
    renderStar(row, entry) {
        const tmdbId = entry.film.tmdb_id;
        const inList = this.watchlist.has(tmdbId);
        const label = inList ? TEXTS.watchlistRemove : TEXTS.watchlistAdd;
        return h("button", {
            class: `star-btn${inList ? " star-btn--active" : ""}`,
            type: "button", title: label, "aria-label": label, "aria-pressed": String(inList),
            onClick: async () => {
                if (inList) this.watchlist.delete(tmdbId); else this.watchlist.add(tmdbId);
                this.fillRow(row, entry);
                try {
                    if (inList) await removeFromWatchlist(tmdbId); else await addToWatchlist(tmdbId);
                    toast(inList ? TEXTS.watchlistRemoved : TEXTS.watchlistAdded);
                } catch (error) {
                    if (inList) this.watchlist.add(tmdbId); else this.watchlist.delete(tmdbId);
                    this.fillRow(row, entry);
                    toast(format("errorGeneric", error.message), "error");
                }
            },
        }, inList ? "★" : "☆");
    }

    renderCounter(row, entry, count, busy) {
        return h("div", { class: "counter" },
            h("button", {
                class: "counter__btn", type: "button",
                "aria-label": TEXTS.removeWatch, title: TEXTS.removeWatch,
                disabled: busy || count === 0,
                onClick: () => this.change(row, entry, -1),
            }, "−"),
            h("span", { class: "counter__value", "aria-live": "polite" }, String(count)),
            h("button", {
                class: "counter__btn counter__btn--add", type: "button",
                "aria-label": TEXTS.addWatch, title: TEXTS.addWatch,
                disabled: busy,
                onClick: () => this.change(row, entry, +1),
            }, "+"),
        );
    }

    /** +1 / −1 – okamžitě v řádku, při chybě zpět. Filtr se nepřepočítá, ať řádek nezmizí pod prstem. */
    async change(row, entry, delta) {
        const tmdbId = entry.film.tmdb_id;
        const before = this.counts.get(tmdbId);
        const next = (before?.count ?? 0) + delta;
        if (next <= 0) {
            this.counts.delete(tmdbId);
        } else {
            this.counts.set(tmdbId, { count: next, lastWatchedOn: delta > 0 ? todayLocal() : before?.lastWatchedOn });
        }
        this.fillRow(row, entry, true);

        try {
            if (delta > 0) {
                await addWatch(tmdbId);
                this.watchlist.delete(tmdbId);       // viděný film opustí watchlist (trigger v databázi)
            } else {
                await removeLatestWatch(tmdbId);
                const exact = (await fetchMyFilmCounts(true)).get(tmdbId);
                if (exact) this.counts.set(tmdbId, exact); else this.counts.delete(tmdbId);
            }
        } catch (error) {
            if (before) this.counts.set(tmdbId, before); else this.counts.delete(tmdbId);
            toast(format("errorGeneric", error.message), "error");
        }
        this.fillRow(row, entry, false);
    }
}

/** Barevná pilulka s odkazem na kolekci. */
function collectionLink(universe) {
    const link = h("a", { class: "pill pill--universe", href: `#/collection/${universe.slug}` }, universe.name);
    if (universe.color) {
        link.style.setProperty("--c", universe.color);
        link.style.setProperty("--c-ink", inkFor(universe.color));
    }
    return link;
}

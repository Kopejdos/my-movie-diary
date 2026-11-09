// Obrazovka: požadavky na filmy (#/requests, V3.5.1) – jen pro přihlášené.
//   • Nový požadavek – dva druhy (V3.5.2):
//       Movies     – libovolné filmy z TMDB (až 20), nepovinná poznámka;
//       Collection – celá série TMDB: vybere se jeden film, načte se jeho série
//                    a do požadavku jdou jen její díly (cizí film → „nuh uh“).
//   • My requests: vlastní požadavky se stavem (Pending / Added / Rejected / Partly added).
//   • Wanted movies: všechny požadované filmy (bez jmen žadatelů), hledání a +1.

import {
    searchTmdbForRequest, createFilmRequest, fetchWantedFilms, fetchMyRequests, voteForFilm,
    cancelFilmRequest, openRequestCount, fetchSeriesForRequest, createCollectionRequest,
    MAX_REQUEST_FILMS, MAX_OPEN_REQUESTS, MAX_NOTE,
} from "../requests.js";
import { isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, yearOf, toast, loadingView, errorView, formatDate } from "../dom.js";
import { collectionPill } from "./film-controls.js";

const SEARCH_DELAY = 350;          // ms po posledním znaku, než se zeptáme TMDB
const WANTED_TABS = ["pending", "added", "rejected"];
const MODES = ["films", "collection"];   // druh nového požadavku (V3.5.2)

export async function requestsView(container, context) {
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    document.title = `${TEXTS.requestsTitle} · ${TEXTS.appName}`;
    mount(container, loadingView());

    let mine, wanted;
    try {
        [mine, wanted] = await Promise.all([fetchMyRequests(), fetchWantedFilms("", "pending")]);
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message), () => requestsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const page = new RequestsPage(mine, wanted, context.query?.get("q") ?? "");
    mount(container,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, h("span", { class: "request-icon", "aria-hidden": "true" }), TEXTS.requestsEyebrow),
            h("h1", {}, TEXTS.requestsTitle),
            h("p", { class: "muted" }, format("requestsIntro", MAX_REQUEST_FILMS)),
        ),
        page.composer,
        page.mineSection,
        page.wantedSection,
    );
    page.start();
}

class RequestsPage {
    constructor(mine, wanted, initialQuery) {
        this.mine = mine;
        this.wanted = wanted;
        this.selected = new Map();          // tmdb_id → výsledek hledání (režim Movies)
        this.results = [];
        this.mode = "films";                // films | collection
        this.series = null;                 // vybraná série TMDB (režim Collection)
        this.seriesPicked = new Set();      // zaškrtnuté díly série
        this.seriesLoading = null;          // tmdb_id filmu, jehož série se právě načítá
        this.wantedTab = "pending";
        this.wantedQuery = "";
        this.initialQuery = initialQuery;

        this.composer = h("section", { class: "req-composer" });
        this.mineSection = h("section", { class: "req-section" });
        this.wantedSection = h("section", { class: "req-section" });
        this.buildComposer();
        this.renderMine();
        this.buildWanted();
    }

    start() {
        if (this.initialQuery) {
            this.searchInput.value = this.initialQuery;
            this.search(this.initialQuery);
        }
    }

    // ----- Nový požadavek -------------------------------------------------

    buildComposer() {
        this.searchInput = h("input", {
            class: "search-box__input", type: "search", name: "request-search", autocomplete: "off", maxlength: 100,
            placeholder: TEXTS.requestsSearchPlaceholder, "aria-label": TEXTS.requestsSearchPlaceholder,
        });
        let timer = null;
        this.searchInput.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => this.search(this.searchInput.value), SEARCH_DELAY);
        });
        this.resultsBox = h("ul", { class: "req-results", "aria-live": "polite" });
        this.selectedBox = h("div", { class: "req-selected" });
        this.note = h("textarea", {
            name: "note", rows: 2, maxlength: MAX_NOTE, placeholder: TEXTS.requestsNotePlaceholder,
            "aria-label": TEXTS.requestsNoteLabel,
        });
        this.submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.requestsSend);
        this.limitNote = h("p", { class: "notice req-limit" });
        this.modeTabs = h("div", { class: "segmented req-modes", role: "group", "aria-label": TEXTS.requestsKind });
        this.modeHint = h("p", { class: "hint req-mode-hint" });
        this.seriesMessage = h("p", { class: "req-series-message", role: "alert", hidden: true });

        mount(this.composer,
            h("form", {
                class: "req-form", novalidate: true,
                onSubmit: (event) => { event.preventDefault(); this.send(); },
            },
                h("div", { class: "req-form__top" },
                    h("h2", { class: "req-form__title" }, TEXTS.requestsNew),
                    this.modeTabs),
                this.modeHint,
                this.limitNote,
                h("div", { class: "search-box req-search" },
                    h("span", { class: "search-icon", "aria-hidden": "true" }), this.searchInput),
                this.seriesMessage,
                this.resultsBox,
                this.selectedBox,
                this.note,
                h("div", { class: "req-form__actions" }, this.submit),
            ));
        this.renderModes();
        this.renderSelected();
        this.renderLimit();
    }

    /** Přepínač Movies | Collection a nápověda k vybranému druhu. */
    renderModes() {
        mount(this.modeTabs, MODES.map((mode) => h("button", {
            class: `segmented__option${this.mode === mode ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(this.mode === mode),
            onClick: () => this.setMode(mode),
        }, TEXTS[`requestsMode_${mode}`])));
        this.modeHint.textContent = this.mode === "films"
            ? format("requestsModeHint_films", MAX_REQUEST_FILMS)
            : TEXTS.requestsModeHint_collection;
        this.searchInput.placeholder = this.mode === "films" ? TEXTS.requestsSearchPlaceholder : TEXTS.requestsSeriesSearchPlaceholder;
        this.searchInput.setAttribute("aria-label", this.searchInput.placeholder);
    }

    setMode(mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        this.hideSeriesMessage();
        this.renderModes();
        this.renderResults();
        this.renderSelected();
    }

    /** Hláška nad výsledky (cizí série, film bez série…); null = schovat. */
    showSeriesMessage(...content) {
        mount(this.seriesMessage, ...content);
        this.seriesMessage.hidden = false;
    }

    hideSeriesMessage() {
        this.seriesMessage.hidden = true;
        mount(this.seriesMessage);
    }

    renderLimit() {
        const open = openRequestCount(this.mine);
        this.limitNote.textContent = open >= MAX_OPEN_REQUESTS ? format("requestsLimitNote", MAX_OPEN_REQUESTS) : "";
        this.limitNote.hidden = open < MAX_OPEN_REQUESTS;
    }

    async search(text) {
        const query = text.trim();
        if (query.length < 2) {
            this.results = [];
            this.renderResults();
            return;
        }
        this.lastQuery = query;
        mount(this.resultsBox, h("li", { class: "req-results__state muted" }, TEXTS.requestsSearching));
        try {
            const results = await searchTmdbForRequest(query);
            if (this.lastQuery !== query) return;          // mezitím se psalo dál
            this.results = results;
            this.renderResults();
        } catch (error) {
            mount(this.resultsBox, h("li", { class: "req-results__state form-error" }, format("errorGeneric", error.message)));
        }
    }

    renderResults() {
        if (this.results.length === 0) {
            mount(this.resultsBox, this.lastQuery && this.searchInput.value.trim().length >= 2
                ? h("li", { class: "req-results__state muted" }, TEXTS.requestsNoResults)
                : null);
            return;
        }
        mount(this.resultsBox, this.results.map((film) => {
            if (this.mode === "collection") return this.seriesResult(film);
            const picked = this.selected.has(film.tmdb_id);
            let action;
            if (film.state === "in_catalog") {
                action = h("a", { class: "pill pill--added", href: `#/search?q=${encodeURIComponent(film.title)}` }, `✓ ${TEXTS.requestsInCatalog}`);
            } else if (film.state === "mine") {
                action = h("span", { class: "pill" }, `✓ ${TEXTS.requestsAlreadyMine}`);
            } else {
                const label = picked ? `✓ ${TEXTS.requestsPicked}` : film.state === "pending" ? `+1 ${TEXTS.requestsWanted}` : `+ ${TEXTS.requestsAdd}`;
                action = h("button", {
                    class: `btn btn--small${picked ? " btn--picked" : film.state === "pending" ? "" : " btn--primary"}`,
                    type: "button", "aria-pressed": String(picked),
                    onClick: () => this.toggle(film),
                }, label);
            }
            return h("li", { class: "req-result" },
                poster(film.poster_path, film.title, "req-result__poster", false, "tiny"),
                h("span", { class: "req-result__info" },
                    h("strong", {}, film.title),
                    h("span", { class: "muted" }, [film.year, film.state === "pending" ? TEXTS.requestsPendingHint : null].filter(Boolean).join(" · "))),
                action);
        }));
    }

    /** Výsledek hledání v režimu Collection: vybrat sérii / přidat díl / „nuh uh“. */
    seriesResult(film) {
        let action;
        if (!this.series) {
            const loading = this.seriesLoading === film.tmdb_id;
            action = h("button", {
                class: "btn btn--small btn--primary", type: "button", disabled: loading,
                onClick: () => this.chooseSeries(film),
            }, loading ? TEXTS.requestsSeriesLoading : TEXTS.requestsChooseSeries);
        } else {
            const part = this.series.collection.parts.find((p) => p.tmdb_id === film.tmdb_id);
            const picked = part && this.seriesPicked.has(film.tmdb_id);
            action = h("button", {
                class: `btn btn--small${picked ? " btn--picked" : part ? " btn--primary" : ""}`,
                type: "button", "aria-pressed": String(Boolean(picked)),
                onClick: () => part ? this.togglePart(film.tmdb_id) : this.nuhUh(film),
            }, picked ? `✓ ${TEXTS.requestsPicked}` : `+ ${TEXTS.requestsAdd}`);
        }
        return h("li", { class: "req-result" },
            poster(film.poster_path, film.title, "req-result__poster", false, "tiny"),
            h("span", { class: "req-result__info" },
                h("strong", {}, film.title),
                h("span", { class: "muted" }, [film.year, film.state === "in_catalog" ? TEXTS.requestsInCatalog : null].filter(Boolean).join(" · "))),
            action);
    }

    /** Načte sérii TMDB, do které film patří, a nabídne její díly. */
    async chooseSeries(film) {
        this.hideSeriesMessage();
        this.seriesLoading = film.tmdb_id;
        this.renderResults();
        try {
            const data = await fetchSeriesForRequest(film.tmdb_id);
            if (!data.collection) {
                this.showSeriesMessage(format("requestsNoSeries", film.title), " ",
                    h("button", { class: "link-button", type: "button", onClick: () => this.setMode("films") }, TEXTS.requestsSwitchToMovies));
            } else if (data.in_mmd) {
                this.showSeriesMessage(`${format("requestsSeriesInMmd", data.collection.name)}:`, " ",
                    h("a", { href: `#/collection/${data.in_mmd.slug}` }, data.in_mmd.name));
            } else if (data.pending) {
                this.showSeriesMessage(format("requestsSeriesPending", data.collection.name));
            } else {
                this.series = data;
                this.seriesPicked = new Set(data.collection.parts.map((p) => p.tmdb_id));
            }
        } catch (error) {
            this.showSeriesMessage(format("errorGeneric", error.message));
        }
        this.seriesLoading = null;
        this.renderResults();
        this.renderSelected();
    }

    /** Film z jiné série do požadavku na kolekci nepatří. */
    nuhUh(film) {
        const message = format("requestsNotSameSeries", film.title, this.series.collection.name);
        this.showSeriesMessage(h("strong", {}, TEXTS.requestsNuhUh), " ", message);
        this.seriesMessage.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    togglePart(tmdbId) {
        if (this.seriesPicked.has(tmdbId)) this.seriesPicked.delete(tmdbId);
        else this.seriesPicked.add(tmdbId);
        this.hideSeriesMessage();
        this.renderResults();
        this.renderSelected();
    }

    clearSeries() {
        this.series = null;
        this.seriesPicked = new Set();
        this.hideSeriesMessage();
        this.renderResults();
        this.renderSelected();
    }

    /** Karta vybrané série: díly se zaškrtávátky (předem všechny), filmy v MMD označené. */
    renderSeries() {
        if (!this.series) {
            this.submit.disabled = true;
            mount(this.selectedBox, h("p", { class: "hint req-selected__empty" }, TEXTS.requestsSeriesHint));
            return;
        }
        const { collection } = this.series;
        this.submit.disabled = this.seriesPicked.size < 2;
        mount(this.selectedBox,
            h("div", { class: "req-series" },
                h("div", { class: "req-series__head" },
                    h("span", { class: "req-series__title" },
                        h("span", { class: "eyebrow" }, TEXTS.requestsSeriesLabel),
                        h("strong", {}, collection.name)),
                    h("button", { class: "btn btn--small", type: "button", onClick: () => this.clearSeries() }, TEXTS.requestsChangeSeries)),
                h("p", { class: "req-selected__count" },
                    format("requestsSeriesSelected", this.seriesPicked.size, collection.parts.length),
                    this.seriesPicked.size < 2 ? h("span", { class: "muted" }, ` · ${TEXTS.requestsSeriesTooFew}`) : null),
                h("ul", { class: "req-series__parts" }, collection.parts.map((part) => {
                    const checkbox = h("input", {
                        type: "checkbox", checked: this.seriesPicked.has(part.tmdb_id),
                        onChange: () => this.togglePart(part.tmdb_id),
                    });
                    return h("li", {},
                        h("label", { class: "req-series__part" }, checkbox,
                            poster(part.poster_path, part.title, "req-film__poster", false, "tiny"),
                            h("span", { class: "req-wanted__info" },
                                h("strong", {}, part.title),
                                h("span", { class: "muted" }, part.year ?? TEXTS.requestsSeriesNoDate)),
                            part.in_catalog ? h("span", { class: "pill pill--added" }, `✓ ${TEXTS.requestsInCatalog}`) : null));
                }))));
    }

    toggle(film) {
        if (this.selected.has(film.tmdb_id)) {
            this.selected.delete(film.tmdb_id);
        } else {
            if (this.selected.size >= MAX_REQUEST_FILMS) {
                toast(format("requestsTooMany", MAX_REQUEST_FILMS), "error");
                return;
            }
            this.selected.set(film.tmdb_id, film);
        }
        this.renderResults();
        this.renderSelected();
    }

    renderSelected() {
        if (this.mode === "collection") {
            this.renderSeries();
            return;
        }
        const films = [...this.selected.values()];
        this.submit.disabled = films.length === 0;
        mount(this.selectedBox,
            films.length === 0
                ? h("p", { class: "hint req-selected__empty" }, TEXTS.requestsPickHint)
                : [
                    h("p", { class: "req-selected__count" }, format("requestsSelected", films.length, MAX_REQUEST_FILMS)),
                    h("div", { class: "chips chips--wrap" }, films.map((film) => h("button", {
                        class: "chip chip--active req-chip", type: "button",
                        title: TEXTS.requestsRemovePick, "aria-label": `${TEXTS.requestsRemovePick}: ${film.title}`,
                        onClick: () => this.toggle(film),
                    }, `${film.title}${film.year ? ` (${film.year})` : ""}`, h("span", { "aria-hidden": "true" }, " ×")))),
                ]);
    }

    /** Odeslání požadavku na kolekci (jen díly vybrané série, aspoň 2). */
    async sendCollection() {
        if (!this.series || this.seriesPicked.size < 2) return;
        this.submit.disabled = true;
        try {
            const result = await createCollectionRequest(this.series.collection.id,
                this.series.collection.parts.map((p) => p.tmdb_id).filter((id) => this.seriesPicked.has(id)),     // v pořadí série
                this.note.value);
            toast(format("requestsSentCollection", result.collection, movies(result.requested.length)));
            this.series = null;
            this.seriesPicked = new Set();
            this.note.value = "";
            this.searchInput.value = "";
            this.results = [];
            this.renderResults();
            this.renderSelected();
            await this.reload();
        } catch (error) {
            const name = this.series?.collection.name ?? "";
            const text = {
                not_same_series: `${TEXTS.requestsNuhUh} ${format("requestsNotSameSeriesAny", name)}`,
                too_few: TEXTS.requestsSeriesTooFew,
                too_many: format("requestsTooMany", MAX_REQUEST_FILMS),
                collection_exists: format("requestsSeriesInMmd", name),
                collection_pending: format("requestsSeriesPending", name),
                limit: format("requestsLimitNote", MAX_OPEN_REQUESTS),
            }[error.code] ?? format("errorGeneric", error.message);
            toast(text, "error");
            this.showSeriesMessage(text);
            this.submit.disabled = false;
        }
    }

    async send() {
        if (this.mode === "collection") {
            await this.sendCollection();
            return;
        }
        const ids = [...this.selected.keys()];
        if (ids.length === 0) return;
        this.submit.disabled = true;
        try {
            const result = await createFilmRequest(ids, this.note.value);
            const parts = [];
            if (result.requested.length) parts.push(format("requestsSentFilms", movies(result.requested.length)));
            if (result.voted.length) parts.push(format("requestsSentVotes", movies(result.voted.length)));
            if (result.in_catalog.length) parts.push(format("requestsSentInCatalog", movies(result.in_catalog.length)));
            toast(parts.join(" ") || TEXTS.requestsSentNothing);
            this.selected.clear();
            this.note.value = "";
            this.searchInput.value = "";
            this.results = [];
            this.renderResults();
            this.renderSelected();
            await this.reload();
        } catch (error) {
            const text = {
                limit: format("requestsLimitNote", MAX_OPEN_REQUESTS),
                too_many: format("requestsTooMany", MAX_REQUEST_FILMS),
            }[error.code] ?? format("errorGeneric", error.message);
            toast(text, "error");
            this.submit.disabled = false;
        }
    }

    async reload() {
        try {
            [this.mine, this.wanted] = await Promise.all([fetchMyRequests(), fetchWantedFilms(this.wantedQuery, this.wantedTab)]);
            this.renderMine();
            this.renderWanted();
            this.renderLimit();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    }

    // ----- Moje požadavky -------------------------------------------------

    renderMine() {
        mount(this.mineSection,
            h("h2", { class: "req-section__title" }, TEXTS.requestsMine, h("span", { class: "friends__count" }, String(this.mine.length))),
            this.mine.length === 0
                ? h("p", { class: "empty-filter" }, TEXTS.requestsMineEmpty)
                : h("ul", { class: "req-list" }, this.mine.map((request) => this.requestCard(request))));
    }

    requestCard(request) {
        const canCancel = request.items.every((i) => i.status === "pending");
        const cancel = canCancel
            ? h("button", {
                class: "btn btn--small", type: "button",
                onClick: async (event) => {
                    event.currentTarget.disabled = true;
                    try {
                        await cancelFilmRequest(request.id);
                        toast(TEXTS.requestsCanceled);
                        await this.reload();
                    } catch (error) {
                        toast(format("errorGeneric", error.message), "error");
                    }
                },
            }, TEXTS.requestsCancel)
            : null;
        return h("li", { class: `req-card req-card--${request.status}` },
            h("div", { class: "req-card__head" },
                statusPill(request.status),
                h("span", { class: "muted" }, formatDate(request.created_at.slice(0, 10))),
                h("span", { class: "muted" }, movies(request.items.length)),
                cancel),
            request.kind === "collection"
                ? h("p", { class: "req-card__kind" }, h("span", { class: "eyebrow" }, TEXTS.requestsSeriesLabel), " ", h("strong", {}, request.collection_name))
                : null,
            request.note ? h("p", { class: "req-card__note" }, `“${request.note}”`) : null,
            h("ul", { class: "req-card__films" }, request.items.map((item) => h("li", { class: "req-film" },
                poster(item.poster_path, item.title, "req-film__poster", false, "tiny"),
                h("span", { class: "req-film__title" }, item.title, item.release_date ? h("span", { class: "muted" }, ` (${yearOf(item.release_date)})`) : null),
                statusPill(item.status),
                item.universe ? collectionPill(item.universe) : null))),
        );
    }

    // ----- Požadované filmy -----------------------------------------------

    buildWanted() {
        this.wantedFilter = h("input", {
            class: "search-box__input", type: "search", name: "wanted-filter", autocomplete: "off",
            placeholder: TEXTS.requestsWantedFilter, "aria-label": TEXTS.requestsWantedFilter,
        });
        let timer = null;
        this.wantedFilter.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                this.wantedQuery = this.wantedFilter.value.trim();
                this.loadWanted();
            }, SEARCH_DELAY);
        });
        this.wantedTabs = h("div", { class: "segmented", role: "group", "aria-label": TEXTS.requestsWanted });
        this.wantedList = h("div");
        mount(this.wantedSection,
            h("h2", { class: "req-section__title" }, TEXTS.requestsWantedTitle),
            h("p", { class: "hint" }, TEXTS.requestsWantedHint),
            h("div", { class: "toolbar req-toolbar" }, this.wantedTabs,
                h("div", { class: "search-box req-filter" }, h("span", { class: "search-icon", "aria-hidden": "true" }), this.wantedFilter)),
            this.wantedList);
        this.renderWanted();
    }

    async loadWanted() {
        try {
            this.wanted = await fetchWantedFilms(this.wantedQuery, this.wantedTab);
            this.renderWanted();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    }

    renderWanted() {
        mount(this.wantedTabs, WANTED_TABS.map((tab) => h("button", {
            class: `segmented__option${this.wantedTab === tab ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(this.wantedTab === tab),
            onClick: () => { this.wantedTab = tab; this.loadWanted(); },
        }, TEXTS[`requestsStatus_${tab}`])));
        mount(this.wantedList, this.wanted.length === 0
            ? h("p", { class: "empty-filter" }, TEXTS.requestsWantedEmpty)
            : h("ul", { class: "req-list req-list--wanted" }, this.wanted.map((film) => this.wantedRow(film))));
    }

    wantedRow(film) {
        let vote = null;
        if (film.status === "pending") {
            if (film.requested_by_me) {
                vote = h("span", { class: "pill" }, TEXTS.requestsYours);
            } else {
                vote = h("button", {
                    class: `btn btn--small req-vote${film.i_want ? " req-vote--on" : ""}`, type: "button",
                    "aria-pressed": String(film.i_want),
                    title: film.i_want ? TEXTS.requestsUnvote : TEXTS.requestsVote,
                    onClick: async (event) => {
                        event.currentTarget.disabled = true;
                        try {
                            await voteForFilm(film.tmdb_id, !film.i_want);
                            await this.loadWanted();
                        } catch (error) {
                            toast(format("errorGeneric", error.message), "error");
                            event.currentTarget.disabled = false;
                        }
                    },
                }, film.i_want ? "✓ +1" : "+1");
            }
        }
        return h("li", { class: "req-wanted" },
            poster(film.poster_path, film.title, "req-film__poster", false, "tiny"),
            h("span", { class: "req-wanted__info" },
                h("strong", {}, film.title),
                h("span", { class: "muted" }, [yearOf(film.release_date), format("requestsWants", film.wants)].filter(Boolean).join(" · "))),
            film.status === "pending" ? null : statusPill(film.status),
            vote);
    }
}

/** Pilulka stavu: Pending / Added / Rejected / Partly added. */
function statusPill(status) {
    return h("span", { class: `pill req-status req-status--${status}` }, TEXTS[`requestsStatus_${status}`]);
}


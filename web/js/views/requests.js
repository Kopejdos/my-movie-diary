// Obrazovka: požadavky na filmy (#/requests, V3.5.1) – jen pro přihlášené.
//   • Nový požadavek: hledání v TMDB, výběr až 20 filmů, nepovinná poznámka.
//   • My requests: vlastní požadavky se stavem (Pending / Added / Rejected / Partly added).
//   • Wanted movies: všechny požadované filmy (bez jmen žadatelů), hledání a +1.

import {
    searchTmdbForRequest, createFilmRequest, fetchWantedFilms, fetchMyRequests, voteForFilm,
    cancelFilmRequest, openRequestCount, MAX_REQUEST_FILMS, MAX_OPEN_REQUESTS, MAX_NOTE,
} from "../requests.js";
import { isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, yearOf, toast, loadingView, errorView, formatDate } from "../dom.js";

const SEARCH_DELAY = 350;          // ms po posledním znaku, než se zeptáme TMDB
const WANTED_TABS = ["pending", "added", "rejected"];

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
        this.selected = new Map();          // tmdb_id → výsledek hledání
        this.results = [];
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

        mount(this.composer,
            h("form", {
                class: "req-form", novalidate: true,
                onSubmit: (event) => { event.preventDefault(); this.send(); },
            },
                h("h2", { class: "req-form__title" }, TEXTS.requestsNew),
                this.limitNote,
                h("div", { class: "search-box req-search" },
                    h("span", { class: "search-icon", "aria-hidden": "true" }), this.searchInput),
                this.resultsBox,
                this.selectedBox,
                this.note,
                h("div", { class: "req-form__actions" }, this.submit),
            ));
        this.renderSelected();
        this.renderLimit();
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

    async send() {
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
            request.note ? h("p", { class: "req-card__note" }, `“${request.note}”`) : null,
            h("ul", { class: "req-card__films" }, request.items.map((item) => h("li", { class: "req-film" },
                poster(item.poster_path, item.title, "req-film__poster", false, "tiny"),
                h("span", { class: "req-film__title" }, item.title, item.release_date ? h("span", { class: "muted" }, ` (${yearOf(item.release_date)})`) : null),
                statusPill(item.status),
                item.universe ? universePill(item.universe) : null))),
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

/** Barevná pilulka kolekce, do které správce film zařadil. */
function universePill(universe) {
    const link = h("a", { class: "pill pill--universe", href: `#/collection/${universe.slug}` }, universe.name);
    if (universe.color) {
        link.style.setProperty("--c", universe.color);
        link.style.setProperty("--c-ink", inkFor(universe.color));
    }
    return link;
}

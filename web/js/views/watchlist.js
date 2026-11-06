// Obrazovka: watchlist – filmy, které chce uživatel vidět (#/watchlist).

import { fetchWatchlist, addWatch, removeFromWatchlist } from "../data.js";
import { isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, pill, yearOf, formatDate, toast, loadingView, errorView } from "../dom.js";
import { soonPill } from "./coming-soon.js";

export async function watchlistView(container, context) {
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    document.title = `${TEXTS.watchlistTitle} · ${TEXTS.appName}`;
    mount(container, loadingView());

    let items;
    try {
        items = await fetchWatchlist();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => watchlistView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const list = h("ol", { class: "film-list" });
    const count = h("span", { class: "muted" });

    /** Překreslí seznam (po odebrání / zhlédnutí bez nového načítání). */
    function renderList() {
        count.textContent = movies(items.length);
        mount(list, items.length > 0
            ? items.map(row)
            : h("li", { class: "empty-filter" },
                h("p", { style: "margin: 0 0 12px" }, TEXTS.watchlistEmpty),
                h("a", { class: "btn btn--primary", href: "#/" }, TEXTS.watchlistBrowse)));
    }

    /** Odebere film ze seznamu na stránce (v databázi už je pryč). */
    function drop(tmdbId) {
        items = items.filter((item) => item.tmdb_id !== tmdbId);
        renderList();
    }

    function row(item) {
        const { film } = item;
        const busy = (on) => buttons.forEach((b) => { b.disabled = on; });

        // Chystaný film (Coming soon, V3.3) ještě nejde označit jako viděný
        const watched = item.upcoming
            ? null
            : h("button", { class: "btn btn--small btn--primary", type: "button" }, `+ ${TEXTS.markWatched}`);
        const remove = h("button", { class: "btn btn--small", type: "button" }, TEXTS.watchlistRemove);
        const buttons = [watched, remove].filter(Boolean);

        // Zhlédnutí: databáze film z watchlistu odebere sama (trigger)
        watched?.addEventListener("click", async () => {
            busy(true);
            try {
                await addWatch(film.tmdb_id);
                toast(TEXTS.watchlistWatched);
                drop(film.tmdb_id);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                busy(false);
            }
        });
        remove.addEventListener("click", async () => {
            busy(true);
            try {
                await removeFromWatchlist(film.tmdb_id);
                toast(TEXTS.watchlistRemoved);
                drop(film.tmdb_id);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                busy(false);
            }
        });

        return h("li", { class: `film film--watchlist${item.upcoming ? " film--upcoming" : ""}` },
            poster(film.poster_path, film.title, "film__poster", false, "small"),
            h("div", { class: "film__info" },
                h("h3", { class: "film__title" }, film.title),
                h("div", { class: "film__meta" },
                    item.upcoming ? soonPill(film) : pill(yearOf(film.release_date)),
                    film.runtime ? pill(format("minutes", film.runtime)) : null,
                    item.universes.map(universeLink),
                ),
                h("p", { class: "film__status" }, format("watchlistAddedOn", formatDate(item.added_at?.slice(0, 10)))),
            ),
            h("div", { class: "watchlist-actions" }, watched, remove),
        );
    }

    mount(container,
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, "★"),
            h("h1", {}, TEXTS.watchlistTitle),
            h("p", { class: "muted" }, TEXTS.watchlistIntro),
        ),
        h("div", { class: "section-title" }, h("span"), count),
        list,
    );
    renderList();
}

/** Barevná pilulka s odkazem na univerzum. */
function universeLink(universe) {
    const link = h("a", { class: "pill pill--universe", href: `#/collection/${universe.slug}` }, universe.name);
    if (universe.color) {
        link.style.setProperty("--c", universe.color);
        link.style.setProperty("--c-ink", inkFor(universe.color));
    }
    return link;
}

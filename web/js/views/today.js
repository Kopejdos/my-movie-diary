// „Co dneska?“ (V3.3) – panel se třemi tipy nahoře na přehledu přihlášeného uživatele:
// z watchlistu, další film v rozkoukané kolekci a něco nového podle oblíbených žánrů.
// Výběr filmů řeší today.js, tady je jen vykreslení a tlačítka.

import { addWatch, addToWatchlist, removeFromWatchlist, todayLocal } from "../data.js";
import { buildCatalog, pickToday } from "../today.js";
import { inkFor, fillFor } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, poster, pill, yearOf, toast } from "../dom.js";
import { collectionPill } from "./film-controls.js";

/**
 * Panel „What to watch today?“.
 * data = { universes, items, categories, counts, watchlist, userId }
 * onWatched = po označení filmu jako viděného (přehled se načte znovu – mění se postup).
 */
export function todayPanel(data, onWatched) {
    const catalog = buildCatalog(data.universes, data.items, todayLocal());
    const seed = `${todayLocal()}|${data.userId ?? ""}`;    // stejný den = stejné tipy
    const shown = new Set();                                 // filmy, které už Shuffle ukázal
    let shuffle = 0;

    const grid = h("div", { class: "today__grid" });
    const shuffleButton = h("button", {
        class: "btn btn--small today__shuffle", type: "button", title: TEXTS.todayShuffleTitle,
        onClick: () => {
            shuffle += 1;
            render();
        },
    }, h("span", { class: "today__shuffle-icon", "aria-hidden": "true" }, "⟳"), TEXTS.todayShuffle);

    function render() {
        const picks = pickToday({
            catalog, counts: data.counts, watchlist: data.watchlist, categories: data.categories,
            seed, shuffle, shown,
        });
        for (const pick of Object.values(picks)) if (pick) shown.add(pick.film.tmdb_id);

        mount(grid,
            card("watchlist", picks.watchlist, TEXTS.todayWatchlist,
                picks.watchlist?.universe ? collectionPill(picks.watchlist.universe, "today-card__collection") : null,
                TEXTS.todayEmptyWatchlist),
            card("next", picks.next, TEXTS.todayNext,
                picks.next ? h("p", { class: "today-card__reason" }, format("todayNextIn", picks.next.universe.name)) : null,
                TEXTS.todayEmptyNext),
            card("explore", picks.explore, TEXTS.todayExplore,
                picks.explore
                    ? h("p", { class: "today-card__reason" },
                        picks.explore.reason
                            ? format("todayExploreBecause", picks.explore.reason.name)
                            : format("todayExploreFresh", picks.explore.universe.name))
                    : null,
                TEXTS.todayEmptyExplore),
        );
    }

    /** Jedna karta; bez tipu ukáže krátkou nápovědu. */
    function card(type, pick, label, context, emptyText) {
        if (!pick) {
            return h("article", { class: `today-card today-card--empty today-card--${type}` },
                h("div", { class: "today-card__body" },
                    h("span", { class: "today-card__label" }, label),
                    h("p", { class: "today-card__empty" }, emptyText),
                ),
            );
        }

        const { film, universe } = pick;
        const href = universe ? `#/collection/${universe.slug}` : "#/watchlist";
        const node = h("article", { class: `today-card today-card--${type}` },
            h("a", { class: "today-card__poster-link", href, tabindex: "-1", "aria-hidden": "true" },
                poster(film.poster_path, film.title, "today-card__poster", true, "small")),
            h("div", { class: "today-card__body" },
                h("span", { class: "today-card__label" }, label),
                h("h2", { class: "today-card__title" }, h("a", { href }, film.title)),
                context,
                h("div", { class: "pills" },
                    pill(yearOf(film.release_date)),
                    film.runtime ? pill(format("minutes", film.runtime)) : null,
                ),
                h("div", { class: "today-card__actions" }, actions(type, film, universe)),
            ),
        );
        if (universe?.color) {
            // tlačítko v barvě kolekce – barvu, na které by text nebyl čitelný, ztmaví (V4.0)
            const fill = fillFor(universe.color);
            node.style.setProperty("--c", universe.color);
            node.style.setProperty("--c-fill", fill);
            node.style.setProperty("--c-ink", inkFor(fill));
        }
        return node;
    }

    /** Tlačítka karty: viděno (watchlist, next) / do watchlistu + otevřít kolekci (explore). */
    function actions(type, film, universe) {
        if (type === "explore") {
            return [
                watchlistToggle(film),
                universe ? h("a", { class: "btn btn--small", href: `#/collection/${universe.slug}` }, TEXTS.todayOpen) : null,
            ];
        }
        const button = h("button", {
            class: "btn btn--small btn--today", type: "button",
            onClick: async () => {
                button.disabled = true;
                try {
                    await addWatch(film.tmdb_id);
                    toast(format("todayMarked", film.title));
                    onWatched();
                } catch (error) {
                    toast(format("errorGeneric", error.message), "error");
                    button.disabled = false;
                }
            },
        }, `+ ${TEXTS.markWatched}`);
        return button;
    }

    /** ☆ / ★ watchlist u tipu „Explore“. */
    function watchlistToggle(film) {
        const id = film.tmdb_id;
        const button = h("button", { class: "btn btn--small", type: "button" });
        const paint = () => {
            const inList = data.watchlist.has(id);
            button.textContent = inList ? `★ ${TEXTS.todayInWatchlist}` : `☆ ${TEXTS.todayToWatchlist}`;
            button.setAttribute("aria-pressed", String(inList));
        };
        button.addEventListener("click", async () => {
            const inList = data.watchlist.has(id);
            if (inList) data.watchlist.delete(id); else data.watchlist.add(id);
            paint();
            try {
                if (inList) await removeFromWatchlist(id); else await addToWatchlist(id);
                toast(inList ? TEXTS.watchlistRemoved : TEXTS.watchlistAdded);
            } catch (error) {
                if (inList) data.watchlist.add(id); else data.watchlist.delete(id);
                paint();
                toast(format("errorGeneric", error.message), "error");
            }
        });
        paint();
        return button;
    }

    render();
    return h("section", { class: "today", "aria-labelledby": "today-title" },
        h("div", { class: "today__head" },
            h("div", {},
                h("span", { class: "eyebrow" }, TEXTS.todayEyebrow),
                h("h1", { class: "today__title", id: "today-title" }, TEXTS.todayTitle),
            ),
            shuffleButton,
        ),
        grid,
    );
}


/** Zástupný panel, dokud se tipy načítají (stejná výška – nic neposkočí). */
export function todayPlaceholder() {
    return h("section", { class: "today today--loading", "aria-hidden": "true" },
        h("div", { class: "today__head" },
            h("div", {},
                h("span", { class: "eyebrow" }, TEXTS.todayEyebrow),
                h("h1", { class: "today__title" }, TEXTS.todayTitle),
            ),
        ),
        h("div", { class: "today__grid" },
            [1, 2, 3].map(() => h("div", { class: "today-card today-card--skeleton" }))),
    );
}

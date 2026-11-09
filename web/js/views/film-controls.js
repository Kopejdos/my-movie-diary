// Sdílené ovládací prvky u filmů (V3.6.2) – dřív byly zkopírované v několika pohledech.
//   watchlistStar  – hvězdička ☆ / ★ pro watchlist (kolekce, hledání, Coming soon, Upcoming)
//   collectionPill – barevná pilulka s odkazem na kolekci (hledání, watchlist, Today, requesty…)

import { addToWatchlist, removeFromWatchlist } from "../data.js";
import { TEXTS, format } from "../texts.js";
import { h, toast } from "../dom.js";
import { inkFor } from "../theme.js";

/**
 * Hvězdička watchlistu. Překresluje jen sama sebe – změnu zapíše optimisticky
 * do sdílené množiny `watchlist` (Set tmdb_id), a když uložení selže, vrátí ji zpět.
 * @param {{ tmdb_id: number, title: string }} film
 * @param {Set<number>} watchlist
 * @param {string} [extraClass] další CSS třída (např. "soon-card__star")
 */
export function watchlistStar(film, watchlist, extraClass = "") {
    const id = film.tmdb_id;
    const base = extraClass ? `star-btn ${extraClass}` : "star-btn";
    const button = h("button", { class: base, type: "button" });

    const paint = () => {
        const inList = watchlist.has(id);
        const label = inList ? TEXTS.watchlistRemove : TEXTS.watchlistAdd;
        button.className = inList ? `${base} star-btn--active` : base;
        button.textContent = inList ? "★" : "☆";
        button.title = label;
        button.setAttribute("aria-label", `${label}: ${film.title}`);
        button.setAttribute("aria-pressed", String(inList));
    };

    button.addEventListener("click", async () => {
        const inList = watchlist.has(id);
        if (inList) watchlist.delete(id); else watchlist.add(id);
        paint();
        try {
            if (inList) await removeFromWatchlist(id); else await addToWatchlist(id);
            toast(inList ? TEXTS.watchlistRemoved : TEXTS.watchlistAdded);
        } catch (error) {
            if (inList) watchlist.add(id); else watchlist.delete(id);
            paint();
            toast(format("errorGeneric", error.message), "error");
        }
    });

    paint();
    return button;
}

/**
 * Barevná pilulka s odkazem na kolekci (barva kolekce + čitelný text).
 * @param {{ slug: string, name: string, color?: string }} universe
 * @param {string} [extraClass]
 */
export function collectionPill(universe, extraClass = "") {
    const link = h("a", {
        class: extraClass ? `pill pill--universe ${extraClass}` : "pill pill--universe",
        href: `#/collection/${universe.slug}`,
    }, universe.name);
    if (universe.color) {
        link.style.setProperty("--c", universe.color);
        link.style.setProperty("--c-ink", inkFor(universe.color));
    }
    return link;
}

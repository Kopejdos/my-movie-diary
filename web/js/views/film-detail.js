// Detail filmu (V4.4.6) – okno po kliknutí na plakát nebo název filmu: větší plakát, popis
// v jazyce aplikace, rok a délka, kolekce, ve kterých film je, trailer na YouTube a odkaz na TMDB.
//
// filmOpener(film, obsah) obalí plakát / název tlačítkem, které okno otevře. Okno je nativní
// <dialog> (Esc a klik mimo ho zavřou, fokus zůstane uvnitř). Údaje, které řádek filmu nemá
// (popis, trailer), se načtou až po otevření; trailer, který ještě nikdo nehledal, dohledá
// Edge Function tmdb (akce film-trailer) a uloží – jinak odkaz na hledání na YouTube.

import { supabase } from "../supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TMDB_IMAGE_ROOT, BACKDROP_SIZES } from "../config.js";
import { fetchUniverseRows, fetchCatalogItems } from "../data.js";
import { LANG, TEXTS, format } from "../texts.js";
import { h, mount, poster, pill, yearOf } from "../dom.js";
import {
    youtubeUrl, youtubeSearchUrl, tmdbUrl, pickOverview, needsTrailerLookup, collectionsOf,
} from "../film-detail-data.js";

/**
 * Obalí obsah (plakát, název) tlačítkem, které otevře detail filmu.
 * film = { tmdb_id, title, original_title?, release_date?, runtime?, poster_path?, backdrop_path? }
 */
export function filmOpener(film, content, className = "film-open") {
    if (!film?.tmdb_id) return content;
    return h("button", {
        class: className, type: "button",
        "aria-label": format("filmDetailOpen", film.title),
        onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            openFilmDetail(film);
        },
    }, content);
}

let dialog = null;

/** Otevře okno s detailem filmu (údaje z řádku hned, popis a trailer po načtení). */
export function openFilmDetail(film) {
    dialog?.remove();
    const body = h("div", { class: "film-detail__body" });
    const close = h("button", { class: "film-detail__close", type: "button", "aria-label": TEXTS.close }, "×");
    dialog = h("dialog", { class: "film-detail", "aria-label": film.title }, close, body);
    close.addEventListener("click", () => dialog.close());
    // Klik na ztmavené pozadí (mimo obsah) okno zavře, stejně jako odkaz na kolekci v okně
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog || event.target.closest?.('a[href^="#"]')) dialog.close();
    });
    dialog.addEventListener("close", () => {
        window.removeEventListener("hashchange", closeOnNavigate);
        dialog?.remove();
        dialog = null;
    });
    const closeOnNavigate = () => dialog?.close();
    window.addEventListener("hashchange", closeOnNavigate);

    document.body.append(dialog);
    render(body, film, { loading: true });
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    close.focus();

    loadDetails(film).then((details) => {
        if (!dialog || !body.isConnected) return;
        render(body, { ...film, ...details.film, title: film.title }, details);
        if (needsTrailerLookup(details.film)) {
            lookupTrailer(film.tmdb_id).then((key) => {
                if (key && body.isConnected) render(body, { ...film, ...details.film, title: film.title, trailer_key: key }, details);
            });
        }
    });
}

/** Popis (v jazyce aplikace), trailer a kolekce filmu. Chyba = jen to, co už je. */
async function loadDetails(film) {
    const [row, translation, collections] = await Promise.all([
        supabase.from("films").select("*").eq("tmdb_id", film.tmdb_id).maybeSingle()
            .then(({ data }) => data ?? {}, () => ({})),
        LANG === "en"
            ? Promise.resolve(null)
            : supabase.from("film_translations").select("overview").eq("tmdb_id", film.tmdb_id).eq("lang", LANG).maybeSingle()
                .then(({ data }) => data, () => null),
        Promise.all([fetchUniverseRows(), fetchCatalogItems()])
            .then(([universes, items]) => collectionsOf(film.tmdb_id, { universes, items }), () => []),
    ]);
    const { title: _englishTitle, ...rest } = row;         // název nechá přeložený z řádku
    return { film: rest, overview: pickOverview(row, translation), collections, loading: false };
}

/** Dohledá trailer přes Edge Function tmdb (veřejná akce). Chyba / žádný → null. */
async function lookupTrailer(tmdbId) {
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/tmdb?action=film-trailer&id=${tmdbId}`, {
            headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        });
        if (!response.ok) return null;
        const body = await response.json();
        return body.key ?? null;
    } catch {
        return null;
    }
}

function render(body, film, { loading = false, overview = null, collections = [] } = {}) {
    const year = yearOf(film.release_date);
    const backdrop = film.backdrop_path ? `${TMDB_IMAGE_ROOT}${BACKDROP_SIZES.phone}${film.backdrop_path}` : null;
    const trailer = youtubeUrl(film.trailer_key);
    const showOriginal = film.original_title && film.original_title !== film.title;

    mount(body,
        backdrop ? h("div", { class: "film-detail__backdrop", style: `background-image: url("${backdrop}")`, "aria-hidden": "true" }) : null,
        h("div", { class: "film-detail__main" },
            poster(film.poster_path, film.title, "film-detail__poster", true, "large"),
            h("div", { class: "film-detail__info" },
                h("h2", { class: "film-detail__title" }, film.title),
                showOriginal ? h("p", { class: "film-detail__original muted" }, film.original_title) : null,
                h("div", { class: "pills" },
                    year ? pill(year) : null,
                    film.runtime ? pill(format("minutes", film.runtime)) : null),
                h("div", { class: "film-detail__actions" },
                    h("a", {
                        class: "btn btn--primary btn--small", href: trailer ?? youtubeSearchUrl(film), target: "_blank", rel: "noopener",
                    }, `▶ ${trailer ? TEXTS.filmDetailTrailer : TEXTS.filmDetailFindTrailer}`),
                    h("a", { class: "btn btn--small", href: tmdbUrl(film.tmdb_id), target: "_blank", rel: "noopener" }, "TMDB ↗")),
            ),
        ),
        h("div", { class: "film-detail__text" },
            loading
                ? h("p", { class: "muted" }, TEXTS.loading)
                : h("p", { class: overview ? "film-detail__overview" : "muted" }, overview ?? TEXTS.filmDetailNoOverview),
            collections.length > 0
                ? h("div", { class: "film-detail__collections" },
                    h("h3", {}, TEXTS.filmDetailCollections),
                    h("div", { class: "pills" }, collections.slice(0, 16).map((u) => h("a", {
                        class: "pill pill--link", href: `#/collection/${u.slug}`,
                        style: u.color ? `--c: ${u.color}` : null,
                    }, u.name)),
                    collections.length > 16 ? pill(format("filmDetailMore", collections.length - 16)) : null))
                : null,
            h("p", { class: "film-detail__source muted" }, TEXTS.filmDetailSource)),
    );
}

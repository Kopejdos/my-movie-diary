// Coming soon (V3.3) – oznámené filmy, které ještě nevyšly.
// Oddíl dole v detailu kolekce, pilulka s datem premiéry (hledání, watchlist) a plakát
// bez obrázku (i pro stránku #/coming-soon, V3.3.1).
// Chystané filmy se nepočítají do postupu a nejdou označit jako viděné – jde je jen
// přidat do watchlistu.

import { todayLocal } from "../data.js";
import { TEXTS, format } from "../texts.js";
import { h, poster, formatDate, yearOf } from "../dom.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_DAYS = 60;      // do kolika dnů se k datu přidá „in 12 days“

/** Kolik dní zbývá do premiéry (null = datum ještě není). */
export function daysUntil(film) {
    if (!film?.release_date) return null;
    const today = new Date(`${todayLocal()}T00:00:00`);
    const premiere = new Date(`${film.release_date}T00:00:00`);
    return Math.round((premiere - today) / DAY_MS);
}

/** Datum premiéry pro člověka: „18 Dec 2026“, „Date TBA“. */
export function premiereText(film) {
    return film?.release_date ? formatDate(film.release_date) : TEXTS.dateTba;
}

/** Krátký dovětek k blízké premiéře: „in 12 days“, „tomorrow“, „today“ (jinak null). */
export function countdownText(film) {
    const days = daysUntil(film);
    if (days === null || days < 0 || days > SOON_DAYS) return null;
    if (days === 0) return TEXTS.comingSoonToday;
    if (days === 1) return TEXTS.comingSoonTomorrow;
    return format("comingSoonDays", days);
}

/** Pilulka „Coming 18 Dec 2026“ pro řádky filmů (hledání, watchlist). */
export function soonPill(film) {
    const countdown = countdownText(film);
    return h("span", { class: "pill pill--soon" },
        film?.release_date ? format("comingSoonOn", premiereText(film)) : `${TEXTS.comingSoonBadge} · ${TEXTS.dateTba}`,
        countdown ? h("span", { class: "pill__sub" }, `· ${countdown}`) : null);
}

/**
 * Oddíl „Coming soon“ dole v kolekci.
 * items = universe.upcoming (seřazené podle premiéry);
 * watchlistButton(item) = hvězdička watchlistu (jen přihlášený), nebo null.
 */
export function comingSoonSection(items, watchlistButton = null) {
    if (!items || items.length === 0) return null;
    return h("section", { class: "coming-soon", "aria-labelledby": "coming-soon-title" },
        h("div", { class: "coming-soon__head" },
            h("h2", { id: "coming-soon-title" }, TEXTS.comingSoonTitle),
            h("span", { class: "coming-soon__count" }, String(items.length)),
        ),
        h("p", { class: "hint coming-soon__hint" }, TEXTS.comingSoonHint),
        h("ol", { class: "coming-soon__grid" }, items.map((item) => soonCard(item, watchlistButton))),
    );
}

/**
 * Plakát chystaného filmu. Když ještě není (u filmů za pár let běžné),
 * místo prázdného bloku velký rok premiéry na pruhovaném pozadí.
 */
export function soonPoster(film, className) {
    if (film.poster_path) return poster(film.poster_path, film.title, className, false, "small");
    return h("div", { class: `${className} soon-card__poster--none`, "aria-hidden": "true" },
        h("span", { class: "soon-card__year" }, yearOf(film.release_date) || "TBA"));
}

/** Kartička chystaného filmu: plakát, název, datum, popisek / série. */
function soonCard(item, watchlistButton) {
    const { film } = item;
    const countdown = countdownText(film);
    return h("li", { class: "soon-card" },
        h("div", { class: "soon-card__media" },
            soonPoster(film, "soon-card__poster"),
            watchlistButton ? watchlistButton(item) : null,
        ),
        h("div", { class: "soon-card__body" },
            item.label ? h("span", { class: "film__label" }, item.label) : null,
            h("h3", { class: "soon-card__title" }, film.title),
            h("p", { class: "soon-card__date" },
                h("time", { datetime: film.release_date ?? "" }, premiereText(film)),
                countdown ? h("span", { class: "soon-card__countdown" }, countdown) : null),
            item.franchise ? h("p", { class: "soon-card__series" }, item.franchise) : null,
        ),
    );
}

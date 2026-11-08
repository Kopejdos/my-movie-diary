// Karta vlastního seznamu (V3.5.3) – obálka ze 4 plakátů, název, počet filmů, viditelnost,
// zobrazení; u komunitních seznamů i autor (V3.5.4). Malý modul bez závislostí na profilu –
// používá ho i přehled (sekce Community), hledání a veřejný profil.

import { visibilityLabel } from "../lists.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, posterUrl } from "../dom.js";

/** Karta seznamu: obálka ze 4 plakátů, název, počet filmů, viditelnost (u vlastních), zobrazení. */
export function listCard(list, { showVisibility = false, showAuthor = false } = {}) {
    const posters = (list.posters ?? []).slice(0, 4);
    return h("a", { class: "list-card", href: `#/list/${list.id}` },
        h("div", { class: `list-card__cover list-card__cover--${Math.max(1, posters.length)}` },
            posters.length === 0
                ? h("span", { class: "list-card__empty", "aria-hidden": "true" }, "☰")
                : posters.map((path) => h("img", { src: posterUrl(path, "small"), alt: "", loading: "lazy", decoding: "async" }))),
        h("div", { class: "list-card__body" },
            h("h3", { class: "list-card__title" }, list.title),
            showAuthor && list.username ? h("p", { class: "list-card__author" }, format("listBy", list.username)) : null,
            list.hidden ? h("p", { class: "list-card__hidden" }, `⚑ ${TEXTS.listHiddenBadge}`) : null,
            h("p", { class: "list-card__meta" },
                [movies(list.item_count),
                    showVisibility ? visibilityLabel(list.visibility) : null,
                    list.view_count > 0 ? `👁 ${list.view_count}` : null].filter(Boolean).join(" · "))));
}

/** Mřížka karet seznamů. */
export function listGrid(lists, options) {
    return h("div", { class: "list-grid" }, lists.map((list) => listCard(list, options)));
}


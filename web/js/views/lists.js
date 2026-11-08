// Obrazovka „My lists“ (#/lists, V3.5.3) – záložka profilu vedle Achievements, Stats, Friends.
// Nahoře založení nového seznamu, pod tím karty mých seznamů (obálka ze 4 plakátů, počet filmů,
// viditelnost, zobrazení). Karty seznamů používá i veřejný profil.

import { isSignedIn, getProfile } from "../auth.js";
import { fetchUserLists, createList, VISIBILITIES, MAX_TITLE, MAX_LISTS, listErrorText, visibilityLabel } from "../lists.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, posterUrl, toast, loadingView, errorView } from "../dom.js";
import { profileTabs } from "./stats.js";

/** Karta seznamu: obálka ze 4 plakátů, název, počet filmů, viditelnost (u vlastních), zobrazení. */
export function listCard(list, { showVisibility = false } = {}) {
    const posters = (list.posters ?? []).slice(0, 4);
    return h("a", { class: "list-card", href: `#/list/${list.id}` },
        h("div", { class: `list-card__cover list-card__cover--${Math.max(1, posters.length)}` },
            posters.length === 0
                ? h("span", { class: "list-card__empty", "aria-hidden": "true" }, "☰")
                : posters.map((path) => h("img", { src: posterUrl(path, "small"), alt: "", loading: "lazy", decoding: "async" }))),
        h("div", { class: "list-card__body" },
            h("h3", { class: "list-card__title" }, list.title),
            h("p", { class: "list-card__meta" },
                [movies(list.item_count),
                    showVisibility ? visibilityLabel(list.visibility) : null,
                    list.view_count > 0 ? `👁 ${list.view_count}` : null].filter(Boolean).join(" · "))));
}

/** Mřížka karet seznamů. */
export function listGrid(lists, options) {
    return h("div", { class: "list-grid" }, lists.map((list) => listCard(list, options)));
}

export async function listsView(container, context) {
    setAccent(null);
    document.title = `${TEXTS.listsTitle} · ${TEXTS.appName}`;
    if (!isSignedIn()) {
        mount(container, h("div", { class: "state" },
            h("p", {}, TEXTS.listsSignIn),
            h("a", { class: "btn btn--primary", href: "#/login" }, TEXTS.navSignIn)));
        return;
    }
    mount(container, profileTabs("lists"), loadingView());

    let lists;
    try {
        lists = await fetchUserLists(getProfile()?.username ?? "");
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, profileTabs("lists"),
            errorView(format("errorGeneric", error.message), () => listsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    // Nový seznam – po založení rovnou otevřít (a nabídnout úpravu)
    const title = h("input", {
        class: "admin-input admin-input--grow", type: "text", maxlength: MAX_TITLE, required: true,
        name: "list-title", placeholder: TEXTS.listNewPlaceholder, "aria-label": TEXTS.listNewPlaceholder,
    });
    const visibility = h("select", { class: "admin-input admin-select", "aria-label": TEXTS.listVisibility },
        VISIBILITIES.map((v) => h("option", { value: v }, visibilityLabel(v))));
    const submit = h("button", { class: "btn btn--primary", type: "submit", disabled: lists.length >= MAX_LISTS }, TEXTS.listCreate);
    const form = h("form", {
        class: "admin-form list-new",
        onSubmit: async (event) => {
            event.preventDefault();
            if (!title.value.trim()) {
                title.focus();
                return;
            }
            submit.disabled = true;
            try {
                const id = await createList({ title: title.value, visibility: visibility.value });
                window.location.hash = `/list/${id}`;
            } catch (error) {
                toast(listErrorText(error), "error");
                submit.disabled = false;
            }
        },
    },
        h("h2", { class: "admin-form__title" }, TEXTS.listNew),
        h("p", { class: "hint", style: "margin: 0" }, TEXTS.listNewHint),
        h("div", { class: "admin-search" }, title, visibility, submit));

    mount(container,
        profileTabs("lists"),
        form,
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.listsTitle),
            h("span", { class: "muted" }, format("listsCount", lists.length, MAX_LISTS))),
        lists.length === 0
            ? h("div", { class: "empty-filter" }, TEXTS.listsEmpty)
            : listGrid(lists, { showVisibility: true }));
}

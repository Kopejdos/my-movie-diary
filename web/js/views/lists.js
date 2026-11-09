// Obrazovka „My lists“ (#/lists, V3.5.3) – záložka profilu vedle Achievements, Stats, Friends.
// Nahoře založení nového seznamu, pod tím karty mých seznamů (obálka ze 4 plakátů, počet filmů,
// viditelnost, zobrazení). Karty seznamů používá i veřejný profil.

import { isSignedIn, getProfile } from "../auth.js";
import { fetchUserLists, createList, VISIBILITIES, MAX_TITLE, MAX_LISTS, listErrorText, visibilityLabel } from "../lists.js";
import { setAccent } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, toast, loadingView, errorView } from "../dom.js";
import { listGrid } from "./list-card.js";

export { listCard, listGrid } from "./list-card.js";
import { profileTabs } from "./stats.js";

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

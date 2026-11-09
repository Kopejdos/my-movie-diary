// Okno „Add to list“ (V3.5.3) – otevře se tlačítkem ☰ u filmu (kolekce, hledání, seznam).
// Ukáže moje seznamy se zaškrtávátkem (je v něm film?) – zaškrtnutí film hned přidá / odebere.
// Dole jde rovnou založit nový seznam (soukromý) s tímhle filmem.

import { fetchListsForFilm, addToList, removeFromList, createList, listErrorText, visibilityIcon, MAX_TITLE, MAX_LISTS } from "../lists.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, toast } from "../dom.js";
import { openModal } from "./modal.js";

export function openListPicker(film) {
    const body = h("div", { class: "list-picker__body" }, h("p", { class: "muted" }, TEXTS.loading));
    const titleInput = h("input", {
        class: "admin-input admin-input--grow", type: "text", maxlength: MAX_TITLE,
        placeholder: TEXTS.listNewPlaceholder, "aria-label": TEXTS.listNewPlaceholder,
    });
    const createButton = h("button", { class: "btn btn--small btn--primary", type: "submit" }, TEXTS.listCreate);
    // Zavírá se Esc, kliknutím vedle, křížkem nebo tlačítkem Done (views/modal.js)
    const { close } = openModal({
        eyebrow: TEXTS.listAddTo,
        title: film.title,
        className: "list-picker",
        content: [
            body,
            h("form", {
                class: "list-picker__new",
                onSubmit: async (event) => {
                    event.preventDefault();
                    const title = titleInput.value.trim();
                    if (!title) {
                        titleInput.focus();
                        return;
                    }
                    createButton.disabled = true;
                    try {
                        const id = await createList({ title });
                        await addToList(id, film.tmdb_id);
                        toast(format("listCreatedWith", title, film.title));
                        titleInput.value = "";
                        await load();
                    } catch (error) {
                        toast(listErrorText(error), "error");
                    }
                    createButton.disabled = false;
                },
            }, titleInput, createButton),
            h("div", { class: "modal__foot" },
                h("a", { href: "#/lists" }, TEXTS.listManage),
                h("button", { class: "btn btn--small", type: "button", onClick: () => close() }, TEXTS.done)),
        ],
    });

    async function load() {
        let lists;
        try {
            lists = await fetchListsForFilm(film.tmdb_id);
        } catch (error) {
            mount(body, h("p", { class: "muted" }, format("errorGeneric", error.message)));
            return;
        }
        createButton.disabled = lists.length >= MAX_LISTS;
        if (lists.length === 0) {
            mount(body, h("p", { class: "muted list-picker__empty" }, TEXTS.listPickerEmpty));
            return;
        }
        mount(body, h("ul", { class: "list-picker__lists" }, lists.map((list) => {
            const box = h("input", { type: "checkbox", checked: list.has_film });
            const count = h("span", { class: "muted" }, movies(list.item_count));
            box.addEventListener("change", async () => {
                box.disabled = true;
                try {
                    if (box.checked) {
                        await addToList(list.id, film.tmdb_id);
                        list.item_count++;
                        toast(format("listAdded", film.title, list.title));
                    } else {
                        await removeFromList(list.id, film.tmdb_id);
                        list.item_count--;
                        toast(format("listRemoved", film.title, list.title));
                    }
                    count.textContent = movies(list.item_count);
                } catch (error) {
                    box.checked = !box.checked;
                    toast(listErrorText(error), "error");
                }
                box.disabled = false;
            });
            return h("li", {},
                h("label", { class: "list-picker__item" }, box,
                    h("span", { class: "list-picker__name" }, list.title),
                    h("span", { class: "list-picker__meta", title: TEXTS[`listVisibility_${list.visibility}`] },
                        visibilityIcon(list.visibility), " ", count)));
        })));
    }

    load();
}

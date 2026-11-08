// Okno „Add to list“ (V3.5.3) – otevře se tlačítkem ☰ u filmu (kolekce, hledání, seznam).
// Ukáže moje seznamy se zaškrtávátkem (je v něm film?) – zaškrtnutí film hned přidá / odebere.
// Dole jde rovnou založit nový seznam (soukromý) s tímhle filmem.
// Zavírá se Esc, kliknutím vedle nebo tlačítkem Done; fokus se vrátí na tlačítko, které okno otevřelo.

import { fetchListsForFilm, addToList, removeFromList, createList, listErrorText, MAX_TITLE, MAX_LISTS } from "../lists.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, toast } from "../dom.js";

/** Ikonka viditelnosti seznamu. */
export function visibilityIcon(visibility) {
    return { private: "🔒", friends: "👥", public: "🌍" }[visibility] ?? "";
}

export function openListPicker(film) {
    const opener = document.activeElement;
    const body = h("div", { class: "list-picker__body" }, h("p", { class: "muted" }, TEXTS.loading));
    const titleInput = h("input", {
        class: "admin-input admin-input--grow", type: "text", maxlength: MAX_TITLE,
        placeholder: TEXTS.listNewPlaceholder, "aria-label": TEXTS.listNewPlaceholder,
    });
    const createButton = h("button", { class: "btn btn--small btn--primary", type: "submit" }, TEXTS.listCreate);
    const dialog = h("div", {
        class: "modal list-picker", role: "dialog", "aria-modal": "true", "aria-labelledby": "list-picker-title",
    },
        h("div", { class: "modal__head" },
            h("div", {},
                h("span", { class: "eyebrow" }, TEXTS.listAddTo),
                h("h2", { id: "list-picker-title", class: "modal__title" }, film.title)),
            h("button", { class: "modal__close", type: "button", "aria-label": TEXTS.close, onClick: () => close() }, "×")),
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
            h("a", { href: "#/lists", onClick: () => close() }, TEXTS.listManage),
            h("button", { class: "btn btn--small", type: "button", onClick: () => close() }, TEXTS.done)),
    );
    const backdrop = h("div", { class: "modal-backdrop", onClick: (event) => { if (event.target === backdrop) close(); } }, dialog);

    function onKey(event) {
        if (event.key === "Escape") close();
    }
    function close() {
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("hashchange", close);
        backdrop.remove();
        if (opener instanceof HTMLElement && document.body.contains(opener)) opener.focus();
    }

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

    document.body.append(backdrop);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", close);
    dialog.querySelector(".modal__close").focus();
    load();
}

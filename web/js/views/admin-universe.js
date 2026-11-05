// Obrazovka admin panelu: úprava jednoho univerza (#/admin/collection/<slug>).

import { fetchUniverse, fetchCategories } from "../data.js";
import {
    updateUniverse, addUniverseItem, updateUniverseItem, removeUniverseItem, swapItemOrder,
    setUniverseCover, searchTmdb, addFilmFromTmdb, setUniverseCategories,
} from "../admin.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, pill, yearOf, toast, loadingView, errorView } from "../dom.js";
import { field } from "./login.js";
import { requireAdminView } from "./admin.js";

export async function adminUniverseView(container, context) {
    if (!requireAdminView(container)) return;
    mount(container, loadingView());

    let universe, categories;
    try {
        [universe, categories] = await Promise.all([fetchUniverse(context.params.slug), fetchCategories()]);
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => adminUniverseView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;
    if (!universe) {
        mount(container, h("div", { class: "state" }, h("p", {}, TEXTS.universeNotFound),
            h("a", { class: "btn", href: "#/admin" }, TEXTS.adminBackToPanel)));
        return;
    }

    document.title = `${universe.name} · ${TEXTS.adminTitle}`;
    setAccent(universe.color);
    const reload = () => adminUniverseView(container, context);

    mount(container,
        h("div", { class: "admin-top" },
            h("a", { class: "back-link", href: "#/admin" }, TEXTS.adminBackToPanel),
            h("a", { class: "btn btn--small", href: `#/collection/${universe.slug}` }, TEXTS.adminOpenUniverse),
        ),
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, TEXTS.navAdmin),
            h("h1", {}, universe.name),
        ),
        detailsForm(universe, categories, reload),
        addMoviePanel(universe, reload),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminMoviesInUniverse),
            h("span", { class: "muted" }, movies(universe.items.length)),
        ),
        h("p", { class: "hint" }, TEXTS.adminStoryHint),
        h("ol", { class: "admin-list" },
            universe.items.map((item, index) =>
                itemRow(universe, item, universe.items[index - 1], universe.items[index + 1], reload)),
        ),
    );
}

/** Spustí změnu, ukáže výsledek a stránku znovu načte. */
async function run(action, reload, message) {
    try {
        await action();
        if (message) toast(message);
        reload();
    } catch (error) {
        toast(format("errorGeneric", error.message), "error");
    }
}

/** Název, popis, barva, typ a kategorie kolekce. */
function detailsForm(universe, categories, reload) {
    const name = h("input", { type: "text", value: universe.name, maxlength: 80, required: true });
    const description = h("input", { type: "text", value: universe.description ?? "", maxlength: 200 });
    const color = h("input", { type: "color", value: universe.color ?? "#d4a75a", class: "color-input" });
    const submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminSave);

    const kind = h("select", { class: "admin-input admin-select" },
        [["series", TEXTS.kindSeries], ["studio", TEXTS.kindStudio], ["genre", TEXTS.kindGenre]]
            .map(([value, label]) => h("option", { value, selected: (universe.kind ?? "series") === value }, label)));

    const assigned = new Set((universe.categories ?? []).map((c) => c.id));
    const categoryBoxes = categories.map((c) => ({
        id: c.id,
        input: h("input", { type: "checkbox", checked: assigned.has(c.id) }),
        label: c.name,
        color: c.color,
    }));

    // Náhled barvy hned při výběru
    color.addEventListener("input", () => setAccent(color.value));

    return h("form", {
            class: "admin-form",
            onSubmit: (event) => {
                event.preventDefault();
                if (!name.value.trim()) {
                    toast(TEXTS.adminNameRequired, "error");
                    return;
                }
                submit.disabled = true;
                run(async () => {
                    await updateUniverse(universe.id, {
                        name: name.value.trim(),
                        description: description.value.trim() || null,
                        color: color.value,
                        kind: kind.value,
                    });
                    await setUniverseCategories(universe.id,
                        categoryBoxes.filter((box) => box.input.checked).map((box) => box.id));
                }, reload, TEXTS.adminSaved);
            },
        },
        h("h2", { class: "admin-form__title" }, TEXTS.adminUniverseDetails),
        h("div", { class: "admin-form__grid" },
            field(TEXTS.adminName, name),
            field(TEXTS.adminDescription, description),
            field(TEXTS.adminColor, color),
            field(TEXTS.adminSlug, h("input", { type: "text", value: universe.slug, disabled: true })),
            field(TEXTS.adminKind, kind),
        ),
        h("div", { class: "field" },
            h("span", { class: "field__label" }, TEXTS.adminCategories),
            h("div", { class: "category-checks" },
                categoryBoxes.map((box) => h("label", { class: "mini-check category-check",
                        style: box.color ? `--c: ${box.color}` : null },
                    box.input, h("span", {}, box.label)))),
            h("span", { class: "field__hint" }, TEXTS.adminCategoriesHint),
        ),
        submit,
    );
}

/** Řádek filmu: skupina, pořadí v příběhu, volitelný, obal, posun, odebrání. */
function itemRow(universe, item, previous, next, reload) {
    const { film } = item;
    const isCover = universe.cover_tmdb_id === film.tmdb_id;

    // Úpravy polí se ukládají hned po opuštění pole (change)
    const save = (fields) => run(() => updateUniverseItem(item.id, fields), reload, TEXTS.adminSaved);

    const group = h("input", {
        type: "text", class: "admin-input", value: item.group_label ?? "",
        placeholder: TEXTS.adminGroupPlaceholder, "aria-label": TEXTS.adminGroup, maxlength: 60,
    });
    group.addEventListener("change", () => save({ group_label: group.value.trim() || null }));

    const story = h("input", {
        type: "number", class: "admin-input admin-input--number", min: 1, max: 999,
        value: item.story_order ?? "", placeholder: "—", "aria-label": TEXTS.adminStoryOrder,
    });
    story.addEventListener("change", () =>
        save({ story_order: story.value === "" ? null : Number(story.value) }));

    const optional = h("input", { type: "checkbox", checked: item.is_optional });
    optional.addEventListener("change", () => save({ is_optional: optional.checked }));

    return h("li", { class: `admin-row admin-row--film${item.is_optional ? " film--optional" : ""}` },
        h("span", { class: "admin-row__order" }, String(item.release_order)),
        poster(film.poster_path, film.title, "film__poster"),
        h("div", { class: "admin-row__info" },
            h("strong", {}, film.title),
            h("div", { class: "pills" },
                pill(yearOf(film.release_date)),
                isCover ? pill(TEXTS.adminIsCover, true) : null,
            ),
            h("div", { class: "admin-row__fields" },
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminGroup), group),
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminStoryOrder), story),
                h("label", { class: "mini-check" }, optional, h("span", {}, TEXTS.adminOptional)),
            ),
        ),
        h("div", { class: "admin-row__actions" },
            h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveUp, "aria-label": TEXTS.adminMoveUp,
                disabled: !previous, onClick: () => run(() => swapItemOrder(item, previous), reload),
            }, "↑"),
            h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveDown, "aria-label": TEXTS.adminMoveDown,
                disabled: !next, onClick: () => run(() => swapItemOrder(item, next), reload),
            }, "↓"),
            isCover ? null : h("button", {
                class: "btn btn--small", type: "button",
                onClick: () => run(() => setUniverseCover(universe.id, film.tmdb_id), reload, TEXTS.adminSaved),
            }, TEXTS.adminSetCover),
            h("button", {
                class: "btn btn--small btn--danger", type: "button",
                onClick: () => {
                    if (!window.confirm(format("adminConfirmRemoveMovie", film.title))) return;
                    run(() => removeUniverseItem(item.id), reload, TEXTS.adminDeleted);
                },
            }, TEXTS.adminRemove),
        ),
    );
}

/** Hledání v TMDB a přidání filmu na konec univerza. */
function addMoviePanel(universe, reload) {
    const inUniverse = new Set(universe.items.map((item) => item.film.tmdb_id));
    const lastGroup = universe.items.at(-1)?.group_label ?? "";

    const query = h("input", { type: "search", class: "admin-input admin-input--grow",
        placeholder: TEXTS.adminSearchPlaceholder, "aria-label": TEXTS.adminSearch });
    const group = h("input", { type: "text", class: "admin-input", value: lastGroup,
        placeholder: TEXTS.adminGroupPlaceholder, "aria-label": TEXTS.adminGroup, maxlength: 60 });
    const optional = h("input", { type: "checkbox" });
    const results = h("div", { class: "search-results" });
    const submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminSearch);

    async function handleSearch(event) {
        event.preventDefault();
        if (!query.value.trim()) return;
        submit.disabled = true;
        mount(results, loadingView());
        try {
            const found = await searchTmdb(query.value);
            mount(results, found.length === 0
                ? h("p", { class: "muted" }, TEXTS.adminNoResults)
                : found.map(resultCard));
        } catch (error) {
            mount(results, h("p", { class: "form-error" }, format("errorGeneric", error.message)));
        }
        submit.disabled = false;
    }

    function resultCard(movie) {
        const already = inUniverse.has(movie.tmdb_id);
        const add = h("button", { class: "btn btn--small btn--universe", type: "button", disabled: already },
            already ? TEXTS.adminAlreadyIn : TEXTS.adminAdd);
        add.addEventListener("click", async () => {
            add.disabled = true;
            try {
                const film = await addFilmFromTmdb(movie.tmdb_id);
                await addUniverseItem(universe.id, film.tmdb_id, {
                    group: group.value.trim(), optional: optional.checked,
                });
                if (film.status && film.status !== "Released") {
                    toast(format("adminNotReleased", film.release_date ?? "TBA"));
                }
                toast(format("adminMovieAdded", film.title));
                reload();
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                add.disabled = false;
            }
        });

        return h("div", { class: "search-result" },
            poster(movie.poster_path, movie.title, "film__poster"),
            h("div", { class: "admin-row__info" },
                h("strong", {}, movie.title),
                h("div", { class: "pills" }, pill(movie.year ?? "—"),
                    movie.original_title && movie.original_title !== movie.title ? pill(movie.original_title) : null),
            ),
            add,
        );
    }

    return h("details", { class: "panel-details", open: universe.items.length === 0 },
        h("summary", {}, `+ ${TEXTS.adminAddMovie}`),
        h("form", { class: "admin-form", onSubmit: handleSearch },
            h("div", { class: "admin-search" }, query, submit),
            h("div", { class: "admin-row__fields" },
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminGroup), group),
                h("label", { class: "mini-check" }, optional, h("span", {}, TEXTS.adminOptional)),
            ),
            results,
        ),
    );
}

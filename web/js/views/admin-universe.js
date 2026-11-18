// Obrazovka admin panelu: úprava jednoho univerza (#/admin/collection/<slug>).
//
// V4.3.1 – jeden Save: změny údajů kolekce i filmů (oddíl, série, popisek, pořadí v příběhu,
// volitelný, poznámka, obal, pořadí šipkami, přidání, odebrání) se jen sbírají. Upravený řádek
// se zvýrazní a dole je lišta „3 unsaved changes · Discard · Save“. Save uloží vše najednou
// (nové filmy se nejdřív uloží do katalogu přes Edge Function admin, pak jedna databázová
// funkce admin_save_collection v jedné transakci). Odchod s neuloženými změnami se zeptá.
// Hledání filmu se po přidání nesmaže – u přidaného filmu je „✓ Added“.

import { fetchUniverse, fetchCategories } from "../data.js";
import { clearDataCache } from "../cache.js";
import { searchTmdb, addFilmToCatalog, saveCollection } from "../admin.js";
import { setLeaveGuard } from "../router.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, toast, loadingView, errorView } from "../dom.js";
import { field } from "./login.js";
import { requireAdminView } from "./admin.js";
import { createCollectionEditor, unsavedText } from "./collection-editor.js";
import { tmdbSearchPanel } from "./tmdb-search-panel.js";

const KINDS = [["series", "kindSeries"], ["studio", "kindStudio"], ["director", "kindDirectorOption"], ["genre", "kindGenre"], ["path", "kindPathOption"]];

export async function adminUniverseView(container, context) {
    if (!requireAdminView(container)) return;
    setLeaveGuard(null);
    mount(container, loadingView());
    clearDataCache();               // admin vždy pracuje s čerstvými daty

    let universe, categories;
    try {
        // Bez překladu (V4.2.2) – editor ukládá anglické texty
        [universe, categories] = await Promise.all([
            fetchUniverse(context.params.slug, { original: true }),
            fetchCategories({ original: true }),
        ]);
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
    // Admin vidí i chystané filmy (Coming soon, V3.3) – v pořadí ze seedu jako ostatní
    universe = {
        ...universe,
        items: [...universe.items, ...(universe.upcoming ?? []), ...(universe.later ?? [])]
            .sort((a, b) => a.release_order - b.release_order),
    };

    document.title = `${universe.name} · ${TEXTS.adminTitle}`;
    buildPage(container, universe, categories, () => adminUniverseView(container, context));
}

/** Celá stránka editoru. Discard ji postaví znovu z načtených dat, Save uloží a načte znovu. */
function buildPage(container, universe, categories, reload) {
    setAccent(universe.color);

    let ready = false;                  // editor volá onChange už při prvním vykreslení
    const details = detailsForm(universe, categories, () => update());
    const editor = createCollectionEditor({
        items: universe.items,
        mode: "admin",
        kind: universe.kind ?? "series",
        coverId: universe.cover_tmdb_id,
        onChange: () => update(),
    });
    details.onKindChange = (kind) => editor.setKind(kind);

    // Nové filmy: oddíl a „volitelný“ z panelu hledání, zařazení podle data premiéry
    const newFields = {
        group: h("input", {
            type: "text", class: "admin-input", value: universe.items.at(-1)?.group_label ?? "",
            placeholder: TEXTS.adminGroupPlaceholder, "aria-label": TEXTS.adminGroup, maxlength: 60,
        }),
        optional: h("input", { type: "checkbox" }),
    };
    const search = tmdbSearchPanel({
        search: searchTmdb,
        isAdded: (tmdbId) => editor.has(tmdbId),
        onToggle: (movie, added) => {
            if (added) {
                editor.removeFilm(movie.tmdb_id);
            } else {
                editor.add(
                    { tmdb_id: movie.tmdb_id, title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date ?? null },
                    { group_label: newFields.group.value, is_optional: newFields.optional.checked });
            }
        },
        extra: h("div", { class: "admin-row__fields" },
            h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminGroup), newFields.group),
            h("label", { class: "mini-check" }, newFields.optional, h("span", {}, TEXTS.adminOptional))),
        open: universe.items.length === 0,
    });

    // Lišta s neuloženými změnami
    const count = h("span", { class: "save-bar__count" });
    const discard = h("button", { class: "btn btn--small", type: "button", onClick: () => {
        setLeaveGuard(null);
        buildPage(container, universe, categories, reload);
    } }, TEXTS.adminEditorDiscard);
    const save = h("button", { class: "btn btn--primary btn--small", type: "button", onClick: () => saveAll() }, TEXTS.adminSave);
    const bar = h("div", { class: "save-bar", role: "region", "aria-label": TEXTS.adminEditorUnsavedRegion, hidden: true },
        h("div", { class: "save-bar__inner" }, count, discard, save));
    const filmCount = h("span", { class: "muted" });

    const total = () => editor.changes() + details.changes();
    function update() {
        if (!ready) return;
        const changes = total();
        bar.hidden = changes === 0;
        count.textContent = unsavedText(changes);
        filmCount.textContent = movies(editor.count());
        search.refresh();
    }

    async function saveAll() {
        if (!details.valid()) {
            toast(TEXTS.adminNameRequired, "error");
            return;
        }
        save.disabled = true;
        discard.disabled = true;
        save.textContent = TEXTS.adminEditorSaving;
        try {
            // 1. Nové filmy do katalogu (detail a překlady z TMDB), po třech najednou
            const fresh = editor.items().filter((item) => item.id === null);
            for (let i = 0; i < fresh.length; i += 3) {
                await Promise.all(fresh.slice(i, i + 3).map((item) => addFilmToCatalog(item.tmdb_id)));
            }
            // 2. Všechno ostatní najednou
            const changedDetails = details.changedValues();
            if (editor.coverChanged()) changedDetails.cover_tmdb_id = editor.cover();
            await saveCollection(universe.id, {
                universe: Object.keys(changedDetails).length > 0 ? changedDetails : null,
                categories: details.categoriesChanged() ? details.categoryIds() : null,
                items: editor.items().map((item) => ({
                    id: item.id, tmdb_id: item.tmdb_id, group_label: item.group_label, franchise: item.franchise,
                    label: item.label, story_order: item.story_order, is_optional: item.is_optional, note: item.note,
                })),
                removed: editor.removedIds(),
            });
            toast(TEXTS.adminSaved);
            setLeaveGuard(null);
            reload();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            save.disabled = false;
            discard.disabled = false;
            save.textContent = TEXTS.adminSave;
        }
    }

    setLeaveGuard(() => (total() > 0 ? TEXTS.adminEditorLeave : null));

    mount(container,
        h("div", { class: "admin-top" },
            h("a", { class: "back-link", href: "#/admin" }, TEXTS.adminBackToPanel),
            h("a", { class: "btn btn--small", href: `#/collection/${universe.slug}` }, TEXTS.adminOpenUniverse),
        ),
        h("section", { class: "page-header" },
            h("span", { class: "eyebrow" }, TEXTS.navAdmin),
            h("h1", {}, universe.name),
        ),
        details.element,
        search.element,
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminMoviesInUniverse),
            filmCount,
        ),
        h("p", { class: "hint" }, TEXTS.adminStoryHint, " ", TEXTS.adminEditorHint),
        editor.element,
        bar,
    );
    ready = true;
    update();
}

/** Název, popis, barva, typ a kategorie kolekce – změny se jen sbírají (uloží je Save). */
function detailsForm(universe, categories, onChange) {
    const original = {
        name: universe.name,
        description: universe.description ?? "",
        color: universe.color ?? "#d4a75a",
        kind: universe.kind ?? "series",
    };
    const name = h("input", { type: "text", value: original.name, maxlength: 80, required: true });
    const description = h("input", { type: "text", value: original.description, maxlength: 200 });
    const color = h("input", { type: "color", value: original.color, class: "color-input" });
    const kind = h("select", { class: "admin-input admin-select" },
        KINDS.map(([value, key]) => h("option", { value, selected: original.kind === value }, TEXTS[key])));

    const assigned = new Set((universe.categories ?? []).map((c) => c.id));
    const categoryBoxes = categories.map((c) => ({
        id: c.id,
        input: h("input", { type: "checkbox", checked: assigned.has(c.id) }),
        label: c.name,
        color: c.color,
    }));

    const current = () => ({
        name: name.value.trim(),
        description: description.value.trim(),
        color: color.value,
        kind: kind.value,
    });
    const categoryIds = () => categoryBoxes.filter((box) => box.input.checked).map((box) => box.id);
    const categoriesChanged = () => {
        const now = categoryIds();
        return now.length !== assigned.size || now.some((id) => !assigned.has(id));
    };
    const changedValues = () => {
        const now = current();
        return Object.fromEntries(Object.entries(now).filter(([key, value]) => value !== original[key]));
    };

    const form = {
        element: null,
        onKindChange: () => {},
        changes: () => Object.keys(changedValues()).length + (categoriesChanged() ? 1 : 0),
        changedValues,
        categoriesChanged,
        categoryIds,
        valid: () => current().name !== "",
    };

    for (const input of [name, description]) input.addEventListener("input", onChange);
    color.addEventListener("input", () => {
        setAccent(color.value);         // náhled barvy hned při výběru
        onChange();
    });
    kind.addEventListener("change", () => {
        form.onKindChange(kind.value);
        onChange();
    });
    categoryBoxes.forEach((box) => box.input.addEventListener("change", onChange));

    form.element = h("form", {
            class: "admin-form",
            onSubmit: (event) => event.preventDefault(),
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
    );
    return form;
}

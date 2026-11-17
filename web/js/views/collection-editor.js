// Editor filmů kolekce (V4.3.1) – jeden kód pro admin panel i pro požadavek na kolekci.
//
//   mode "admin"   – úprava kolekce v admin panelu a schválení požadavku na kolekci:
//                    oddíl, série, popisek, pořadí v příběhu, volitelný, poznámka (u cesty), obal,
//                    pořadí šipkami, odebrání (u uloženého filmu s „Vrátit“). Nic se neukládá hned –
//                    změny se sbírají a uloží je až stránka (Save).
//   mode "request" – uživatel v požadavku na kolekci: oddíl, série, popisek, pořadí, odebrání.
//
// Editor jen drží stav a vykresluje řádky; ukládání a hledání filmů řeší stránka, která ho používá.

import { isUpcoming } from "../data.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, poster, pill, yearOf } from "../dom.js";

const TEXT_FIELDS = ["group_label", "franchise", "label", "note"];
const FIELDS = [...TEXT_FIELDS, "story_order", "is_optional"];
let rowCounter = 0;

/**
 * @param {object} options
 * @param {Array} options.items    filmy kolekce v pořadí: { id?, tmdb_id, film, group_label, franchise, label,
 *                                 story_order, is_optional, note, is_upcoming }
 * @param {"admin"|"request"} options.mode
 * @param {string} [options.kind]  druh kolekce (u cesty se ukazuje poznámka a nová položka jde na konec)
 * @param {number} [options.coverId] TMDB ID filmu na obalu (jen admin)
 * @param {boolean} [options.showCover] tlačítko „Use as cover“ (admin; ne při zakládání kolekce z požadavku)
 * @param {Function} [options.onChange] zavolá se po každé změně
 */
export function createCollectionEditor({ items, mode, kind = "series", coverId = null, showCover = true, onChange = () => {} }) {
    const admin = mode === "admin";
    let currentKind = kind;
    let cover = coverId;
    const originalCover = coverId;
    let rows = items.map((item, index) => makeRow(item, index));
    const list = h("ol", { class: `admin-list coll-editor coll-editor--${mode}` });

    /** Řádek editoru: model (hodnoty polí) + původní stav pro počítání změn. */
    function makeRow(item, originalIndex = null) {
        const row = {
            key: ++rowCounter,
            id: item.id ?? null,
            tmdb_id: item.tmdb_id ?? item.film?.tmdb_id,
            film: item.film,
            is_upcoming: item.is_upcoming ?? false,
            values: Object.fromEntries(FIELDS.map((field) => [field, normalized(field, item[field])])),
            originalIndex,
            removed: false,
            element: null,
        };
        row.original = { ...row.values };
        return row;
    }

    const visible = () => rows.filter((row) => !row.removed);

    /** Je řádek jiný než po načtení? (nový, odebraný, posunutý nebo změněný) */
    function isChanged(row) {
        if (row.removed || row.originalIndex === null) return true;
        if (visible().indexOf(row) !== row.originalIndex) return true;
        return FIELDS.some((field) => row.values[field] !== row.original[field]);
    }

    function changed() {
        // Zvýraznění změněných řádků jen v adminu (v požadavku je nové všechno)
        if (admin) rows.forEach((row) => row.element?.classList.toggle("coll-row--changed", isChanged(row) && !row.removed));
        onChange();
    }

    /** Vykreslí řádky v aktuálním pořadí (prvky řádků se znovu použijí – pole neztratí rozepsaný text). */
    function render() {
        for (const row of rows) row.element ??= buildRow(row);
        const shown = visible();
        for (const row of rows) {
            const index = shown.indexOf(row);
            row.element.classList.toggle("coll-row--removed", row.removed);
            row.element.querySelector(".admin-row__order").textContent = row.removed ? "–" : String(index + 1);
            row.up.disabled = row.removed || index <= 0;
            row.down.disabled = row.removed || index === shown.length - 1;
            if (row.coverButton) {
                const isCover = cover === row.tmdb_id;
                row.coverButton.hidden = isCover || row.removed;
                row.coverPill.hidden = !isCover;
            }
            if (row.undo) row.undo.hidden = !row.removed;
            row.remove.hidden = row.removed;
            row.fields.hidden = row.removed;
        }
        // Odebrané uložené filmy zůstanou vidět (přeškrtnuté, s „Vrátit“) na svém místě
        mount(list, rows.map((row) => row.element));
        if (rows.length === 0) mount(list, h("li", { class: "coll-editor__empty muted" }, TEXTS.collEditorEmpty));
        changed();
    }

    function buildRow(row) {
        const textInput = (field, labelKey, placeholderKey, max, extraClass = "") => {
            const input = h("input", {
                type: "text", class: `admin-input${extraClass}`, value: row.values[field] ?? "", maxlength: max,
                placeholder: TEXTS[placeholderKey], "aria-label": `${TEXTS[labelKey]} – ${row.film.title}`,
            });
            input.addEventListener("input", () => {
                row.values[field] = normalized(field, input.value);
                changed();
            });
            return h("label", { class: `mini-field${extraClass ? " mini-field--wide" : ""}` }, h("span", {}, TEXTS[labelKey]), input);
        };
        const keys = admin
            ? { group: "adminGroup", groupPh: "adminGroupPlaceholder", series: "adminFranchise", seriesPh: "adminFranchisePlaceholder", label: "adminLabel", labelPh: "adminLabelPlaceholder" }
            : { group: "collEditorSection", groupPh: "collEditorSectionPlaceholder", series: "collEditorSeries", seriesPh: "collEditorSeriesPlaceholder", label: "collEditorLabel", labelPh: "collEditorLabelPlaceholder" };

        const isPath = currentKind === "path";
        const fields = [
            textInput("group_label", keys.group, keys.groupPh, 60),
            isPath ? null : textInput("franchise", keys.series, keys.seriesPh, 60),
            textInput("label", keys.label, keys.labelPh, 60),
        ];
        if (admin) {
            const story = h("input", {
                type: "number", class: "admin-input admin-input--number", min: 1, max: 999,
                value: row.values.story_order ?? "", placeholder: "—", "aria-label": `${TEXTS.adminStoryOrder} – ${row.film.title}`,
            });
            story.addEventListener("input", () => {
                row.values.story_order = normalized("story_order", story.value);
                changed();
            });
            const optional = h("input", { type: "checkbox", checked: row.values.is_optional });
            optional.addEventListener("change", () => {
                row.values.is_optional = optional.checked;
                changed();
            });
            fields.push(
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminStoryOrder), story),
                h("label", { class: "mini-check" }, optional, h("span", {}, TEXTS.adminOptional)));
        }
        row.fields = h("div", { class: "coll-row__fields" },
            h("div", { class: "admin-row__fields" }, fields),
            admin && isPath ? textInput("note", "adminNote", "adminNotePlaceholder", 300, " admin-input--grow") : null);

        row.up = h("button", {
            class: "icon-btn", type: "button", title: TEXTS.adminMoveUp, "aria-label": `${TEXTS.adminMoveUp} – ${row.film.title}`,
            onClick: () => move(row, -1),
        }, "↑");
        row.down = h("button", {
            class: "icon-btn", type: "button", title: TEXTS.adminMoveDown, "aria-label": `${TEXTS.adminMoveDown} – ${row.film.title}`,
            onClick: () => move(row, 1),
        }, "↓");
        row.remove = h("button", {
            class: "icon-btn icon-btn--danger", type: "button",
            title: TEXTS.collEditorRemove, "aria-label": `${TEXTS.collEditorRemove} – ${row.film.title}`,
            onClick: () => removeRow(row),
        }, "✕");
        if (admin) {
            row.undo = h("button", { class: "btn btn--small", type: "button", hidden: true, onClick: () => restoreRow(row) }, TEXTS.adminEditorUndo);
        }
        if (admin && showCover) {
            row.coverButton = h("button", {
                class: "btn btn--small", type: "button",
                onClick: () => { cover = row.tmdb_id; render(); },
            }, TEXTS.adminSetCover);
            row.coverPill = pill(TEXTS.adminIsCover, true);
        }

        const { film } = row;
        return h("li", { class: `admin-row admin-row--film coll-row${row.values.is_optional ? " film--optional" : ""}` },
            h("span", { class: "admin-row__order" }),
            poster(film.poster_path, film.title, "film__poster", false, "small"),
            h("div", { class: "admin-row__info" },
                h("strong", {}, film.title),
                h("div", { class: "pills" },
                    pill(yearOf(film.release_date) || TEXTS.dateTba),
                    row.coverPill ?? null,
                    admin && isUpcoming({ film, is_upcoming: row.is_upcoming }) ? pill(TEXTS.comingSoonBadge) : null,
                    admin && row.originalIndex === null ? pill(TEXTS.adminEditorNew, true) : null),
                row.fields),
            h("div", { class: "admin-row__actions" }, row.up, row.down, row.coverButton ?? null, row.remove, row.undo ?? null));
    }

    /** Posun o jedno místo mezi neodebranými filmy. */
    function move(row, step) {
        const shown = visible();
        const target = shown[shown.indexOf(row) + step];
        if (!target) return;
        const a = rows.indexOf(row);
        const b = rows.indexOf(target);
        [rows[a], rows[b]] = [rows[b], rows[a]];
        render();
        (step < 0 ? row.up : row.down).focus();
    }

    /** Odebrání: nový film zmizí úplně, uložený zůstane přeškrtnutý s „Vrátit“ (admin). */
    function removeRow(row) {
        if (row.originalIndex === null || !admin) {
            rows = rows.filter((r) => r !== row);
        } else {
            row.removed = true;
        }
        if (cover === row.tmdb_id && row.originalIndex === null) cover = originalCover;
        render();
    }

    function restoreRow(row) {
        row.removed = false;
        render();
    }

    render();

    return {
        element: list,

        /** Filmy v aktuálním pořadí (bez odebraných) pro uložení. */
        items: () => visible().map((row) => ({
            id: row.id, tmdb_id: row.tmdb_id, film: row.film, ...row.values,
        })),

        /** ID odebraných uložených položek. */
        removedIds: () => rows.filter((row) => row.removed && row.id !== null).map((row) => row.id),

        /** Počet změněných řádků (+ obal). */
        changes: () => rows.filter(isChanged).length + (cover !== originalCover ? 1 : 0),

        /** Obal (TMDB ID) – změněný, nebo původní. */
        cover: () => cover,
        coverChanged: () => cover !== originalCover,

        /** Je film v kolekci (i odebraný – vrátí se přes „Vrátit“)? */
        has: (tmdbId) => rows.some((row) => row.tmdb_id === tmdbId && !row.removed),

        /** Počet filmů (bez odebraných). */
        count: () => visible().length,

        /**
         * Přidá film. Admin (mimo cesty): podle data premiéry (V3.5.2.1), jinak na konec.
         * film = { tmdb_id, title, poster_path, release_date }, fields = { group_label, is_optional… }.
         */
        add(film, fields = {}) {
            const removedRow = rows.find((row) => row.tmdb_id === film.tmdb_id && row.removed);
            if (removedRow) {
                removedRow.removed = false;
                render();
                return;
            }
            const row = makeRow({ ...fields, tmdb_id: film.tmdb_id, film, is_upcoming: false });
            const date = film.release_date || "9999";
            const later = admin && currentKind !== "path" && film.release_date
                ? rows.findIndex((r) => !r.removed && (r.film.release_date || "9999") > date)
                : -1;
            if (later === -1) rows.push(row); else rows.splice(later, 0, row);
            render();
            row.element.scrollIntoView({ block: "nearest", behavior: "smooth" });
        },

        /** Odebere film podle TMDB ID (např. odškrtnutí ve výsledcích hledání). */
        removeFilm(tmdbId) {
            const row = rows.find((r) => r.tmdb_id === tmdbId && !r.removed);
            if (row) removeRow(row);
        },

        /** Druh kolekce se změnil (cesta ukazuje poznámky) – řádky se postaví znovu. */
        setKind(newKind) {
            if (newKind === currentKind) return;
            currentKind = newKind;
            rows.forEach((row) => { row.element = null; });
            render();
        },
    };
}

/** Hodnota pole tak, jak se uloží: prázdný text = null, číslo pořadí 1–999. */
function normalized(field, value) {
    if (field === "is_optional") return Boolean(value);
    if (field === "story_order") {
        const number = Number(value);
        return value === "" || value === null || value === undefined || !Number.isInteger(number) || number < 1 || number > 999 ? null : number;
    }
    const text = String(value ?? "").trim();
    return text === "" ? null : text;
}

/** Text lišty s neuloženými změnami: „Unsaved changes: 3“. */
export function unsavedText(count) {
    return format("adminEditorUnsaved", count);
}

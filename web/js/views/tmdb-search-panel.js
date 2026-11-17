// Hledání filmu v TMDB pro editor kolekce v admin panelu (V4.3.1) – úprava kolekce i schválení
// požadavku na kolekci. Výsledky po přidání zůstanou (dřív se panel zavřel a hledalo se znovu):
// u přidaného filmu je „✓ Added“ a dalším klepnutím se z editoru zase odebere.

import { TEXTS, format } from "../texts.js";
import { h, mount, poster, pill, loadingView } from "../dom.js";

/**
 * @param {object} options
 * @param {Function} options.search    (query) → Promise<[{ tmdb_id, title, original_title, year, release_date, poster_path }]>
 * @param {Function} options.isAdded   (tmdbId) → je film v editoru?
 * @param {Function} options.onToggle  (movie, added) → přidat / odebrat
 * @param {Node} [options.extra]       pole pro nové filmy (oddíl, volitelný…)
 * @param {boolean} [options.open]     panel rozbalený hned
 */
export function tmdbSearchPanel({ search, isAdded, onToggle, extra = null, open = false }) {
    const query = h("input", {
        type: "search", class: "admin-input admin-input--grow",
        placeholder: TEXTS.adminSearchPlaceholder, "aria-label": TEXTS.adminSearch,
    });
    const submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminSearch);
    const results = h("div", { class: "search-results" });
    let found = [];
    let shownState = "";            // které výsledky byly vykreslené jako přidané

    async function handleSearch(event) {
        event.preventDefault();
        if (!query.value.trim()) return;
        submit.disabled = true;
        mount(results, loadingView());
        try {
            found = await search(query.value);
            renderResults();
        } catch (error) {
            mount(results, h("p", { class: "form-error" }, format("errorGeneric", error.message)));
        }
        submit.disabled = false;
    }

    function renderResults() {
        shownState = found.map((movie) => isAdded(movie.tmdb_id)).join();
        mount(results, found.length === 0
            ? h("p", { class: "muted" }, TEXTS.adminNoResults)
            : found.map(resultCard));
    }

    function resultCard(movie) {
        const added = isAdded(movie.tmdb_id);
        return h("div", { class: `search-result${added ? " search-result--added" : ""}` },
            poster(movie.poster_path, movie.title, "film__poster", false, "small"),
            h("div", { class: "admin-row__info" },
                h("strong", {}, movie.title),
                h("div", { class: "pills" }, pill(movie.year ?? "—"),
                    movie.original_title && movie.original_title !== movie.title ? pill(movie.original_title) : null),
            ),
            h("button", {
                class: `btn btn--small${added ? " btn--picked" : " btn--universe"}`, type: "button",
                "aria-pressed": String(added),
                title: added ? TEXTS.collEditorRemove : null,
                onClick: () => onToggle(movie, added),
            }, added ? `✓ ${TEXTS.adminEditorAdded}` : `+ ${TEXTS.adminAdd}`),
        );
    }

    const element = h("details", { class: "panel-details", open },
        h("summary", {}, `+ ${TEXTS.adminAddMovie}`),
        h("form", { class: "admin-form", onSubmit: handleSearch },
            h("div", { class: "admin-search" }, query, submit),
            extra,
            results,
        ),
    );

    return {
        element,
        /** Překreslí tlačítka výsledků (po změně v editoru). */
        refresh: () => {
            if (found.length > 0 && found.map((movie) => isAdded(movie.tmdb_id)).join() !== shownState) renderResults();
        },
    };
}

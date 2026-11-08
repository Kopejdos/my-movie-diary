// Panel „New movies in your series“ v admin panelu (záložka Collections, V3.5.2.3).
// Po otevření se zeptá funkce admin na nové díly sérií – ta jednou za den sama
// zkontroluje série v TMDB (díly, které v kolekcích chybí, a posunuté premiéry).
// Díl jde jedním klikem přidat do kolekce (zařadí se podle data premiéry, případně
// i do studia, kde už jiné díly série jsou) nebo zahodit – zahozený se znovu nenabídne.
// Do seedu se přidané filmy propíšou samy (sync-seed, V3.5.2.1).

import { fetchSeriesUpdates, decideSeriesUpdate, dismissAllSeriesUpdates } from "../admin.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, yearOf, toast } from "../dom.js";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** „3 hours ago“ z času ISO. */
function ago(iso) {
    if (!iso) return TEXTS.adminSeriesNever;
    const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
    if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
}

/** Panel s novými díly; načítá se sám (kontrola v TMDB může trvat pár sekund). */
export function seriesUpdatesPanel() {
    const panel = h("section", { class: "admin-series", "aria-live": "polite" });
    let data = null;
    let busy = false;

    async function load(force) {
        busy = true;
        render();
        try {
            data = await fetchSeriesUpdates(force);
            if (force) {
                toast(format("adminSeriesChecked", data.series ?? 0, movies(data.found ?? 0), data.dates_updated ?? 0));
            }
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
        busy = false;
        render();
    }

    const checkButton = () => h("button", {
        class: "btn btn--small", type: "button", disabled: busy, onClick: () => load(true),
    }, busy ? TEXTS.adminSeriesChecking : TEXTS.adminSeriesCheckNow);

    function statusLine() {
        if (!data) return TEXTS.adminSeriesChecking;
        const parts = [format("adminSeriesLastCheck", ago(data.checked_at))];
        if (data.series) parts.push(format("adminSeriesWatched", data.series));
        if (data.dates_updated) parts.push(format("adminSeriesDates", data.dates_updated));
        return parts.join(" · ");
    }

    function render() {
        const updates = data?.updates ?? [];
        if (updates.length === 0) {
            // Nic nového – jen tenký řádek se stavem
            mount(panel,
                h("div", { class: "admin-series__quiet" },
                    h("span", {}, data ? `✓ ${TEXTS.adminSeriesUpToDate}` : "⏳"),
                    h("span", { class: "muted" }, statusLine()),
                    checkButton()));
            return;
        }
        mount(panel,
            h("div", { class: "section-title admin-series__title" },
                h("h2", {}, TEXTS.adminSeriesTitle, " ", h("span", { class: "nav__badge admin-series__count" }, String(updates.length))),
                h("span", { class: "admin-series__actions" },
                    checkButton(),
                    h("button", {
                        class: "btn btn--small btn--danger", type: "button", disabled: busy,
                        onClick: async () => {
                            if (!window.confirm(format("adminSeriesConfirmDismissAll", updates.length))) return;
                            try {
                                const { dismissed } = await dismissAllSeriesUpdates();
                                toast(format("adminSeriesDismissed", movies(dismissed)));
                                data.updates = [];
                                render();
                            } catch (error) {
                                toast(format("errorGeneric", error.message), "error");
                            }
                        },
                    }, TEXTS.adminSeriesDismissAll))),
            h("p", { class: "hint" }, statusLine(), " · ", TEXTS.adminSeriesHint),
            data.backfill_left > 0 ? h("p", { class: "hint" }, format("adminSeriesBackfill", data.backfill_left)) : null,
            h("ul", { class: "admin-requests" }, updates.map((update) => updateRow(update))));
    }

    /** Řádek nalezeného dílu: plakát, název, kam patří, studia, Add / Dismiss. */
    function updateRow(update) {
        const boxes = (update.also ?? []).map((studio) => ({
            id: studio.universe_id,
            input: h("input", { type: "checkbox", checked: true, "aria-label": studio.name }),
            name: studio.name,
        }));
        const decide = async (add, buttons) => {
            buttons.forEach((b) => { b.disabled = true; });
            try {
                const result = await decideSeriesUpdate(update.id, add, boxes.filter((b) => b.input.checked).map((b) => b.id));
                const extra = (result.also ?? []).length ? ` ${format("adminSeriesAlso", result.also.join(", "))}` : "";
                toast(add ? `${format("adminSeriesAdded", update.title, update.universe?.name ?? "")}${extra}` : format("adminSeriesDismissedOne", update.title));
                data.updates = data.updates.filter((u) => u.id !== update.id);
                render();
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                buttons.forEach((b) => { b.disabled = false; });
            }
        };
        const add = h("button", { class: "btn btn--small btn--primary", type: "button" }, TEXTS.adminSeriesAdd);
        const dismiss = h("button", { class: "btn btn--small", type: "button" }, TEXTS.adminSeriesDismiss);
        add.addEventListener("click", () => decide(true, [add, dismiss]));
        dismiss.addEventListener("click", () => decide(false, [add, dismiss]));

        return h("li", { class: "admin-request admin-series__item" },
            h("div", { class: "admin-series__film" },
                poster(update.poster_path, update.title, "req-film__poster", false, "tiny"),
                h("span", { class: "req-wanted__info" },
                    h("strong", {}, update.title),
                    h("span", { class: "muted" },
                        [yearOf(update.release_date) || TEXTS.requestsSeriesNoDate, `TMDB ${update.tmdb_id}`].join(" · "))),
                h("a", {
                    class: "pill admin-series__target", href: `#/admin/collection/${update.universe?.slug ?? ""}`,
                    style: update.universe?.color ? `--c: ${update.universe.color}` : null,
                }, `→ ${update.universe?.name ?? "?"}`)),
            boxes.length > 0
                ? h("div", { class: "admin-request__also" },
                    h("span", { class: "hint" }, TEXTS.adminAlsoAddTo),
                    boxes.map((b) => h("label", { class: "admin-request__also-option" }, b.input, ` ${b.name}`)))
                : null,
            h("div", { class: "admin-request__actions" }, add, dismiss));
    }

    render();
    load(false);
    return panel;
}

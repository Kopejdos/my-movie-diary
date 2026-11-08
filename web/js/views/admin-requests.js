// Obrazovka admin panelu: požadavky na filmy (#/admin/requests, V3.5.1).
// U každého požadavku jde přijmout celý, nebo jen vybrané filmy; u filmu se volí kolekce
// (předvybraný je první návrh podle série / studia z TMDB). Přijatý film se uloží do MMD,
// případně na konec kolekce.
// V3.5.2:
//   • Požadavek na kolekci (jedna série TMDB) → jedním klikem nová kolekce z vybraných dílů.
//   • Suggested new collections – aspoň 2 požadované filmy ze stejné série, která v MMD
//     ještě nemá kolekci → nabídka vytvořit kolekci z celé série.
//   • Seed se už ručně neupravuje: položky z požadavků import nesmaže a skript
//     scripts/sync-seed.sh je do supabase/seed/universes.json dopíše sám.

import { listFilmRequests, decideFilmRequests, createCollectionFromSeries } from "../admin.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, yearOf, formatDate, toast, loadingView, errorView } from "../dom.js";
import { requireAdminView, adminHeader } from "./admin.js";

export async function adminRequestsView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTabRequests} · ${TEXTS.appName}`;
    mount(container, adminHeader("requests"), loadingView());

    let data;
    try {
        data = await listFilmRequests();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, adminHeader("requests"),
            errorView(format("errorGeneric", error.message), () => adminRequestsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const seedBox = h("div", { class: "admin-seed", hidden: true });
    const reload = async (seedText) => {
        try {
            data = await listFilmRequests();
            render();
            showSeed(seedBox, seedText);
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    };
    const list = h("div");
    const render = () => mount(list,
        (data.new_collections ?? []).length > 0
            ? h("section", { class: "admin-new-collections" },
                h("div", { class: "section-title" },
                    h("h2", {}, TEXTS.adminNewCollections),
                    h("span", { class: "muted" }, String(data.new_collections.length))),
                h("p", { class: "hint" }, TEXTS.adminNewCollectionsHint),
                h("ul", { class: "admin-requests" }, data.new_collections.map((series) => {
                    const ids = new Set(series.items.map((i) => i.id));
                    const suggestions = data.requests.flatMap((r) => r.items).filter((i) => ids.has(i.id)).flatMap((i) => i.suggestions);
                    return newCollectionCard(series, studioPicker(suggestions), reload);
                })))
            : null,
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabRequests),
            h("span", { class: "muted" }, format("adminRequestsCount", data.requests.length))),
        data.requests.length === 0
            ? h("p", { class: "empty-filter" }, TEXTS.adminRequestsEmpty)
            : h("ol", { class: "admin-requests" }, data.requests.map((request) => request.kind === "collection"
                ? collectionRequestCard(request, studioPicker(request.items.flatMap((i) => i.suggestions)), reload)
                : requestCard(request, data.universes, reload))));

    render();
    mount(container, adminHeader("requests"), seedBox, list);
}

/**
 * Co se uložilo do seedu – jen pro kontrolu. Položky z požadavků import nesmaže
 * a ./scripts/import.sh (nebo ./scripts/sync-seed.sh) je do universes.json dopíše sám.
 */
function showSeed(box, seedText) {
    if (!seedText) return;
    mount(box,
        h("p", {}, TEXTS.adminRequestsSeedHint),
        h("pre", { class: "admin-seed__code" }, seedText));
    box.hidden = false;
}

/** Řádky výsledku rozhodnutí → text pro kontrolu (kolekce: řádek seedu). */
function seedLinesText(results) {
    const lines = results.filter((r) => r.seed);
    return lines.length ? lines.map((l) => `${l.universe}:  ${l.seed}`).join("\n") : null;
}

/** Pole s názvem nové kolekce (předvyplněný název série bez „Collection“). */
function nameInput(value) {
    return h("input", {
        class: "admin-request__name", type: "text", maxlength: 80, value,
        "aria-label": TEXTS.adminNewCollectionName, placeholder: TEXTS.adminNewCollectionName,
    });
}

/**
 * Zaškrtávátka „Also add to“ – kolekce studií z návrhů u filmů série (V3.5.2.1).
 * Studio, ve kterém už jsou jiné díly série (např. Warner Bros. u Lethal Weapon), je zaškrtnuté
 * předem; studio jen podle produkční společnosti z TMDB ne.
 */
function studioPicker(suggestions) {
    const studios = new Map();
    for (const s of suggestions) {
        if (s.kind !== "studio") continue;
        const sameSeries = s.reason.startsWith("Same series");
        const known = studios.get(s.universe_id);
        if (!known || (sameSeries && !known.sameSeries)) studios.set(s.universe_id, { ...s, sameSeries });
    }
    const boxes = [...studios.values()].map((s) => ({
        id: s.universe_id,
        input: h("input", { type: "checkbox", checked: s.sameSeries, "aria-label": s.name }),
        studio: s,
    }));
    return {
        element: boxes.length === 0 ? null : h("div", { class: "admin-request__also" },
            h("span", { class: "hint" }, TEXTS.adminAlsoAddTo),
            boxes.map((b) => h("label", { class: "admin-request__also-option", title: b.studio.reason },
                b.input, ` ${b.studio.name}`, h("span", { class: "muted" }, ` · ${b.studio.sameSeries ? TEXTS.adminAlsoSameSeries : TEXTS.adminAlsoStudio}`)))),
        picked: () => boxes.filter((b) => b.input.checked).map((b) => b.id),
    };
}

/** Vytvoří kolekci ze série TMDB a obnoví seznam (společné pro obě karty). */
async function createFromSeries(buttons, tmdbCollectionId, name, tmdbIds, reload, rejectIds = [], also = []) {
    buttons.forEach((b) => { b.disabled = true; });
    try {
        const result = await createCollectionFromSeries(tmdbCollectionId, name, tmdbIds, also);
        // nezaškrtnuté díly požadavku na kolekci → zamítnuté (jinak by dál čekaly)
        if (rejectIds.length > 0) await decideFilmRequests(rejectIds.map((id) => ({ id, approve: false })));
        const extra = (result.also ?? []).filter((a) => a.films > 0).map((a) => format("adminAlsoAdded", a.universe, movies(a.films)));
        toast([format("adminNewCollectionCreated", result.name, movies(result.films)), ...extra].join(" "));
        await reload(result.seed);
    } catch (error) {
        toast(format("errorGeneric", error.message), "error");
        buttons.forEach((b) => { b.disabled = false; });
    }
}

/** Návrh nové kolekce: víc požadovaných filmů z jedné série TMDB (z běžných požadavků). */
function newCollectionCard(series, studios, reload) {
    const name = nameInput(series.name);
    const create = h("button", {
        class: "btn btn--small btn--primary", type: "button",
        onClick: () => createFromSeries([create], series.tmdb_collection_id, name.value, [], reload, [], studios.picked()),
    }, TEXTS.adminNewCollectionCreate);
    const titles = [...new Map(series.items.map((i) => [i.tmdb_id, i.title])).values()];
    return h("li", { class: "admin-request admin-request--series" },
        h("div", { class: "admin-request__head" },
            h("strong", {}, series.tmdb_name),
            h("span", { class: "muted" }, format("adminNewCollectionParts", movies(series.parts))),
            h("span", { class: "muted" }, format("adminNewCollectionRequested", titles.join(", ")))),
        h("div", { class: "admin-request__create" }, name, create),
        studios.element);
}

/** Požadavek na kolekci: díly jedné série → nová kolekce z vybraných dílů, nebo zamítnutí. */
function collectionRequestCard(request, studios, reload) {
    const rows = request.items.map((item) => {
        const checkbox = h("input", { type: "checkbox", checked: true, "aria-label": item.title });
        const element = h("li", { class: "admin-request__film admin-request__film--plain" },
            h("label", { class: "admin-request__pick" }, checkbox,
                poster(item.poster_path, item.title, "req-film__poster", false, "tiny"),
                h("span", { class: "req-wanted__info" },
                    h("strong", {}, item.title),
                    h("span", { class: "muted" }, [yearOf(item.release_date), format("requestsWants", item.wants),
                        `TMDB ${item.tmdb_id}`].filter(Boolean).join(" · ")))));
        return { item, checkbox, element };
    });
    const name = nameInput((request.collection_name ?? "").replace(/\s+Collection$/i, ""));
    const picked = () => rows.filter((r) => r.checkbox.checked);

    const createButton = h("button", {
        class: "btn btn--small btn--primary", type: "button",
        onClick: () => {
            if (picked().length < 2) {
                toast(TEXTS.adminCollectionRequestTooFew, "error");
                return;
            }
            const rest = rows.filter((r) => !r.checkbox.checked).map((r) => r.item.id);
            createFromSeries(buttons, request.tmdb_collection_id, name.value, picked().map((r) => r.item.tmdb_id), reload, rest, studios.picked());
        },
    }, TEXTS.adminNewCollectionCreate);
    const rejectButton = h("button", {
        class: "btn btn--small btn--danger", type: "button",
        onClick: async () => {
            if (picked().length === 0) {
                toast(TEXTS.adminRequestsPickSome, "error");
                return;
            }
            buttons.forEach((b) => { b.disabled = true; });
            try {
                const { results } = await decideFilmRequests(picked().map((r) => ({ id: r.item.id, approve: false })));
                toast(format("adminRequestsRejected", movies(results.length)));
                await reload(null);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                buttons.forEach((b) => { b.disabled = false; });
            }
        },
    }, TEXTS.adminRequestsReject);
    const buttons = [createButton, rejectButton];

    return h("li", { class: "admin-request admin-request--collection" },
        h("div", { class: "admin-request__head" },
            h("span", { class: "eyebrow" }, TEXTS.adminCollectionRequest),
            h("strong", {}, request.username ? `@${request.username}` : TEXTS.adminRequestsUnknownUser),
            h("span", { class: "muted" }, formatDate(request.created_at.slice(0, 10))),
            h("span", { class: "muted" }, movies(request.items.length))),
        request.note ? h("p", { class: "req-card__note" }, `“${request.note}”`) : null,
        h("ul", { class: "admin-request__films" }, rows.map((r) => r.element)),
        h("div", { class: "admin-request__create" }, name),
        studios.element,
        h("div", { class: "admin-request__actions" },
            h("span", { class: "hint" }, TEXTS.adminRequestsSelectedHint), ...buttons),
    );
}

/** Karta požadavku: žadatel, poznámka, filmy s výběrem kolekce a tlačítka. */
function requestCard(request, universes, reload) {
    const rows = request.items.map((item) => itemRow(item, universes));

    async function decide(approve) {
        const picked = rows.filter((r) => r.checkbox.checked);
        if (picked.length === 0) {
            toast(TEXTS.adminRequestsPickSome, "error");
            return;
        }
        buttons.forEach((b) => { b.disabled = true; });
        try {
            const { results } = await decideFilmRequests(picked.map((r) => ({
                id: r.item.id,
                approve,
                universe_id: approve && r.select.value ? Number(r.select.value) : null,
            })));
            const added = results.filter((r) => r.status === "added").length;
            const rejected = results.filter((r) => r.status === "rejected").length;
            toast(approve ? format("adminRequestsAdded", movies(added)) : format("adminRequestsRejected", movies(rejected)));
            await reload(seedLinesText(results));
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            buttons.forEach((b) => { b.disabled = false; });
        }
    }

    const approveButton = h("button", { class: "btn btn--small btn--primary", type: "button", onClick: () => decide(true) }, TEXTS.adminRequestsApprove);
    const rejectButton = h("button", { class: "btn btn--small btn--danger", type: "button", onClick: () => decide(false) }, TEXTS.adminRequestsReject);
    const buttons = [approveButton, rejectButton];

    return h("li", { class: "admin-request" },
        h("div", { class: "admin-request__head" },
            h("strong", {}, request.username ? `@${request.username}` : TEXTS.adminRequestsUnknownUser),
            h("span", { class: "muted" }, formatDate(request.created_at.slice(0, 10))),
            h("span", { class: "muted" }, movies(request.items.length))),
        request.note ? h("p", { class: "req-card__note" }, `“${request.note}”`) : null,
        h("ul", { class: "admin-request__films" }, rows.map((r) => r.element)),
        h("div", { class: "admin-request__actions" },
            h("span", { class: "hint" }, TEXTS.adminRequestsSelectedHint), ...buttons),
    );
}

/** Řádek filmu: zaškrtnutí, plakát, název, počet zájemců, výběr kolekce (návrhy nahoře). */
function itemRow(item, universes) {
    const checkbox = h("input", { type: "checkbox", checked: true, "aria-label": item.title });
    const suggested = new Set(item.suggestions.map((s) => s.universe_id));
    const select = h("select", { class: "admin-request__select", "aria-label": TEXTS.adminRequestsCollection },
        h("option", { value: "" }, TEXTS.adminRequestsNoCollection),
        item.suggestions.length > 0
            ? h("optgroup", { label: TEXTS.adminRequestsSuggested },
                item.suggestions.map((s) => h("option", { value: String(s.universe_id) }, `${s.name} – ${s.reason}`)))
            : null,
        h("optgroup", { label: TEXTS.adminRequestsAllCollections },
            universes.filter((u) => u.kind !== "path" && !suggested.has(u.id))
                .map((u) => h("option", { value: String(u.id) }, u.name))));
    if (item.suggestions.length > 0) select.value = String(item.suggestions[0].universe_id);

    const element = h("li", { class: "admin-request__film" },
        h("label", { class: "admin-request__pick" }, checkbox,
            poster(item.poster_path, item.title, "req-film__poster", false, "tiny"),
            h("span", { class: "req-wanted__info" },
                h("strong", {}, item.title),
                h("span", { class: "muted" }, [yearOf(item.release_date), format("requestsWants", item.wants),
                    `TMDB ${item.tmdb_id}`].filter(Boolean).join(" · ")))),
        select);
    return { item, checkbox, select, element };
}

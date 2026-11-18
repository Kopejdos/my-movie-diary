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
// V4.3.1:
//   • Požadavek na kolekci (série TMDB i vlastní kolekce z libovolných filmů) se schvaluje
//     v editoru kolekce (stejný jako v admin panelu i u uživatele) – předvyplněný pořadím,
//     oddílem, sérií a popiskem od uživatele; správce jen doladí, případně přidá další filmy.
// V4.3.3:
//   • Zamítnutí s důvodem a poznámkou pro uživatele (místo „hrubého odhození“); u kolekce jen
//     tento požadavek, uživatel ji může upravit a poslat znovu.
//   • U požadavku na kolekci upozornění na podobné kolekce, které už v MMD jsou.

import { listFilmRequests, decideFilmRequests, createCollectionFromSeries, createCollection, searchTmdb } from "../admin.js";
import { fetchSimilarCollections } from "../requests.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, yearOf, formatDate, toast, loadingView, errorView } from "../dom.js";
import { requireAdminView, adminHeader } from "./admin.js";
import { adminSearch, matchesQuery, noResults } from "./admin-search.js";
import { createCollectionEditor } from "./collection-editor.js";
import { tmdbSearchPanel } from "./tmdb-search-panel.js";

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
    // Hledání (V3.5.2.2): žadatel, poznámka, název série, názvy filmů; filtr druhu požadavku
    const search = adminSearch({
        key: "requests",
        placeholder: TEXTS.adminSearchRequests,
        filters: [
            { value: "all", label: TEXTS.kindAll },
            { value: "films", label: TEXTS.requestsMode_films },
            { value: "collection", label: TEXTS.adminFilterCollections },
        ],
        onChange: () => render(),
    });
    const render = () => {
        const query = search.query();
        const kind = search.filter();
        const requests = data.requests.filter((r) => (kind === "all" || ((r.kind ?? "films") === "films" ? "films" : "collection") === kind) &&
            matchesQuery(query, r.username, r.note, r.collection_name, ...r.items.map((i) => i.title)));
        const series = kind === "films" ? [] : (data.new_collections ?? []).filter((c) =>
            matchesQuery(query, c.tmdb_name, c.name, ...c.items.map((i) => i.title)));
        search.setCount(requests.length, data.requests.length);
        const nothing = search.active() && requests.length === 0 && series.length === 0;
        mount(list,
            series.length > 0
                ? h("section", { class: "admin-new-collections" },
                    h("div", { class: "section-title" },
                        h("h2", {}, TEXTS.adminNewCollections),
                        h("span", { class: "muted" }, String(series.length))),
                    h("p", { class: "hint" }, TEXTS.adminNewCollectionsHint),
                    h("ul", { class: "admin-requests" }, series.map((item) => {
                        const ids = new Set(item.items.map((i) => i.id));
                        const suggestions = data.requests.flatMap((r) => r.items).filter((i) => ids.has(i.id)).flatMap((i) => i.suggestions);
                        return newCollectionCard(item, studioPicker(suggestions), reload);
                    })))
                : null,
            h("div", { class: "section-title" },
                h("h2", {}, TEXTS.adminTabRequests),
                h("span", { class: "muted" }, format("adminRequestsCount", data.requests.length))),
            nothing
                ? noResults(() => search.reset())
                : requests.length === 0
                    ? h("p", { class: "empty-filter" }, TEXTS.adminRequestsEmpty)
                    : h("ol", { class: "admin-requests" }, requests.map((request) => request.kind === "collection" || request.kind === "custom"
                        ? collectionRequestCard(request, studioPicker(request.items.flatMap((i) => i.suggestions)), reload)
                        : requestCard(request, data.universes, reload))));
    };

    render();
    mount(container, adminHeader("requests"), seedBox, data.requests.length + (data.new_collections ?? []).length > 0 ? search.element : null, list);
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

/**
 * Požadavek na kolekci (série TMDB – V3.5.2, vlastní kolekce – V4.3.1): editor předvyplněný pořadím,
 * oddílem, sérií a popiskem od uživatele. Create = nová kolekce z filmů v editoru; filmy z požadavku,
 * které v editoru nezůstaly, se zamítnou. Reject = zamítnout celý požadavek.
 */
function collectionRequestCard(request, studios, reload) {
    let search = null;                  // panel hledání – vznikne až po editoru
    const editor = createCollectionEditor({
        items: request.items.map((item) => ({
            tmdb_id: item.tmdb_id,
            film: { tmdb_id: item.tmdb_id, title: item.title, poster_path: item.poster_path, release_date: item.release_date },
            group_label: item.group_label, franchise: item.franchise, label: item.label,
        })),
        mode: "admin",
        showCover: false,
        onChange: () => search?.refresh(),
    });
    search = tmdbSearchPanel({
        search: searchTmdb,
        isAdded: (tmdbId) => editor.has(tmdbId),
        onToggle: (movie, added) => {
            if (added) editor.removeFilm(movie.tmdb_id);
            else editor.add({ tmdb_id: movie.tmdb_id, title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date ?? null });
        },
    });
    const name = nameInput((request.collection_name ?? "").replace(/\s+Collection$/i, ""));
    const description = h("input", {
        class: "admin-request__name", type: "text", maxlength: 200,
        "aria-label": TEXTS.adminDescription,
        placeholder: request.kind === "collection" ? TEXTS.adminCollectionDescriptionSeries : TEXTS.adminDescription,
    });

    const createButton = h("button", {
        class: "btn btn--small btn--primary", type: "button",
        onClick: async () => {
            const items = editor.items();
            if (items.length < 2) {
                toast(TEXTS.adminCollectionRequestTooFew, "error");
                return;
            }
            if (!name.value.trim()) {
                toast(TEXTS.adminNameRequired, "error");
                return;
            }
            const kept = new Set(items.map((item) => item.tmdb_id));
            buttons.forEach((b) => { b.disabled = true; });
            try {
                const result = await createCollection({
                    name: name.value.trim(),
                    description: description.value.trim() || null,
                    tmdb_collection_id: request.kind === "collection" ? request.tmdb_collection_id : null,
                    items: items.map((item) => ({
                        tmdb_id: item.tmdb_id, group_label: item.group_label, franchise: item.franchise, label: item.label,
                        story_order: item.story_order, is_optional: item.is_optional,
                    })),
                    also: studios.picked(),
                    reject_ids: request.items.filter((item) => !kept.has(item.tmdb_id)).map((item) => item.id),
                });
                const extra = (result.also ?? []).filter((a) => a.films > 0).map((a) => format("adminAlsoAdded", a.universe, movies(a.films)));
                toast([format("adminNewCollectionCreated", result.name, movies(result.films)), ...extra].join(" "));
                await reload(result.seed);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                buttons.forEach((b) => { b.disabled = false; });
            }
        },
    }, TEXTS.adminNewCollectionCreate);
    const reason = rejectReasonPicker("needs_changes");
    const rejectButton = h("button", {
        class: "btn btn--small btn--danger", type: "button",
        onClick: async () => {
            buttons.forEach((b) => { b.disabled = true; });
            try {
                // Jen položky tohoto požadavku, s důvodem a poznámkou pro uživatele (V4.3.3)
                const { results } = await decideFilmRequests(request.items.map((item) => ({
                    id: item.id, approve: false, only_this: true, ...reason.value(),
                })));
                toast(format("adminRequestsRejected", movies(results.length)));
                await reload(null);
            } catch (error) {
                toast(format("errorGeneric", error.message), "error");
                buttons.forEach((b) => { b.disabled = false; });
            }
        },
    }, TEXTS.adminRequestsRejectAll);
    const buttons = [createButton, rejectButton];

    return h("li", { class: "admin-request admin-request--collection" },
        h("div", { class: "admin-request__head" },
            h("span", { class: "eyebrow" }, request.kind === "custom" ? TEXTS.adminCustomCollectionRequest : TEXTS.adminCollectionRequest),
            h("strong", {}, request.username ? `@${request.username}` : TEXTS.adminRequestsUnknownUser),
            h("span", { class: "muted" }, formatDate(request.created_at.slice(0, 10))),
            h("span", { class: "muted" }, movies(request.items.length))),
        request.note ? h("p", { class: "req-card__note" }, `“${request.note}”`) : null,
        similarBox(request.items.map((item) => item.tmdb_id), request.collection_name, (found) => {
            // Podobná kolekce existuje → předvybraný důvod „similar“ s jejím názvem
            const match = found.find((c) => c.name_match || c.kind === "series" || c.kind === "path");
            if (match) reason.preset("similar", match.name);
        }),
        h("div", { class: "admin-request__create admin-request__create--details" }, name, description),
        h("p", { class: "hint" }, TEXTS.adminCollectionRequestHint),
        editor.element,
        search.element,
        studios.element,
        h("div", { class: "admin-request__actions" }, createButton),
        h("div", { class: "admin-request__actions admin-request__reject" }, reason.element, rejectButton),
    );
}

/**
 * Výběr důvodu zamítnutí a poznámky pro uživatele (V4.3.3).
 * value() → { reason, note }; preset(reason, note) předvyplní (např. podobná kolekce).
 */
export function rejectReasonPicker(initial = "other") {
    const select = h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminRejectReason },
        REJECT_REASONS.map((code) => h("option", { value: code, selected: code === initial }, TEXTS[`requestsReason_${code}`])));
    const note = h("input", {
        type: "text", class: "admin-input admin-input--grow", maxlength: 300,
        placeholder: TEXTS.adminRejectNote, "aria-label": TEXTS.adminRejectNote,
    });
    return {
        element: h("div", { class: "reject-reason" },
            h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminRejectReason), select), note),
        value: () => ({ reason: select.value, note: note.value.trim() || null }),
        preset(reason, text) {
            select.value = reason;
            if (!note.value) note.value = text;
        },
    };
}

/** Důvody, které správce nabízí (left_out se doplňuje sám u filmů vynechaných z kolekce). */
const REJECT_REASONS = ["needs_changes", "similar", "in_mmd", "duplicate", "not_released", "not_movie", "off_topic", "other"];

/**
 * Podobné kolekce v MMD (V4.3.3) – načtou se na pozadí; onFound(dostal seznam) jen když nějaké jsou.
 * Ukazuje i studia a výběry (správce posoudí sám).
 */
export function similarBox(tmdbIds, name, onFound = () => {}) {
    const box = h("div", { class: "req-similar", hidden: true });
    fetchSimilarCollections(tmdbIds, name)
        .then((found) => {
            if (found.length === 0) return;
            box.hidden = false;
            mount(box,
                h("strong", {}, `⚠ ${TEXTS.adminSimilarTitle}`),
                h("ul", {}, found.map((c) => h("li", {},
                    h("a", { href: `#/admin/collection/${c.slug}` }, c.name), " ",
                    h("span", { class: "muted" }, [
                        c.overlap >= 1 ? format("adminSimilarItem", c.overlap, tmdbIds.length, c.total) : null,
                        c.name_match ? TEXTS.adminSimilarName : null,
                        TEXTS[{ series: "kindSeries", studio: "kindStudio", genre: "kindGenre", path: "kindPath" }[c.kind] ?? "kindSeries"],
                    ].filter(Boolean).join(" · "))))));
            onFound(found);
        })
        .catch(() => {});
    return box;
}

/** Karta požadavku: žadatel, poznámka, filmy s výběrem kolekce a tlačítka. */
function requestCard(request, universes, reload) {
    const rows = request.items.map((item) => itemRow(item, universes));
    const reason = rejectReasonPicker("other");

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
                ...(approve ? {} : reason.value()),            // důvod pro uživatele (V4.3.3)
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
            h("span", { class: "hint" }, TEXTS.adminRequestsSelectedHint), approveButton),
        h("div", { class: "admin-request__actions admin-request__reject" }, reason.element, rejectButton),
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

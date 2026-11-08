// Obrazovka admin panelu: požadavky na filmy (#/admin/requests, V3.5.1).
// U každého požadavku jde přijmout celý, nebo jen vybrané filmy; u filmu se volí kolekce
// (předvybraný je první návrh podle série / studia z TMDB). Přijatý film se uloží do MMD,
// případně na konec kolekce – a admin dostane řádky do seedu, aby ho příští import nesmazal.

import { listFilmRequests, decideFilmRequests } from "../admin.js";
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
    const reload = async (seedLines) => {
        try {
            data = await listFilmRequests();
            render();
            showSeed(seedBox, seedLines);
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    };
    const list = h("div");
    const render = () => mount(list,
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabRequests),
            h("span", { class: "muted" }, format("adminRequestsCount", data.requests.length))),
        data.requests.length === 0
            ? h("p", { class: "empty-filter" }, TEXTS.adminRequestsEmpty)
            : h("ol", { class: "admin-requests" }, data.requests.map((request) => requestCard(request, data.universes, reload))));

    render();
    mount(container, adminHeader("requests"), seedBox, list);
}

/** Řádky do seedu po přijetí filmů do kolekcí (jinak by je příští import z kolekce smazal). */
function showSeed(box, lines) {
    if (!lines || lines.length === 0) return;
    const text = lines.map((l) => `${l.universe}:  ${l.seed}`).join("\n");
    mount(box,
        h("p", {}, TEXTS.adminRequestsSeedHint),
        h("pre", { class: "admin-seed__code" }, text),
        h("button", {
            class: "btn btn--small", type: "button",
            onClick: async () => {
                try {
                    await navigator.clipboard.writeText(lines.map((l) => l.seed).join(",\n"));
                    toast(TEXTS.adminRequestsSeedCopied);
                } catch {
                    toast(TEXTS.adminRequestsSeedCopyFailed, "error");
                }
            },
        }, TEXTS.adminRequestsSeedCopy));
    box.hidden = false;
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
            await reload(results.filter((r) => r.seed));
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

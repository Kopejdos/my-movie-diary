// Obrazovka admin panelu: nahlášené seznamy (#/admin/reports, V3.5.4).
// Seznam s otevřenými nahlášeními (důvody, poznámky) → Hide (vidí ho pak jen autor)
// nebo Dismiss (nahlášení se zamítnou). Skryté seznamy jsou níž a jdou zase zobrazit.

import { fetchReportedLists, moderateList } from "../lists.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, pill, toast, loadingView, errorView } from "../dom.js";
import { requireAdminView, adminHeader } from "./admin.js";

export async function adminReportsView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTabReports} · ${TEXTS.appName}`;
    mount(container, adminHeader("reports"), loadingView());

    let lists;
    try {
        lists = await fetchReportedLists();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, adminHeader("reports"),
            errorView(format("errorGeneric", error.message), () => adminReportsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const reload = () => adminReportsView(container, context);
    const open = lists.filter((l) => !l.hidden);
    const hidden = lists.filter((l) => l.hidden);

    mount(container,
        adminHeader("reports"),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminReportsTitle),
            h("span", { class: "muted" }, String(open.length))),
        open.length === 0
            ? h("p", { class: "empty-filter" }, TEXTS.adminReportsEmpty)
            : h("ol", { class: "admin-requests" }, open.map((list) => reportCard(list, reload))),
        hidden.length > 0
            ? [
                h("div", { class: "section-title" },
                    h("h2", {}, TEXTS.adminReportsHidden),
                    h("span", { class: "muted" }, String(hidden.length))),
                h("ol", { class: "admin-requests" }, hidden.map((list) => reportCard(list, reload))),
            ]
            : null);
}

/** Karta nahlášeného / skrytého seznamu. */
function reportCard(list, reload) {
    const counts = new Map();
    for (const reason of list.reasons ?? []) counts.set(reason, (counts.get(reason) ?? 0) + 1);

    const act = async (hide, buttons) => {
        buttons.forEach((b) => { b.disabled = true; });
        try {
            await moderateList(list.id, hide);
            toast(hide ? format("adminReportsHiddenToast", list.title) : format("adminReportsShownToast", list.title));
            reload();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            buttons.forEach((b) => { b.disabled = false; });
        }
    };
    const buttons = [];
    if (list.hidden) {
        const show = h("button", { class: "btn btn--small", type: "button", onClick: () => act(false, buttons) }, TEXTS.adminReportsShow);
        buttons.push(show);
    } else {
        const hide = h("button", { class: "btn btn--small btn--danger", type: "button", onClick: () => act(true, buttons) }, TEXTS.adminReportsHide);
        const dismiss = h("button", { class: "btn btn--small", type: "button", onClick: () => act(false, buttons) }, TEXTS.adminReportsDismiss);
        buttons.push(hide, dismiss);
    }

    return h("li", { class: `admin-request${list.hidden ? "" : " admin-request--collection"}` },
        h("div", { class: "admin-request__head" },
            h("a", { href: `#/list/${list.id}` }, h("strong", {}, list.title)),
            h("span", { class: "muted" }, `@${list.username}`),
            h("span", { class: "muted" }, movies(list.item_count)),
            list.open_reports > 0 ? h("span", { class: "pill pill--danger" }, format("adminReportsCount", list.open_reports)) : null),
        list.description ? h("p", { class: "req-card__note" }, list.description) : null,
        counts.size > 0
            ? h("div", { class: "pills" }, [...counts.entries()].map(([reason, n]) =>
                pill(`${TEXTS[`listReportReason_${reason}`] ?? reason}${n > 1 ? ` ×${n}` : ""}`)))
            : null,
        (list.notes ?? []).length > 0
            ? h("ul", { class: "admin-report-notes" }, list.notes.map((note) => h("li", {}, `“${note}”`)))
            : null,
        h("div", { class: "admin-request__actions" }, ...buttons));
}

// Obrazovka admin panelu: deník správců (#/admin/activity, V4.4.6).
// Kdo kdy co změnil – úpravy kolekcí, přijaté požadavky, uživatelé, odznaky, slova, překlady.
// Záznamy zapisuje Edge Function admin (akce přes server) a web (úpravy přímo v databázi,
// logAdmin v ../admin.js). Pořadí: nejnovější nahoře; hledání a filtr podle správce.

import { fetchAdminLog } from "../admin.js";
import { actionLabel, detailsSummary } from "../admin-log.js";
import { TEXTS, format, LOCALE } from "../texts.js";
import { h, mount, loadingView, errorView } from "../dom.js";
import { requireAdminView, adminHeader } from "./admin.js";
import { adminSearch, matchesQuery, highlight, noResults } from "./admin-search.js";

export async function adminActivityView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTabActivity} · ${TEXTS.appName}`;
    mount(container, adminHeader("activity"), loadingView());

    let entries;
    try {
        entries = await fetchAdminLog(300);
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, adminHeader("activity"),
            errorView(format("errorGeneric", error.message), () => adminActivityView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const admins = [...new Set(entries.map((e) => e.admin_name).filter(Boolean))].sort();
    const list = h("div");
    const search = adminSearch({
        key: "activity",
        placeholder: TEXTS.adminSearchActivity,
        filters: [{ value: "all", label: TEXTS.kindAll }, ...admins.map((name) => ({ value: name, label: `@${name}` }))],
        onChange: () => render(),
    });

    function render() {
        const query = search.query();
        const who = search.filter();
        const shown = entries.filter((e) => (who === "all" || e.admin_name === who)
            && matchesQuery(query, e.admin_name, actionLabel(e.action), e.target, detailsSummary(e.details)));
        search.setCount(shown.length, entries.length);
        mount(list, shown.length === 0
            ? (entries.length === 0 ? h("p", { class: "empty-filter" }, TEXTS.adminActivityEmpty) : noResults(() => search.reset()))
            : h("ol", { class: "admin-activity" }, shown.map((entry) => row(entry, query))));
    }
    render();

    mount(container,
        adminHeader("activity"),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminActivityTitle),
            h("span", { class: "muted" }, String(entries.length))),
        h("p", { class: "muted admin-team-hint" }, TEXTS.adminActivityHint),
        search.element,
        list,
    );
}

function row(entry, query) {
    const when = new Date(entry.created_at);
    const summary = detailsSummary(entry.details);
    return h("li", { class: "admin-activity__row" },
        h("time", { class: "admin-activity__time muted", datetime: entry.created_at },
            when.toLocaleString(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
        h("div", { class: "admin-activity__body" },
            h("div", {},
                h("strong", {}, entry.admin_name ? ["@", highlight(entry.admin_name, query)] : TEXTS.adminActivityDeleted),
                " · ",
                highlight(actionLabel(entry.action), query),
                entry.target ? [" · ", h("span", { class: "admin-activity__target" }, highlight(entry.target, query))] : null),
            summary ? h("span", { class: "muted admin-activity__details" }, summary) : null),
    );
}

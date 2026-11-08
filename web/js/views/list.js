// Obrazovka: vlastní seznam (#/list/:id, V3.5.3).
// Používá stránku kolekce (UniversePage) – filmy s počítadlem, watchlistem, hodnocením,
// Up next a postupem toho, kdo seznam otevřel. Navíc:
//   • v banneru autor, viditelnost a počet zobrazení,
//   • autor seznam upraví (název, popis, viditelnost, 1–3 kategorie), smaže,
//     přesouvá filmy šipkami a odebírá je (i z Coming soon),
//   • otevření cizího seznamu se započítá do zobrazení (jednou na uživatele),
//   • cizí seznam jde nahlásit (V3.5.4); skrytý seznam (správce) vidí jen autor – s upozorněním.

import { fetchMyFilmCounts, fetchWatchlistIds, fetchCategories } from "../data.js";
import { isSignedIn } from "../auth.js";
import { fetchMyRatings, fetchRatingStats } from "../ratings.js";
import {
    fetchList, updateList, deleteList, setListCategories, removeFromList, swapListItems, registerListView,
    reportList, listErrorText, visibilityLabel, VISIBILITIES, MAX_TITLE, MAX_DESCRIPTION, MAX_LIST_CATEGORIES,
    REPORT_REASONS,
} from "../lists.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, pill, toast, loadingView, errorView } from "../dom.js";
import { UniversePage } from "./universe.js";

export async function listView(container, context) {
    const { params, isCurrent } = context;
    mount(container, loadingView());
    const signedIn = isSignedIn();
    const id = Number(params.id);

    let list, counts, watchlist, ratings, categories;
    try {
        [list, counts, watchlist, ratings, categories] = await Promise.all([
            Number.isInteger(id) && id > 0 ? fetchList(id) : null,
            fetchMyFilmCounts(signedIn),
            fetchWatchlistIds(signedIn),
            fetchMyRatings(signedIn).catch(() => new Map()),
            fetchCategories(),
        ]);
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message), () => listView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    setAccent(null);
    if (!list) {
        mount(container,
            h("a", { class: "back-link", href: "#/" }, TEXTS.back),
            h("div", { class: "state" }, h("p", {}, TEXTS.listNotFound)));
        return;
    }

    document.title = `${list.title} · ${TEXTS.appName}`;
    const page = new ListPage(container, list, categories, counts, watchlist, signedIn, ratings, () => listView(container, context));
    page.render();

    // Zobrazení cizího seznamu se započítá; průměry hodnocení se doplní, až dorazí
    if (!list.is_mine) {
        registerListView(id).then((count) => { if (isCurrent() && count !== null) page.setViews(count); }).catch(() => {});
    }
    fetchRatingStats(list.entries.map((e) => e.film.tmdb_id))
        .then((stats) => { if (isCurrent()) page.setRatingStats(stats); })
        .catch(() => {});
}

/** Položka seznamu ve tvaru položky kolekce (to čeká UniversePage). */
function asItem(entry) {
    return {
        film: entry.film, release_order: entry.position, story_order: null, group_label: null,
        franchise: null, label: null, is_optional: false, note: entry.note, is_upcoming: entry.is_upcoming,
        position: entry.position,
    };
}

class ListPage extends UniversePage {
    constructor(container, list, allCategories, counts, watchlist, signedIn, ratings, reload) {
        const categories = allCategories.filter((c) => list.categories.includes(c.id));
        super(container, {
            id: list.id, name: list.title, description: list.description, color: null, kind: "list",
            categories, cover: null, items: list.items.map(asItem), upcoming: list.upcoming.map(asItem),
        }, counts, watchlist, signedIn, new URLSearchParams(), ratings);
        this.listInfo = list;
        this.allCategories = allCategories;
        this.reload = reload;
        this.mine = list.is_mine;
        this.showNotes = true;
        this.backHref = this.mine ? "#/lists" : `#/u/${encodeURIComponent(list.username)}`;
        this.backText = this.mine ? TEXTS.listBackMine : format("listBackUser", list.username);
        this.viewsPill = h("span", { class: "pill" }, format("listViews", list.view_count));
    }

    setViews(count) {
        this.listInfo.view_count = count;
        this.viewsPill.textContent = format("listViews", count);
    }

    bannerPills() {
        return [
            h("a", { class: "pill pill--link", href: `#/u/${encodeURIComponent(this.listInfo.username)}` },
                format("listBy", this.listInfo.username)),
            pill(visibilityLabel(this.listInfo.visibility)),
            this.viewsPill,
        ];
    }

    bannerExtras() {
        if (!this.mine) {
            // Nahlášení cizího seznamu (jen přihlášený)
            if (!this.signedIn) return null;
            this.reportButton = h("button", {
                class: "btn btn--small list-report", type: "button", disabled: Boolean(this.listInfo.reported),
                onClick: () => this.openReport(),
            }, this.listInfo.reported ? `⚑ ${TEXTS.listReported}` : `⚑ ${TEXTS.listReport}`);
            return h("div", { class: "list-owner" }, this.reportButton);
        }
        return h("div", { class: "list-owner" },
            this.listInfo.hidden ? h("p", { class: "notice list-hidden-note" }, `⚑ ${TEXTS.listHiddenNote}`) : null,
            h("button", { class: "btn btn--small", type: "button", onClick: () => this.openEditor() }, `✎ ${TEXTS.listEdit}`),
            h("span", { class: "hint" }, TEXTS.listOwnerHint));
    }

    /** Okno nahlášení: důvod + nepovinná poznámka. */
    openReport() {
        const opener = document.activeElement;
        let reason = REPORT_REASONS[0];
        const options = h("div", { class: "report-reasons", role: "radiogroup", "aria-label": TEXTS.listReportReason });
        const paint = () => mount(options, REPORT_REASONS.map((r) => h("label", { class: "report-reason" },
            h("input", { type: "radio", name: "report-reason", value: r, checked: r === reason, onChange: () => { reason = r; } }),
            ` ${TEXTS[`listReportReason_${r}`]}`)));
        paint();
        const note = h("textarea", { class: "admin-input list-editor__description", rows: 2, maxlength: 300, name: "report-note", placeholder: TEXTS.listReportNote });
        const send = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.listReportSend);
        const form = h("form", {
            class: "modal list-report-form", role: "dialog", "aria-modal": "true", "aria-labelledby": "list-report-title",
            onSubmit: async (event) => {
                event.preventDefault();
                send.disabled = true;
                try {
                    await reportList(this.listInfo.id, reason, note.value);
                    toast(TEXTS.listReportThanks);
                } catch (error) {
                    toast(error.code === "duplicate" ? TEXTS.listReportThanks : listErrorText(error), error.code === "duplicate" ? undefined : "error");
                    if (error.code !== "duplicate") {
                        send.disabled = false;
                        return;
                    }
                }
                this.listInfo.reported = true;
                if (this.reportButton) {
                    this.reportButton.disabled = true;
                    this.reportButton.textContent = `⚑ ${TEXTS.listReported}`;
                }
                close();
            },
        },
            h("div", { class: "modal__head" },
                h("div", {},
                    h("span", { class: "eyebrow" }, TEXTS.listReport),
                    h("h2", { id: "list-report-title", class: "modal__title" }, this.listInfo.title)),
                h("button", { class: "modal__close", type: "button", "aria-label": TEXTS.close, onClick: () => close() }, "×")),
            h("p", { class: "hint", style: "margin: 0" }, TEXTS.listReportHint),
            options,
            note,
            h("div", { class: "modal__foot" },
                h("button", { class: "btn", type: "button", onClick: () => close() }, TEXTS.cancel),
                send));
        const backdrop = h("div", { class: "modal-backdrop", onClick: (event) => { if (event.target === backdrop) close(); } }, form);
        const onKey = (event) => { if (event.key === "Escape") close(); };
        function close() {
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("hashchange", close);
            backdrop.remove();
            if (opener instanceof HTMLElement && document.body.contains(opener)) opener.focus();
        }
        document.body.append(backdrop);
        document.addEventListener("keydown", onKey);
        window.addEventListener("hashchange", close);
        options.querySelector("input")?.focus();
    }

    /** Prázdný seznam: místo „nic neodpovídá filtru“ nápověda, jak filmy přidat. */
    renderList() {
        if (this.universe.items.length === 0 && this.universe.upcoming.length === 0) {
            mount(this.list, h("li", { class: "empty-filter" }, this.mine ? TEXTS.listEmptyOwn : TEXTS.listEmpty));
            return;
        }
        super.renderList();
    }

    renderUpNext() {
        if (this.universe.items.length === 0) {
            mount(this.upNext);
            return;
        }
        super.renderUpNext();
    }

    /** Šipky a odebrání u filmu (jen autor). */
    rowExtras(row, item) {
        if (!this.mine) return null;
        const items = this.universe.items;
        const index = items.indexOf(item);
        return h("div", { class: "film__owner" },
            h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveUp, "aria-label": `${TEXTS.adminMoveUp}: ${item.film.title}`,
                disabled: index <= 0 || this.order !== "release",
                onClick: () => this.move(index, index - 1),
            }, "↑"),
            h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveDown, "aria-label": `${TEXTS.adminMoveDown}: ${item.film.title}`,
                disabled: index < 0 || index >= items.length - 1 || this.order !== "release",
                onClick: () => this.move(index, index + 1),
            }, "↓"),
            h("button", {
                class: "btn btn--small btn--danger", type: "button",
                onClick: () => this.remove(item),
            }, TEXTS.adminRemove));
    }

    /** Hvězdička na kartičce Coming soon + u autora křížek pro odebrání. */
    renderSoonStar(item) {
        const star = super.renderSoonStar(item);
        if (!this.mine) return star;
        star.classList.remove("soon-card__star");
        return h("span", { class: "soon-card__actions" },
            star,
            h("button", {
                class: "star-btn", type: "button", title: TEXTS.adminRemove, "aria-label": `${TEXTS.adminRemove}: ${item.film.title}`,
                onClick: () => this.remove(item),
            }, "×"));
    }

    async move(from, to) {
        const items = this.universe.items;
        const a = items[from];
        const b = items[to];
        if (!a || !b) return;
        try {
            await swapListItems(this.listInfo.id, a, b);
            [a.position, b.position] = [b.position, a.position];
            a.release_order = a.position;
            b.release_order = b.position;
            items.sort((x, y) => x.position - y.position);
            this.renderList();
            this.renderUpNext();
            this.rows.get(a.film.tmdb_id)?.querySelector(to < from ? ".film__owner .icon-btn" : ".film__owner .icon-btn:nth-child(2)")?.focus();
        } catch (error) {
            toast(listErrorText(error), "error");
        }
    }

    async remove(item) {
        try {
            await removeFromList(this.listInfo.id, item.film.tmdb_id);
            this.universe.items = this.universe.items.filter((i) => i !== item);
            this.universe.upcoming = this.universe.upcoming.filter((i) => i !== item);
            toast(format("listRemoved", item.film.title, this.listInfo.title));
            this.render();
        } catch (error) {
            toast(listErrorText(error), "error");
        }
    }

    /** Okno úprav: název, popis, viditelnost, kategorie (nejvýš 3), smazání seznamu. */
    openEditor() {
        const opener = document.activeElement;
        const info = this.listInfo;
        const title = h("input", { class: "admin-input", type: "text", maxlength: MAX_TITLE, required: true, value: info.title, name: "list-title" });
        const description = h("textarea", { class: "admin-input list-editor__description", maxlength: MAX_DESCRIPTION, rows: 3, name: "list-description" }, info.description ?? "");
        const visibility = h("div", { class: "segmented list-editor__visibility", role: "radiogroup", "aria-label": TEXTS.listVisibility });
        let chosenVisibility = info.visibility;
        const paintVisibility = () => mount(visibility, VISIBILITIES.map((v) => h("button", {
            class: `segmented__option${chosenVisibility === v ? " segmented__option--active" : ""}`,
            type: "button", role: "radio", "aria-checked": String(chosenVisibility === v),
            onClick: () => { chosenVisibility = v; paintVisibility(); },
        }, visibilityLabel(v))));
        paintVisibility();
        const visibilityHint = h("p", { class: "hint" }, TEXTS.listVisibilityHint);

        const chosen = new Set(info.categories);
        const boxes = this.allCategories.map((c) => {
            const input = h("input", { type: "checkbox", checked: chosen.has(c.id), value: String(c.id) });
            input.addEventListener("change", () => {
                if (input.checked) chosen.add(c.id); else chosen.delete(c.id);
                limitBoxes();
            });
            return { c, input };
        });
        const limitBoxes = () => boxes.forEach(({ input, c }) => { input.disabled = !chosen.has(c.id) && chosen.size >= MAX_LIST_CATEGORIES; });
        limitBoxes();

        const save = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminSave);
        const remove = h("button", {
            class: "btn btn--danger", type: "button",
            onClick: async () => {
                if (!window.confirm(format("listConfirmDelete", info.title))) return;
                try {
                    await deleteList(info.id);
                    close();
                    toast(format("listDeleted", info.title));
                    window.location.hash = "/lists";
                } catch (error) {
                    toast(listErrorText(error), "error");
                }
            },
        }, TEXTS.listDelete);

        const form = h("form", {
            class: "modal list-editor", role: "dialog", "aria-modal": "true", "aria-labelledby": "list-editor-title",
            onSubmit: async (event) => {
                event.preventDefault();
                if (!title.value.trim()) {
                    title.focus();
                    return;
                }
                save.disabled = true;
                try {
                    await updateList(info.id, { title: title.value, description: description.value, visibility: chosenVisibility });
                    const sameCategories = chosen.size === info.categories.length && info.categories.every((c) => chosen.has(c));
                    if (!sameCategories) await setListCategories(info.id, [...chosen]);
                    toast(TEXTS.adminSaved);
                    close();
                    this.reload();
                } catch (error) {
                    toast(listErrorText(error), "error");
                    save.disabled = false;
                }
            },
        },
            h("div", { class: "modal__head" },
                h("h2", { id: "list-editor-title", class: "modal__title" }, TEXTS.listEdit),
                h("button", { class: "modal__close", type: "button", "aria-label": TEXTS.close, onClick: () => close() }, "×")),
            h("label", { class: "list-editor__field" }, h("span", {}, TEXTS.listTitleLabel), title),
            h("label", { class: "list-editor__field" }, h("span", {}, TEXTS.listDescriptionLabel), description),
            h("div", { class: "list-editor__field" }, h("span", {}, TEXTS.listVisibility), visibility, visibilityHint),
            h("fieldset", { class: "list-editor__field list-editor__categories" },
                h("legend", {}, format("listCategoriesLabel", MAX_LIST_CATEGORIES)),
                boxes.map(({ c, input }) => h("label", { class: "list-editor__category" }, input, ` ${c.name}`))),
            h("div", { class: "modal__foot" }, remove, save));
        const backdrop = h("div", { class: "modal-backdrop", onClick: (event) => { if (event.target === backdrop) close(); } }, form);
        const onKey = (event) => { if (event.key === "Escape") close(); };
        function close() {
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("hashchange", close);
            backdrop.remove();
            if (opener instanceof HTMLElement && document.body.contains(opener)) opener.focus();
        }
        document.body.append(backdrop);
        document.addEventListener("keydown", onKey);
        window.addEventListener("hashchange", close);
        title.focus();
    }
}

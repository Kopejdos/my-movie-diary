// Obrazovky admin panelu: přehled univerz (#/admin), uživatelé (#/admin/users)
// a zakázaná slova v nickách (#/admin/words).
// V3.5.2.2: v každé záložce pole pro hledání (admin-search.js) – filtruje se okamžitě
// v prohlížeči; kolekce jdou najít i podle filmu, který obsahují.

import { getProfile, getUser, isSignedIn } from "../auth.js";
import {
    listUniversesForAdmin, createUniverse, deleteUniverse, swapUniverseOrder, slugify,
    listUsers, setUserAdmin, deleteUser, resetUsername,
    listBlockedWords, addBlockedWord, removeBlockedWord,
} from "../admin.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies, collections } from "../texts.js";
import { h, mount, pill, formatDate, toast, loadingView, errorView } from "../dom.js";
import { field } from "./login.js";
import { fetchSearchData } from "../data.js";
import { adminSearch, matchesQuery, highlight, noResults } from "./admin-search.js";
import { seriesUpdatesPanel } from "./admin-series.js";

/** Je přihlášený správce? Jinak ukáže hlášku a vrátí false. */
export function requireAdminView(container) {
    setAccent(null);
    if (isSignedIn() && getProfile()?.is_admin) return true;
    mount(container, h("div", { class: "state" },
        h("h1", {}, TEXTS.adminTitle),
        h("p", { class: "muted" }, TEXTS.adminOnly),
        h("a", { class: "btn", href: "#/" }, TEXTS.back),
    ));
    return false;
}

/** Nadpis a záložky admin panelu. */
export function adminHeader(active) {
    const tab = (href, label, key) =>
        h("a", { class: `tab${active === key ? " tab--active" : ""}`, href }, label);
    return h("section", { class: "page-header" },
        h("span", { class: "eyebrow" }, TEXTS.navAdmin),
        h("h1", {}, TEXTS.adminTitle),
        h("nav", { class: "tabs" },
            tab("#/admin", TEXTS.adminTabUniverses, "universes"),
            tab("#/admin/users", TEXTS.adminTabUsers, "users"),
            tab("#/admin/words", TEXTS.adminTabWords, "words"),
            tab("#/admin/requests", TEXTS.adminTabRequests, "requests"),
            tab("#/admin/reports", TEXTS.adminTabReports, "reports"),
        ),
    );
}

// =====================================================================
// Univerza
// =====================================================================

export async function adminUniversesView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTitle} · ${TEXTS.appName}`;
    mount(container, loadingView());

    let universes;
    try {
        universes = await listUniversesForAdmin();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message),
            () => adminUniversesView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const reload = () => adminUniversesView(container, context);

    // Filmy v kolekcích pro hledání podle filmu – načtou se, až když se začne hledat
    let filmsByUniverse = null;
    let filmsLoading = false;
    const loadFilms = () => {
        if (filmsByUniverse || filmsLoading) return;
        filmsLoading = true;
        fetchSearchData()
            .then(({ items }) => {
                filmsByUniverse = new Map();
                for (const item of items) {
                    if (!item.film) continue;
                    const list = filmsByUniverse.get(item.universe_id) ?? [];
                    list.push(item.film);
                    filmsByUniverse.set(item.universe_id, list);
                }
                if (context.isCurrent()) render();
            })
            .catch(() => { filmsLoading = false; });
    };

    const list = h("div");
    const search = adminSearch({
        key: "universes",
        placeholder: TEXTS.adminSearchUniverses,
        filters: [
            { value: "all", label: TEXTS.kindAll },
            { value: "series", label: TEXTS.kindSeries },
            { value: "studio", label: TEXTS.kindStudio },
            { value: "genre", label: TEXTS.kindGenre },
            { value: "path", label: TEXTS.kindPath },
        ],
        onChange: () => render(),
    });

    function render() {
        const query = search.query();
        if (query.length >= 2) loadFilms();
        const kind = search.filter();
        const shown = [];
        for (const universe of universes) {
            if (kind !== "all" && (universe.kind ?? "series") !== kind) continue;
            const categoryNames = (universe.categories ?? []).map((c) => c.name);
            if (matchesQuery(query, universe.name, universe.slug, ...categoryNames)) {
                shown.push({ universe, film: null });
                continue;
            }
            // Shoda podle filmu v kolekci (až po načtení filmů)
            const film = query.length >= 2
                ? (filmsByUniverse?.get(universe.id) ?? []).find((f) => matchesQuery(query, f.title, f.original_title))
                : null;
            if (film) shown.push({ universe, film });
        }
        search.setCount(shown.length, universes.length);
        const filtering = search.active();
        mount(list, shown.length === 0
            ? noResults(() => search.reset())
            : h("ol", { class: "admin-list" }, shown.map(({ universe, film }) => {
                const index = universes.indexOf(universe);
                // Při hledání se šipky schovají – přesun mezi vyfiltrovanými kolekcemi by mátl
                return universeRow(universe, universes[index - 1], universes[index + 1], reload, { query, film, filtering });
            })));
    }
    render();

    mount(container,
        adminHeader("universes"),
        seriesUpdatesPanel(),            // nové díly sérií (V3.5.2.3)
        newUniverseForm(),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabUniverses),
            h("span", { class: "muted" }, collections(universes.length)),
        ),
        search.element,
        list,
    );
}

/** Řádek univerza: barva, název, počet filmů, posun, úprava, smazání. */
function universeRow(universe, previous, next, reload, { query = "", film = null, filtering = false } = {}) {
    const count = universe.items?.[0]?.count ?? 0;

    async function run(action, message) {
        try {
            await action();
            if (message) toast(message);
            reload();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    }

    return h("li", { class: "admin-row" },
        h("span", { class: "color-dot", style: `background: ${universe.color ?? "var(--accent)"}` }),
        h("div", { class: "admin-row__info" },
            h("strong", {}, highlight(universe.name, query)),
            h("div", { class: "pills" },
                pill(universe.slug),
                pill(movies(count)),
                universe.kind && universe.kind !== "series"
                    ? pill(kindPillLabel(universe.kind), true)
                    : null,
                film ? h("span", { class: "pill pill--match" }, "🎬 ", highlight(film.title, query)) : null),
        ),
        h("div", { class: "admin-row__actions" },
            filtering ? null : h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveUp, "aria-label": TEXTS.adminMoveUp,
                disabled: !previous,
                onClick: () => run(() => swapUniverseOrder(universe, previous)),
            }, "↑"),
            filtering ? null : h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveDown, "aria-label": TEXTS.adminMoveDown,
                disabled: !next,
                onClick: () => run(() => swapUniverseOrder(universe, next)),
            }, "↓"),
            h("a", { class: "btn btn--small", href: `#/admin/collection/${universe.slug}` }, TEXTS.adminEdit),
            h("button", {
                class: "btn btn--small btn--danger", type: "button",
                onClick: () => {
                    if (!window.confirm(format("adminConfirmDeleteUniverse", universe.name))) return;
                    run(() => deleteUniverse(universe.id), TEXTS.adminDeleted);
                },
            }, TEXTS.adminDelete),
        ),
    );
}

/** Popisek druhu kolekce v řádku (série se neoznačuje). */
function kindPillLabel(kind) {
    return { studio: TEXTS.kindStudio, genre: TEXTS.kindGenre, path: TEXTS.kindPath }[kind] ?? kind;
}

/** Formulář pro nové univerzum (rozbalovací). */
function newUniverseForm() {
    const name = h("input", { type: "text", required: true, maxlength: 80 });
    const slug = h("input", { type: "text", required: true, maxlength: 40, pattern: "[a-z0-9-]{2,40}",
        spellcheck: "false", autocapitalize: "none" });
    const color = h("input", { type: "color", value: "#d4a75a", class: "color-input" });
    const description = h("input", { type: "text", maxlength: 200 });
    const error = h("p", { class: "form-error", role: "alert" });
    const submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminCreate);

    // Adresa se doplňuje z názvu, dokud ji správce nezmění ručně
    let slugEdited = false;
    name.addEventListener("input", () => { if (!slugEdited) slug.value = slugify(name.value); });
    slug.addEventListener("input", () => { slugEdited = true; });

    const form = h("form", { class: "admin-form", novalidate: true, onSubmit: handleSubmit },
        h("div", { class: "admin-form__grid" },
            field(TEXTS.adminName, name),
            field(TEXTS.adminSlug, slug, TEXTS.adminSlugHint),
            field(TEXTS.adminDescription, description),
            field(TEXTS.adminColor, color),
        ),
        error,
        submit,
    );

    return h("details", { class: "panel-details" },
        h("summary", {}, `+ ${TEXTS.adminNewUniverse}`),
        form,
    );

    async function handleSubmit(event) {
        event.preventDefault();
        error.textContent = "";
        if (!name.value.trim()) { error.textContent = TEXTS.adminNameRequired; return; }
        if (!/^[a-z0-9-]{2,40}$/.test(slug.value)) { error.textContent = TEXTS.adminSlugHint; return; }

        submit.disabled = true;
        try {
            const created = await createUniverse({
                name: name.value.trim(),
                slug: slug.value,
                description: description.value.trim(),
                color: color.value,
            });
            toast(TEXTS.adminCreated);
            window.location.hash = `/admin/collection/${created.slug}`;
        } catch (e) {
            error.textContent = e.message;
            submit.disabled = false;
        }
    }
}

// =====================================================================
// Uživatelé
// =====================================================================

export async function adminUsersView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTabUsers} · ${TEXTS.appName}`;
    mount(container, adminHeader("users"), loadingView());

    let users;
    try {
        users = await listUsers();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, adminHeader("users"), errorView(format("errorGeneric", error.message),
            () => adminUsersView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const reload = () => adminUsersView(container, context);
    const selfId = getUser()?.id;

    const list = h("div");
    const filters = [
        { value: "all", label: TEXTS.kindAll },
        { value: "admins", label: TEXTS.adminFilterAdmins },
        { value: "google", label: "Google" },
        { value: "email", label: "Email" },
    ];
    if (users.some((u) => u.flagged)) filters.push({ value: "flagged", label: `⚠ ${TEXTS.adminFlagged}` });
    const search = adminSearch({
        key: "users", placeholder: TEXTS.adminSearchUsers, filters, onChange: () => render(),
    });
    const byFilter = {
        all: () => true,
        admins: (u) => u.is_admin,
        google: (u) => u.provider === "google",
        email: (u) => u.provider !== "google",
        flagged: (u) => u.flagged,
    };

    function render() {
        const query = search.query();
        const test = byFilter[search.filter()] ?? byFilter.all;
        const shown = users.filter((u) => test(u) && matchesQuery(query, u.username, u.email));
        search.setCount(shown.length, users.length);
        mount(list, shown.length === 0
            ? noResults(() => search.reset())
            : h("ol", { class: "admin-list" }, shown.map((user) => userRow(user, user.id === selfId, reload, query))));
    }
    render();

    mount(container,
        adminHeader("users"),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabUsers),
            h("span", { class: "muted" }, format("adminUsersCount", users.length)),
        ),
        search.element,
        list,
    );
}

function userRow(user, isSelf, reload, query = "") {
    async function run(action, message) {
        try {
            await action();
            if (message) toast(message);
            reload();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
        }
    }

    const name = user.username ?? user.email ?? user.id;
    const avatarColor = user.is_admin ? "var(--accent)" : "var(--panel-hover)";

    return h("li", { class: "admin-row" },
        h("span", {
            class: "avatar",
            style: `background: ${avatarColor}; color: ${user.is_admin ? "var(--accent-ink)" : "var(--heading)"}`,
            "aria-hidden": "true",
        }, (user.username ?? "?").slice(0, 1).toUpperCase()),
        h("div", { class: "admin-row__info" },
            h("strong", {}, "@", highlight(user.username ?? "—", query)),
            h("span", { class: "muted admin-row__email" }, highlight(user.email ?? "", query)),
            h("div", { class: "pills" },
                user.flagged ? h("span", { class: "pill pill--danger", title: TEXTS.adminFlaggedHint }, `⚠ ${TEXTS.adminFlagged}`) : null,
                user.is_admin ? pill(TEXTS.profileAdmin, true) : null,
                isSelf ? pill(TEXTS.adminYou, true) : null,
                user.is_public ? pill(TEXTS.adminPublic) : null,
                pill(user.provider === "google" ? "Google" : "Email"),
                pill(format("adminWatches", user.watch_count)),
                pill(format("adminJoined", formatDate(user.created_at?.slice(0, 10)))),
            ),
        ),
        isSelf ? null : h("div", { class: "admin-row__actions" },
            h("button", {
                class: "btn btn--small", type: "button",
                onClick: () => run(() => setUserAdmin(user.id, !user.is_admin), TEXTS.adminSaved),
            }, user.is_admin ? TEXTS.adminRemoveAdmin : TEXTS.adminMakeAdmin),
            h("button", {
                class: `btn btn--small${user.flagged ? " btn--primary" : ""}`, type: "button",
                title: TEXTS.adminResetNicknameHint,
                onClick: () => {
                    if (!window.confirm(format("adminConfirmResetNickname", name))) return;
                    run(() => resetUsername(user.id), TEXTS.adminNicknameReset);
                },
            }, TEXTS.adminResetNickname),
            h("button", {
                class: "btn btn--small btn--danger", type: "button",
                onClick: () => {
                    if (!window.confirm(format("adminConfirmDeleteUser", name))) return;
                    run(() => deleteUser(user.id), TEXTS.adminDeleted);
                },
            }, TEXTS.adminDelete),
        ),
    );
}

// =====================================================================
// Zakázaná slova v nickách (V2.3)
// =====================================================================

export async function adminWordsView(container, context) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminTabWords} · ${TEXTS.appName}`;
    mount(container, adminHeader("words"), loadingView());

    let words;
    try {
        words = await listBlockedWords();
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, adminHeader("words"), errorView(format("errorGeneric", error.message),
            () => adminWordsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    const reload = () => adminWordsView(container, context);
    const word = h("input", {
        type: "text", class: "admin-input admin-input--grow", maxlength: 30, required: true,
        placeholder: TEXTS.adminWordPlaceholder, "aria-label": TEXTS.adminWord, spellcheck: "false",
    });
    const mode = h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminWordMode },
        h("option", { value: "contains" }, TEXTS.adminWordContains),
        h("option", { value: "exact" }, TEXTS.adminWordExact));
    const submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminAdd);

    async function add(event) {
        event.preventDefault();
        const value = word.value.trim().toLowerCase();
        if (!/^[a-z0-9]{2,30}$/.test(value)) {
            toast(TEXTS.adminWordInvalid, "error");
            return;
        }
        submit.disabled = true;
        try {
            await addBlockedWord(value, mode.value);
            toast(format("adminWordAdded", value));
            reload();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            submit.disabled = false;
        }
    }

    const row = (w, query) => h("li", { class: "admin-row admin-row--word" },
        h("div", { class: "admin-row__info" },
            h("strong", {}, highlight(w.word, query)),
            h("div", { class: "pills" },
                pill(w.match_mode === "exact" ? TEXTS.adminWordExact : TEXTS.adminWordContains))),
        h("div", { class: "admin-row__actions" },
            h("button", {
                class: "btn btn--small btn--danger", type: "button",
                onClick: async (event) => {
                    event.currentTarget.disabled = true;
                    try {
                        await removeBlockedWord(w.id);
                        toast(format("adminWordRemoved", w.word));
                        reload();
                    } catch (error) {
                        toast(format("errorGeneric", error.message), "error");
                    }
                },
            }, TEXTS.adminRemove)));

    // Hledání v seznamu (V3.5.2.2)
    const list = h("div");
    const search = adminSearch({
        key: "words", placeholder: TEXTS.adminSearchWords,
        filters: [
            { value: "all", label: TEXTS.kindAll },
            { value: "contains", label: TEXTS.adminWordContains },
            { value: "exact", label: TEXTS.adminWordExact },
        ],
        onChange: () => render(),
    });
    function render() {
        const query = search.query();
        const shown = words.filter((w) => (search.filter() === "all" || w.match_mode === search.filter()) && matchesQuery(query, w.word));
        search.setCount(shown.length, words.length);
        mount(list, shown.length === 0
            ? noResults(() => search.reset())
            : h("ul", { class: "admin-list admin-list--words" }, shown.map((w) => row(w, query))));
    }

    mount(container,
        adminHeader("words"),
        h("form", { class: "admin-form", onSubmit: add },
            h("h2", { class: "admin-form__title" }, TEXTS.adminWordsTitle),
            h("p", { class: "hint", style: "margin: 0" }, TEXTS.adminWordsHint),
            h("div", { class: "admin-search" }, word, mode, submit),
        ),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabWords),
            h("span", { class: "muted" }, String(words.length))),
        search.element,
        list,
    );
    render();
}

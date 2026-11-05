// Obrazovky admin panelu: přehled univerz (#/admin) a uživatelé (#/admin/users).

import { getProfile, getUser, isSignedIn } from "../auth.js";
import {
    listUniversesForAdmin, createUniverse, deleteUniverse, swapUniverseOrder, slugify,
    listUsers, setUserAdmin, deleteUser,
} from "../admin.js";
import { setAccent } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, pill, formatDate, toast, loadingView, errorView } from "../dom.js";
import { field } from "./login.js";

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

    mount(container,
        adminHeader("universes"),
        newUniverseForm(),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabUniverses),
            h("span", { class: "muted" }, format("universesCount", universes.length)),
        ),
        h("ol", { class: "admin-list" },
            universes.map((universe, index) => universeRow(universe, universes[index - 1], universes[index + 1], reload)),
        ),
    );
}

/** Řádek univerza: barva, název, počet filmů, posun, úprava, smazání. */
function universeRow(universe, previous, next, reload) {
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
            h("strong", {}, universe.name),
            h("div", { class: "pills" }, pill(universe.slug), pill(movies(count))),
        ),
        h("div", { class: "admin-row__actions" },
            h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveUp, "aria-label": TEXTS.adminMoveUp,
                disabled: !previous,
                onClick: () => run(() => swapUniverseOrder(universe, previous)),
            }, "↑"),
            h("button", {
                class: "icon-btn", type: "button", title: TEXTS.adminMoveDown, "aria-label": TEXTS.adminMoveDown,
                disabled: !next,
                onClick: () => run(() => swapUniverseOrder(universe, next)),
            }, "↓"),
            h("a", { class: "btn btn--small", href: `#/admin/universe/${universe.slug}` }, TEXTS.adminEdit),
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
            window.location.hash = `/admin/universe/${created.slug}`;
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

    mount(container,
        adminHeader("users"),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.adminTabUsers),
            h("span", { class: "muted" }, format("adminUsersCount", users.length)),
        ),
        h("ol", { class: "admin-list" }, users.map((user) => userRow(user, user.id === selfId, reload))),
    );
}

function userRow(user, isSelf, reload) {
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
            h("strong", {}, `@${user.username ?? "—"}`),
            h("span", { class: "muted admin-row__email" }, user.email ?? ""),
            h("div", { class: "pills" },
                user.is_admin ? pill(TEXTS.profileAdmin, true) : null,
                isSelf ? pill(TEXTS.adminYou, true) : null,
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
                class: "btn btn--small btn--danger", type: "button",
                onClick: () => {
                    if (!window.confirm(format("adminConfirmDeleteUser", name))) return;
                    run(() => deleteUser(user.id), TEXTS.adminDeleted);
                },
            }, TEXTS.adminDelete),
        ),
    );
}

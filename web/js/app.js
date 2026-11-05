// Vstupní bod webu: přihlášení, hlavička a router.

import { initAuth, onAuthChange, getUser, getProfile, signOut, hasGeneratedUsername } from "./auth.js";
import { addRoute, setNotFound, startRouter, render, navigate, currentPath } from "./router.js";
import { TEXTS, format } from "./texts.js";
import { h, mount, toast, loadingView } from "./dom.js";
import { currentTheme, toggleTheme } from "./theme.js";
import { initPwa, canInstall, promptInstall, onInstallChange, onUpdateAvailable } from "./pwa.js";
import { APP_VERSION, APP_UPDATED } from "./config.js";
import { refreshAchievements, tierLabel } from "./achievements.js";
import { warmOverview, invalidateProgress } from "./data.js";

// Přehled a detail kolekce se načítají hned (první, co uživatel uvidí);
// ostatní obrazovky až při prvním otevření – méně JavaScriptu při startu (V2.1.1)
import { universesView } from "./views/universes.js";
import { universeView } from "./views/universe.js";
import { notFoundView } from "./views/not-found.js";

/** Obrazovka načtená až při prvním použití (dynamický import). */
function lazy(load, name) {
    return async (container, context) => {
        mount(container, loadingView());
        const module = await load();
        return module[name](container, context);
    };
}

const loginView = lazy(() => import("./views/login.js"), "loginView");
const registerView = lazy(() => import("./views/register.js"), "registerView");
const profileView = lazy(() => import("./views/profile.js"), "profileView");
const watchlistView = lazy(() => import("./views/watchlist.js"), "watchlistView");
const searchView = lazy(() => import("./views/search.js"), "searchView");
const statsView = lazy(() => import("./views/stats.js"), "statsView");
const publicProfileView = lazy(() => import("./views/public-profile.js"), "publicProfileView");
const adminUniversesView = lazy(() => import("./views/admin.js"), "adminUniversesView");
const adminUsersView = lazy(() => import("./views/admin.js"), "adminUsersView");
const adminWordsView = lazy(() => import("./views/admin.js"), "adminWordsView");
const adminUniverseView = lazy(() => import("./views/admin-universe.js"), "adminUniverseView");
const aboutView = lazy(() => import("./views/about.js"), "aboutView");

// Data přehledu se začnou stahovat hned – souběžně s přihlášením a profilem
if (currentPath() === "/") warmOverview();

// Cesty v aplikaci
addRoute("/", universesView);
addRoute("/collection/:slug", universeView);
// Staré odkazy z doby „universes“ (do V1.1) se přesměrují na novou adresu.
// replace = stará adresa nezůstane v historii (tlačítko Zpět by jinak cyklilo)
const redirect = (path) => () => window.location.replace(`#${path}`);
addRoute("/universe/:slug", (container, { params }) => redirect(`/collection/${params.slug}`)());
addRoute("/login", loginView);
addRoute("/register", registerView);
addRoute("/profile", profileView);
addRoute("/watchlist", watchlistView);
addRoute("/search", searchView);
addRoute("/stats", statsView);
addRoute("/u/:username", publicProfileView);
addRoute("/about", aboutView);
addRoute("/admin", adminUniversesView);
addRoute("/admin/users", adminUsersView);
addRoute("/admin/words", adminWordsView);
addRoute("/admin/collection/:slug", adminUniverseView);
addRoute("/admin/universe/:slug", (container, { params }) => redirect(`/admin/collection/${params.slug}`)());
setNotFound(notFoundView);

const header = document.getElementById("site-header");
let level = null;                 // úroveň přihlášeného uživatele (odznak v hlavičce), viz refreshProgress()
const main = document.getElementById("app");

/** Hlavička: logo, navigace a přihlášený uživatel. */
function renderHeader() {
    const user = getUser();
    const profile = getProfile();
    const path = currentPath();

    const navLink = (href, label, active, extraClass = "") =>
        h("a", { class: `nav__link${active ? " nav__link--active" : ""}${extraClass}`, href }, label);

    mount(header,
        h("div", { class: "header__inner" },
            h("a", { class: "brand", href: "#/" },
                h("span", { class: "brand__icon", "aria-hidden": "true" }, "🎬"),
                h("span", { class: "brand__name" }, TEXTS.appName),
            ),
            h("nav", { class: "nav" },
                canInstall()
                    ? h("button", {
                        class: "nav__link nav__button nav__install", type: "button",
                        onClick: async () => {
                            if (await promptInstall()) toast(TEXTS.installThanks);
                        },
                    }, `⤓ ${TEXTS.install}`)
                    : null,
                themeToggle(),
                navLink("#/", TEXTS.navUniverses, path === "/" || path.startsWith("/collection/"), " nav__link--home"),
                h("a", {
                    class: `nav__link nav__search${path === "/search" ? " nav__link--active" : ""}`,
                    href: "#/search",
                    title: TEXTS.searchShortcut,
                    "aria-label": TEXTS.navSearch,
                }, h("span", { class: "search-icon", "aria-hidden": "true" }), h("span", { class: "nav__label" }, TEXTS.navSearch)),
                user
                    ? h("a", {
                        class: `nav__link${path === "/watchlist" ? " nav__link--active" : ""}`,
                        href: "#/watchlist",
                        title: TEXTS.navWatchlist,
                    }, h("span", { "aria-hidden": "true" }, "★ "), h("span", { class: "nav__label" }, TEXTS.navWatchlist))
                    : null,
                user && profile?.is_admin
                    ? navLink("#/admin", TEXTS.navAdmin, path.startsWith("/admin"))
                    : null,
                user
                    ? [
                        h("a", {
                            class: `nav__user${path === "/profile" || path === "/stats" ? " nav__user--active" : ""}`,
                            href: "#/profile",
                            title: TEXTS.navProfile,
                        },
                            level ? h("span", { class: "nav__level", title: `${level.title} · ${level.xp} XP` }, String(level.level)) : null,
                            h("span", { class: "nav__nick" }, profile ? `@${profile.username}` : "")),
                        h("button", { class: "nav__link nav__button nav__signout", type: "button", onClick: handleSignOut },
                            TEXTS.navSignOut),
                    ]
                    : [
                        navLink("#/login", TEXTS.navSignIn, path === "/login"),
                        h("a", { class: "btn btn--primary btn--small", href: "#/register" }, TEXTS.navRegister),
                    ],
            ),
        ),
    );
}

/** Kulaté tlačítko ☀ / ☾ – přepne světlý a tmavý režim. */
function themeToggle() {
    const dark = currentTheme() === "dark";
    return h("button", {
        class: "theme-toggle",
        type: "button",
        title: dark ? TEXTS.themeToLight : TEXTS.themeToDark,
        "aria-label": dark ? TEXTS.themeToLight : TEXTS.themeToDark,
        onClick: () => {
            toggleTheme();
            renderHeader();
        },
    }, dark ? "☀" : "☾");
}

async function handleSignOut() {
    try {
        await signOut();
        toast(TEXTS.signedOut);
        navigate("/");
    } catch (error) {
        toast(format("errorGeneric", error.message), "error");
    }
}

/** Reakce na přihlášení / odhlášení: překreslit hlavičku a obrazovku. */
let lastUserId;
let routerStarted = false;

onAuthChange(({ user, profile }) => {
    renderHeader();
    if (!routerStarted) return;

    const userId = user?.id ?? null;
    if (userId === lastUserId) return;   // jen obnova tokenu nebo načtení profilu
    const signedInNow = userId !== null && lastUserId === null;
    lastUserId = userId;
    invalidateProgress();          // postup patří jinému (nebo žádnému) uživateli
    if (!userId) level = null;     // po odhlášení zmizí odznak úrovně

    if (signedInNow) {
        refreshProgress({ announce: false });
        // Uživatel z Google má zatím automatický nickname → nabídnout volbu vlastního
        if (hasGeneratedUsername()) {
            navigate("/profile");
            return;
        }
        toast(format("welcome", profile?.username ?? ""));
        const path = currentPath();
        if (path === "/login" || path === "/register") {
            navigate("/");
            return;
        }
    }
    render();
});

// Hlavička se zvýrazněním aktuální sekce i po přechodu na jinou stránku
document.addEventListener("route-rendered", renderHeader);

// Aplikace na plochu: service worker, tlačítko Install, stav připojení
initPwa();
onInstallChange(() => {
    renderHeader();
    if (currentPath() === "/profile") render();
});
onUpdateAvailable(() => toast(TEXTS.updateAvailable, "info", {
    label: TEXTS.updateReload,
    onClick: () => window.location.reload(),
}));
window.addEventListener("offline", () => toast(TEXTS.offline, "error"));
window.addEventListener("online", () => toast(TEXTS.online));

// Achievementy a úroveň (XP): spočítají se po přihlášení a po každé změně
// zhlédnutí (s malým zpožděním, ať se víc kliknutí spojí do jedné kontroly)
let progressTimer = null;

async function refreshProgress({ announce }) {
    const user = getUser();
    if (!user) return;
    try {
        const { result, fresh } = await refreshAchievements(user.id);
        if (announce) {
            for (const key of fresh) toast(achievementMessage(key, result), "achievement");
            if (level && result.level.level > level.level) {
                toast(format("levelUp", result.level.level, result.level.title), "achievement");
            }
        }
        level = result.level;
        renderHeader();
    } catch (error) {
        console.warn("Progress check failed", error);
    }
}

/** Spustí úlohu po `delay` ms, až bude prohlížeč volný (bez requestIdleCallback hned po delay). */
function whenIdle(task, delay) {
    setTimeout(() => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(task, { timeout: 3000 });
        else task();
    }, delay);
}

function scheduleProgressCheck() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => refreshProgress({ announce: true }), 1200);
}

/** Text oznámení podle klíče („collector:50“, „fan-horror:3“, „complete:mcu“). */
function achievementMessage(key, result) {
    if (key.startsWith("complete:")) {
        const done = result.completed.find((c) => `complete:${c.universe.slug}` === key);
        return format("achievementCollectionDone", done?.universe.name ?? key.slice(9));
    }
    const [cardKey, threshold] = key.split(":");
    const card = result.cards.find((c) => c.key === cardKey);
    const names = {
        first: TEXTS.achFirstName, collector: TEXTS.achCollectorName, "screen-time": TEXTS.achScreenTimeName,
        marathon: TEXTS.achMarathonName, rewatcher: TEXTS.achRewatcherName, completionist: TEXTS.achCompletionistName,
        pathfinder: TEXTS.achPathfinderName,
    };
    const name = cardKey.startsWith("fan-") ? format("achFanName", card?.category?.name ?? "") : names[cardKey] ?? cardKey;
    const index = card?.tiers.findIndex((t) => String(t.threshold) === threshold) ?? -1;
    const label = card ? tierLabel(index, card.tiers.length) : null;
    return format("achievementUnlocked", label ? `${name} (${label})` : name);
}

document.addEventListener("watches-changed", scheduleProgressCheck);

// Klávesa „/“ kdekoli (mimo pole pro psaní) otevře hledání
document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    event.preventDefault();
    const field = document.querySelector(".search-box__input");
    if (field) field.focus(); else navigate("/search");
});

// Verze a měsíc poslední aktualizace v patičce
const versionLabel = document.getElementById("app-version");
if (versionLabel) versionLabel.textContent = `${APP_VERSION} · ${APP_UPDATED}`;

// Start
renderHeader();
await initAuth();
lastUserId = getUser()?.id ?? null;
routerStarted = true;
// Achievementy a level se spočítají až po prvním vykreslení, ve chvíli, kdy je
// prohlížeč volný – nezdržují start ani první interakci (V2.1.1)
if (getUser()) whenIdle(() => refreshProgress({ announce: false }), 2500);
if (getUser() && hasGeneratedUsername()) {
    window.location.hash = "/profile";
}
await startRouter(main);

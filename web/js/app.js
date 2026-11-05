// Vstupní bod webu: přihlášení, hlavička a router.

import { initAuth, onAuthChange, getUser, getProfile, signOut, hasGeneratedUsername } from "./auth.js";
import { addRoute, setNotFound, startRouter, render, navigate, currentPath } from "./router.js";
import { TEXTS, format } from "./texts.js";
import { h, mount, toast } from "./dom.js";
import { currentTheme, toggleTheme } from "./theme.js";
import { initPwa, canInstall, promptInstall, onInstallChange, onUpdateAvailable } from "./pwa.js";
import { APP_VERSION, APP_UPDATED } from "./config.js";
import { refreshAchievements, tierLabel } from "./achievements.js";

import { universesView } from "./views/universes.js";
import { universeView } from "./views/universe.js";
import { loginView } from "./views/login.js";
import { registerView } from "./views/register.js";
import { profileView } from "./views/profile.js";
import { watchlistView } from "./views/watchlist.js";
import { adminUniversesView, adminUsersView } from "./views/admin.js";
import { adminUniverseView } from "./views/admin-universe.js";
import { notFoundView } from "./views/not-found.js";

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
addRoute("/admin", adminUniversesView);
addRoute("/admin/users", adminUsersView);
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
                            class: `nav__user${path === "/profile" ? " nav__user--active" : ""}`,
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
    };
    const name = cardKey.startsWith("fan-") ? format("achFanName", card?.category?.name ?? "") : names[cardKey] ?? cardKey;
    const index = card?.tiers.findIndex((t) => String(t.threshold) === threshold) ?? -1;
    const label = card ? tierLabel(index, card.tiers.length) : null;
    return format("achievementUnlocked", label ? `${name} (${label})` : name);
}

document.addEventListener("watches-changed", scheduleProgressCheck);

// Verze a měsíc poslední aktualizace v patičce
const versionLabel = document.getElementById("app-version");
if (versionLabel) versionLabel.textContent = `${APP_VERSION} · ${APP_UPDATED}`;

// Start
renderHeader();
await initAuth();
lastUserId = getUser()?.id ?? null;
routerStarted = true;
// Achievementy a level se spočítají až po prvním vykreslení – nezdržují start
if (getUser()) setTimeout(() => refreshProgress({ announce: false }), 1500);
if (getUser() && hasGeneratedUsername()) {
    window.location.hash = "/profile";
}
await startRouter(main);

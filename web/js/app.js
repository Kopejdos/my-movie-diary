// Vstupní bod webu: přihlášení, hlavička a router.

import { initAuth, onAuthChange, getUser, getProfile, signOut, hasGeneratedUsername } from "./auth.js";
import { addRoute, setNotFound, startRouter, render, navigate, currentPath } from "./router.js";
import { TEXTS, format } from "./texts.js";
import { h, mount, toast } from "./dom.js";
import { currentTheme, toggleTheme } from "./theme.js";
import { initPwa, canInstall, promptInstall, onInstallChange } from "./pwa.js";
import { APP_VERSION, APP_UPDATED } from "./config.js";

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
                        }, profile ? `@${profile.username}` : ""),
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

    if (signedInNow) {
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
window.addEventListener("offline", () => toast(TEXTS.offline, "error"));
window.addEventListener("online", () => toast(TEXTS.online));

// Verze a měsíc poslední aktualizace v patičce
const versionLabel = document.getElementById("app-version");
if (versionLabel) versionLabel.textContent = `${APP_VERSION} · ${APP_UPDATED}`;

// Start
renderHeader();
await initAuth();
lastUserId = getUser()?.id ?? null;
routerStarted = true;
if (getUser() && hasGeneratedUsername()) {
    window.location.hash = "/profile";
}
await startRouter(main);

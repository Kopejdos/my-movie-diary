// Vstupní bod webu: přihlášení, hlavička a router.

import { initAuth, onAuthChange, getUser, getProfile, signOut } from "./auth.js";
import { addRoute, setNotFound, startRouter, render, navigate, currentPath } from "./router.js";
import { TEXTS, format } from "./texts.js";
import { h, mount, toast } from "./dom.js";

import { universesView } from "./views/universes.js";
import { universeView } from "./views/universe.js";
import { loginView } from "./views/login.js";
import { registerView } from "./views/register.js";
import { notFoundView } from "./views/not-found.js";

// Cesty v aplikaci
addRoute("/", universesView);
addRoute("/universe/:slug", universeView);
addRoute("/login", loginView);
addRoute("/register", registerView);
setNotFound(notFoundView);

const header = document.getElementById("site-header");
const main = document.getElementById("app");

/** Hlavička: logo, navigace a přihlášený uživatel. */
function renderHeader() {
    const user = getUser();
    const profile = getProfile();
    const path = currentPath();

    const navLink = (href, label, active) =>
        h("a", { class: `nav__link${active ? " nav__link--active" : ""}`, href }, label);

    mount(header,
        h("div", { class: "header__inner" },
            h("a", { class: "brand", href: "#/" },
                h("span", { class: "brand__icon", "aria-hidden": "true" }, "🎬"),
                h("span", { class: "brand__name" }, TEXTS.appName),
            ),
            h("nav", { class: "nav" },
                navLink("#/", TEXTS.navUniverses, path === "/" || path.startsWith("/universe")),
                user
                    ? [
                        h("span", { class: "nav__user" }, profile ? `@${profile.username}` : ""),
                        h("button", { class: "nav__link nav__button", type: "button", onClick: handleSignOut },
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

// Start
renderHeader();
await initAuth();
lastUserId = getUser()?.id ?? null;
routerStarted = true;
await startRouter(main);

// Jednoduchý router podle části adresy za # (např. #/collection/mcu).
// GitHub Pages neumí přesměrovat neznámé adresy na index.html, s hashem to není potřeba.

const routes = [];
let notFoundView = null;
let container = null;
let renderCounter = 0;

/** Zaregistruje cestu: addRoute("/collection/:slug", view). */
export function addRoute(path, view) {
    const names = [];
    const pattern = new RegExp(
        "^" + path.replace(/:([a-zA-Z]+)/g, (_, name) => {
            names.push(name);
            return "([^/]+)";
        }) + "$",
    );
    routes.push({ pattern, names, view });
}

export function setNotFound(view) {
    notFoundView = view;
}

/** Aktuální cesta bez # a bez parametrů (prázdná = "/"). */
export function currentPath() {
    const hash = window.location.hash.replace(/^#/, "").split("?")[0];
    return hash === "" ? "/" : hash;
}

/** Parametry za otazníkem: #/search?q=alien → URLSearchParams { q: "alien" }. */
export function currentQuery() {
    const hash = window.location.hash;
    const index = hash.indexOf("?");
    return new URLSearchParams(index === -1 ? "" : hash.slice(index + 1));
}

/**
 * Změní parametry v adrese bez nového vykreslení a bez záznamu v historii
 * (psaní do hledání nemá zaplnit tlačítko Zpět).
 */
export function replaceQuery(params) {
    const query = new URLSearchParams(params).toString();
    window.history.replaceState(window.history.state, "", `#${currentPath()}${query ? `?${query}` : ""}`);
}

/** Přejde na jinou cestu (může obsahovat i ?parametry). */
export function navigate(path) {
    const current = window.location.hash.replace(/^#/, "") || "/";
    if (current === path) {
        render();
    } else {
        window.location.hash = path;
    }
}

/**
 * Vykreslí obrazovku podle aktuální adresy.
 * isCurrent() hlídá, aby pomalý dotaz staré obrazovky nepřepsal novou.
 */
export async function render() {
    const path = currentPath();
    const renderId = ++renderCounter;
    const isCurrent = () => renderId === renderCounter;

    for (const route of routes) {
        const match = path.match(route.pattern);
        if (!match) continue;
        const params = Object.fromEntries(
            route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]),
        );
        await route.view(container, { params, query: currentQuery(), isCurrent });
        afterRender();
        return;
    }
    if (notFoundView) await notFoundView(container, { params: {}, query: currentQuery(), isCurrent });
    afterRender();
}

function afterRender() {
    window.scrollTo({ top: 0 });
    document.dispatchEvent(new CustomEvent("route-rendered", { detail: currentPath() }));
}

/** Spustí router v daném prvku stránky. */
export function startRouter(target) {
    container = target;
    window.addEventListener("hashchange", render);
    return render();
}

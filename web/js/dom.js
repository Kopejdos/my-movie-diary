// Pomocné funkce pro práci s DOM.
// Obsah se vkládá přes textContent, nikdy přes innerHTML – názvy filmů
// ani nicky uživatelů tak nemůžou do stránky podstrčit kód.

import { TMDB_IMAGE_ROOT, POSTER_SIZES, BACKDROP_SIZES } from "./config.js";
import { TEXTS } from "./texts.js";

/**
 * Vytvoří prvek: h("a", { class: "btn", href: "#/" }, "Text", jinyPrvek).
 * Atributy začínající "on" jsou posluchače událostí (onClick → click).
 */
export function h(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);

    for (const [name, value] of Object.entries(attributes ?? {})) {
        if (value === null || value === undefined || value === false) continue;
        if (name.startsWith("on") && typeof value === "function") {
            element.addEventListener(name.slice(2).toLowerCase(), value);
        } else if (name === "class") {
            element.className = value;
        } else if (value === true) {
            element.setAttribute(name, "");
        } else {
            element.setAttribute(name, String(value));
        }
    }

    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
}

/** Vyprázdní prvek a vloží do něj nový obsah. */
export function mount(container, ...children) {
    container.replaceChildren(...children.flat().filter(Boolean));
}

/** Plná adresa plakátu v dané velikosti ("tiny" / "small" / "large"), nebo null. */
export function posterUrl(posterPath, size = "large") {
    return posterPath ? TMDB_IMAGE_ROOT + (POSTER_SIZES[size] ?? POSTER_SIZES.large) + posterPath : null;
}

/**
 * Plná adresa širokoúhlého záběru (banner), nebo null.
 * Telefon (do ~1000 skutečných pixelů šířky) dostane menší verzi.
 */
export function backdropUrl(backdropPath) {
    if (!backdropPath) return null;
    const pixels = window.innerWidth * (window.devicePixelRatio || 1);
    return TMDB_IMAGE_ROOT + (pixels <= 1000 ? BACKDROP_SIZES.phone : BACKDROP_SIZES.desktop) + backdropPath;
}

/** Pilulka s údajem (rok, délka…). */
export function pill(text, accent = false) {
    return text ? h("span", { class: `pill${accent ? " pill--accent" : ""}` }, text) : null;
}

/**
 * Obrázek plakátu, nebo zástupný blok s názvem filmu.
 * eager = plakát je vidět hned po načtení (první řada) → stáhne se přednostně.
 * size = "tiny" / "small" / "large" (viz POSTER_SIZES v config.js).
 */
export function poster(posterPath, title, className = "poster", eager = false, size = "large") {
    const url = posterUrl(posterPath, size);
    if (!url) return h("div", { class: `${className} poster--empty` }, title);
    return h("img", {
        class: className, src: url, alt: title, decoding: "async",
        loading: eager ? "eager" : "lazy",
        fetchpriority: eager ? "high" : null,
    });
}

/** Rok z data "2008-05-02" → "2008". */
export function yearOf(date) {
    return date ? date.slice(0, 4) : "";
}

/** Datum "2026-11-05" → "5 Nov 2026". */
export function formatDate(date) {
    if (!date) return "";
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
    });
}

/**
 * Krátké oznámení dole na obrazovce.
 * action = { label, onClick } → tlačítko v oznámení; takové oznámení samo nezmizí.
 */
export function toast(message, type = "info", action = null) {
    const container = document.getElementById("toasts");
    if (!container) return;
    const item = h("div", { class: `toast toast--${type}${action ? " toast--action" : ""}`, role: "status" },
        h("span", {}, message),
        action ? h("button", { class: "toast__button", type: "button", onClick: action.onClick }, action.label) : null,
    );
    container.append(item);
    // Nejvýš 4 oznámení najednou – nejstarší ustoupí
    while (container.children.length > 4) container.firstElementChild.remove();
    if (action) return;                                      // s tlačítkem zůstává, dokud se neklikne
    const duration = type === "achievement" ? 5000 : 3200;   // achievement si zaslouží delší pozornost
    setTimeout(() => item.classList.add("toast--hide"), duration);
    setTimeout(() => item.remove(), duration + 400);
}

/** Stav načítání. */
export function loadingView() {
    return h("div", { class: "state" }, h("div", { class: "spinner", "aria-hidden": "true" }));
}

/** Chybový stav s tlačítkem pro nový pokus. */
export function errorView(message, onRetry) {
    return h("div", { class: "state state--error" },
        h("p", {}, message),
        onRetry ? h("button", { class: "btn", type: "button", onClick: onRetry }, TEXTS.retry) : null,
    );
}

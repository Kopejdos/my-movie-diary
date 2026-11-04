// Pomocné funkce pro práci s DOM.
// Obsah se vkládá přes textContent, nikdy přes innerHTML – názvy filmů
// ani nicky uživatelů tak nemůžou do stránky podstrčit kód.

import { TMDB_IMAGE_BASE } from "./config.js";
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

/** Plná adresa plakátu, nebo null. */
export function posterUrl(posterPath) {
    return posterPath ? TMDB_IMAGE_BASE + posterPath : null;
}

/** Obrázek plakátu, nebo zástupný blok s názvem filmu. */
export function poster(posterPath, title, className = "poster") {
    const url = posterUrl(posterPath);
    if (!url) return h("div", { class: `${className} poster--empty` }, title);
    return h("img", { class: className, src: url, alt: title, loading: "lazy" });
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

/** Krátké oznámení dole na obrazovce. */
export function toast(message, type = "info") {
    const container = document.getElementById("toasts");
    if (!container) return;
    const item = h("div", { class: `toast toast--${type}`, role: "status" }, message);
    container.append(item);
    setTimeout(() => item.classList.add("toast--hide"), 3200);
    setTimeout(() => item.remove(), 3600);
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

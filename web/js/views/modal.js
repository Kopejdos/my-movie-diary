// Okno nad stránkou (V3.6.2 – společné pro výběr seznamu, úpravu a nahlášení seznamu).
// Zavírá se Esc, kliknutím vedle, křížkem i změnou adresy; fokus se pak vrátí na prvek,
// který okno otevřel. S onSubmit je okno formulář (Enter odešle).

import { TEXTS } from "../texts.js";
import { h } from "../dom.js";

let counter = 0;

/**
 * Otevře okno.
 *   eyebrow   – malý nadpis nad titulkem (nepovinný)
 *   title     – titulek okna
 *   className – třída navíc (list-picker, list-editor…)
 *   onSubmit  – (event) => … ; okno je pak <form>
 *   content   – obsah pod hlavičkou (pole prvků)
 *   focus     – prvek, který dostane fokus (jinak křížek)
 * Vrací { close, root }.
 */
export function openModal({ eyebrow = null, title, className = "", onSubmit = null, content = [], focus = null }) {
    const opener = document.activeElement;
    const titleId = `modal-title-${++counter}`;
    const closeButton = h("button", { class: "modal__close", type: "button", "aria-label": TEXTS.close, onClick: () => close() }, "×");

    const root = h(onSubmit ? "form" : "div", {
        class: `modal ${className}`.trim(), role: "dialog", "aria-modal": "true", "aria-labelledby": titleId,
        onSubmit: onSubmit ? (event) => { event.preventDefault(); onSubmit(event); } : null,
    },
        h("div", { class: "modal__head" },
            h("div", {},
                eyebrow ? h("span", { class: "eyebrow" }, eyebrow) : null,
                h("h2", { id: titleId, class: "modal__title" }, title)),
            closeButton),
        content);
    const backdrop = h("div", { class: "modal-backdrop", onClick: (event) => { if (event.target === backdrop) close(); } }, root);

    function onKey(event) {
        if (event.key === "Escape") close();
    }
    function close() {
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("hashchange", close);
        backdrop.remove();
        if (opener instanceof HTMLElement && document.body.contains(opener)) opener.focus();
    }

    document.body.append(backdrop);
    document.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", close);
    (focus ?? closeButton).focus();
    return { close, root };
}

// Sbalitelná sekce (V4.1.2) – <details> s nadpisem; achievementy, statistiky a nastavení na telefonu.
// Stav (sbaleno / rozbaleno) si pamatuje v prohlížeči (prefs.js), když má sekce klíč a remember.

import { loadPref, savePref } from "../prefs.js";
import { h } from "../dom.js";

/** Telefon – stejná hranice jako v style.css a universes.js (V4.1). */
export const PHONE = window.matchMedia("(max-width: 599px)");

/**
 * @param {object} options
 * @param {string} options.key       klíč pro zapamatování stavu (fold-<key>)
 * @param {string|Node} options.title nadpis (v <summary>)
 * @param {string|Node} [options.meta] drobný text vpravo vedle nadpisu (počet, stav…)
 * @param {*} options.content        obsah (cokoli, co bere h())
 * @param {boolean} [options.open]   výchozí stav, když nic uloženo není (výchozí rozbaleno)
 * @param {boolean} [options.remember] pamatovat si stav (výchozí ano)
 * @param {string} [options.className] další třídy na <details>
 * @param {string} [options.headingClass] třída nadpisu (např. stats-panel__title)
 * @param {string} [options.tag]     značka nadpisu (výchozí h2)
 */
export function collapsible({
    key, title, meta = null, content, open = true, remember = true, className = "", headingClass = "", tag = "h2",
}) {
    const stored = remember ? loadPref(`fold-${key}`, null) : null;
    const isOpen = stored === null ? open : stored === "open";
    const details = h("details", { class: `fold ${className}`.trim(), open: isOpen },
        h("summary", { class: "fold__summary" },
            h(tag, { class: `fold__title ${headingClass}`.trim() }, title),
            meta !== null ? h("span", { class: "fold__meta" }, meta) : null,
            h("span", { class: "fold__chevron", "aria-hidden": "true" })),
        h("div", { class: "fold__body" }, content));
    if (remember) {
        details.addEventListener("toggle", () => savePref(`fold-${key}`, details.open ? "open" : "closed"));
    }
    return details;
}

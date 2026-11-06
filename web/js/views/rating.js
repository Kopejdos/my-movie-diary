// Hvězdičky hodnocení (V3.2) – 0,5–5 ★ po půlkách.
// Každá hvězda má dvě neviditelná tlačítka (levá půlka = x,5, pravá = celá),
// takže jde hodnotit myší, dotykem i klávesnicí (Tab + Enter).

import { starsText } from "../ratings.js";
import { TEXTS, format } from "../texts.js";
import { h } from "../dom.js";

/** Kolik procent hvězdy č. n (1–5) vyplnit pro score 0–10. */
function fillPercent(score, n) {
    return Math.max(0, Math.min(1, (score - (n - 1) * 2) / 2)) * 100;
}

/** Jen zobrazení hvězdiček (bez klikání) – např. ve statistikách. */
export function starsView(score, extraClass = "") {
    return h("span", { class: `rate-stars rate-stars--static ${extraClass}`.trim(), role: "img",
        "aria-label": format("ratingStarsAria", starsText(score)) },
        [1, 2, 3, 4, 5].map((n) => {
            const fill = h("span", { class: "rate-star__fill" });
            fill.style.width = `${fillPercent(score, n)}%`;
            return h("span", { class: "rate-star" }, fill);
        }));
}

/**
 * Editor hodnocení pod názvem filmu.
 * score = současné hodnocení (1–10) nebo null; onChange(score | null); onClose().
 */
export function ratingEditor({ title, score, onChange, onClose }) {
    let preview = null;
    const fills = [];
    const value = h("span", { class: "rate-editor__value", "aria-live": "polite" });

    const stars = h("div", {
        class: "rate-stars", role: "group", "aria-label": format("rateTitle", title),
        onMouseleave: () => { preview = null; paint(); },
    }, [1, 2, 3, 4, 5].map((n) => {
        const fill = h("span", { class: "rate-star__fill" });
        fills.push(fill);
        const half = (s, side) => h("button", {
            class: `rate-star__half rate-star__half--${side}`, type: "button",
            "aria-label": format("rateStars", starsText(s)),
            "aria-pressed": String(s === score),
            onMouseenter: () => { preview = s; paint(); },
            onFocus: () => { preview = s; paint(); },
            onBlur: () => { preview = null; paint(); },
            onClick: () => onChange(s),
        });
        return h("span", { class: "rate-star" }, fill, half(n * 2 - 1, "left"), half(n * 2, "right"));
    }));

    function paint() {
        const shown = preview ?? score ?? 0;
        fills.forEach((fill, i) => { fill.style.width = `${fillPercent(shown, i + 1)}%`; });
        value.textContent = shown ? format("rateValue", starsText(shown)) : TEXTS.rateNone;
    }
    paint();

    const editor = h("div", {
        class: "rate-editor",
        onKeydown: (event) => { if (event.key === "Escape") onClose(); },
    },
        stars,
        value,
        h("div", { class: "rate-editor__actions" },
            score ? h("button", { class: "btn btn--small btn--ghost", type: "button", onClick: () => onChange(null) }, TEXTS.rateClear) : null,
            h("button", { class: "btn btn--small", type: "button", onClick: onClose }, TEXTS.rateDone)),
    );
    return editor;
}

/** Fokus na hvězdu s aktuálním hodnocením (nebo první) – volat, až je editor ve stránce. */
export function focusRatingEditor(editor) {
    const target = editor?.querySelector('[aria-pressed="true"]') ?? editor?.querySelector(".rate-star__half");
    target?.focus({ preventScroll: true });
}

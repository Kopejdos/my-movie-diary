// Barva aktuálního univerza a výpočty kontrastu.
// Režim, styl a pevná barva akcentu jsou od V4.0 v settings.js.

import { getSettings, onSettingsChange, resolvedMode } from "./settings.js";

/** Aktuálně zobrazený režim ("light" / "dark") – pro CAPTCHA a podobně. */
export function currentTheme() {
    return resolvedMode();
}

/** Relativní jas barvy #rrggbb podle WCAG (0 = černá, 1 = bílá). */
function luminance(hex) {
    const value = parseInt(hex.slice(-6), 16);
    const channel = (shift) => {
        const c = ((value >> shift) & 0xff) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

const DARK_INK = "#14181d";
const DARK_INK_LUMINANCE = luminance(DARK_INK);

/** Kontrastní poměr bílé a tmavého textu vůči dané barvě. */
function contrasts(hex) {
    const l = luminance(hex);
    return { white: 1.05 / (l + 0.05), dark: (l + 0.05) / (DARK_INK_LUMINANCE + 0.05) };
}

const isHex = (hex) => /^#?[0-9a-f]{6}$/i.test(hex ?? "");

/**
 * Barva textu, která je čitelná na dané barvě (černá na světlé, bílá na tmavé).
 * Vybere tu s vyšším kontrastním poměrem (WCAG).
 */
export function inkFor(hex) {
    if (!isHex(hex)) return DARK_INK;
    const { white, dark } = contrasts(hex);
    return white >= dark ? "#ffffff" : DARK_INK;
}

/**
 * Barva pozadí pro tlačítka v barvě univerza (V3.6.2). Některé barvy
 * (např. červená #e23636) nedají kontrast 4.5 : 1 ani s bílým, ani s černým
 * textem – takovou barvu po krocích ztmavíme, dokud bílý text nebude čitelný.
 */
export function fillFor(hex) {
    if (!isHex(hex)) return hex;
    let rgb = parseInt(hex.slice(-6), 16);
    let color = `#${hex.slice(-6)}`;
    for (let step = 0; step < 40; step++) {
        const { white, dark } = contrasts(color);
        if (white >= 4.5 || dark >= 4.5) return color;
        const r = Math.round(((rgb >> 16) & 0xff) * 0.96);
        const g = Math.round(((rgb >> 8) & 0xff) * 0.96);
        const b = Math.round((rgb & 0xff) * 0.96);
        rgb = (r << 16) | (g << 8) | b;
        color = `#${rgb.toString(16).padStart(6, "0")}`;
    }
    return color;
}

/** Nastaví prvku barvu univerza: --u, --u-fill (pozadí tlačítek) a --u-ink (text na něm). */
export function applyUniverseColor(element, color) {
    const fill = fillFor(color);
    element.style.setProperty("--u", color);
    element.style.setProperty("--u-fill", fill);
    element.style.setProperty("--u-ink", inkFor(fill));
}

let pageColor = null;        // barva kolekce na aktuální stránce (i když se právě nepoužívá)

/**
 * Nastaví barvu univerza pro celou stránku (null = výchozí akcent).
 * S pevnou barvou v nastavení (V4.0) se barva kolekce nepoužije – stránka zůstane v akcentu.
 */
export function setAccent(color) {
    pageColor = color;
    const root = document.documentElement.style;
    if (color && getSettings().accent === "collection") {
        applyUniverseColor(document.documentElement, color);
    } else {
        root.removeProperty("--u");
        root.removeProperty("--u-fill");
        root.removeProperty("--u-ink");
    }
}

// Přepnutí mezi barvou kolekce a pevnou barvou se projeví hned i na otevřené stránce
onSettingsChange(() => setAccent(pageColor));

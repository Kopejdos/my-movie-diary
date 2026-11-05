// Světlý / tmavý režim a barva aktuálního univerza.
// Volba režimu se pamatuje v prohlížeči; bez volby se řídí nastavením systému.

const STORAGE_KEY = "mmd-theme";

/** Uložená volba ("light" / "dark"), nebo null. */
function storedTheme() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;   // soukromé okno / zakázané úložiště
    }
}

/** Aktuálně zobrazený režim. */
export function currentTheme() {
    const stored = storedTheme();
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Přepne režim a uloží volbu. Vrací nový režim. */
export function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
        localStorage.setItem(STORAGE_KEY, next);
    } catch {
        // bez úložiště platí volba jen do zavření stránky
    }
    return next;
}

/**
 * Barva textu, která je čitelná na dané barvě (černá na světlé, bílá na tmavé).
 * Výpočet relativního jasu podle WCAG.
 */
export function inkFor(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
    if (!match) return "#14181d";
    const value = parseInt(match[1], 16);
    const channel = (shift) => {
        const c = ((value >> shift) & 0xff) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
    return luminance > 0.36 ? "#14181d" : "#ffffff";
}

/** Nastaví barvu univerza pro celou stránku (null = výchozí mosazná). */
export function setAccent(color) {
    const root = document.documentElement.style;
    if (color) {
        root.setProperty("--u", color);
        root.setProperty("--u-ink", inkFor(color));
    } else {
        root.removeProperty("--u");
        root.removeProperty("--u-ink");
    }
}

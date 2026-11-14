// Nastavení vzhledu (V4.0) – uložené v prohlížeči, platí hned bez obnovení stránky.
//   mode     light / dark / system (podle systému, mění se s ním)
//   style    modern (výchozí) / paper (Paper classic – papírový deník)
//   accent   collection (barva podle kolekce, dnešní chování) / brass / pink / blue / green / purple
//   density  comfortable / compact (menší karty a řádky filmů)
//   motion   system (podle systému) / reduce (bez animací)
// Na <html> se zapisují jako data-theme (vyřešený režim), data-style, data-accent, data-density
// a data-motion; styly v style.css podle nich přepínají barvy. Stejné čtení dělá i krátký skript
// v <head> index.html, aby stránka při startu neproblikla.

const STORAGE_KEY = "mmd-settings";
const OLD_THEME_KEY = "mmd-theme";          // do V3.6 jen světlý / tmavý režim

export const SETTING_OPTIONS = {
    mode: ["system", "light", "dark"],
    style: ["modern", "paper"],
    accent: ["collection", "brass", "pink", "blue", "green", "purple"],
    density: ["comfortable", "compact"],
    motion: ["system", "reduce"],
};

export const DEFAULT_SETTINGS = {
    mode: "system", style: "modern", accent: "collection", density: "comfortable", motion: "system",
};

const listeners = new Set();
const systemLight = window.matchMedia("(prefers-color-scheme: light)");
let settings = load();

/** Načte uložené nastavení (neplatné hodnoty nahradí výchozími). */
function load() {
    let stored = {};
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? {};
        // Převzít volbu režimu ze starého přepínače ☾ / ☀
        const oldTheme = localStorage.getItem(OLD_THEME_KEY);
        if (!stored.mode && (oldTheme === "light" || oldTheme === "dark")) stored.mode = oldTheme;
    } catch {
        // soukromé okno / poškozený záznam – výchozí nastavení
    }
    return sanitize(stored);
}

function sanitize(values) {
    const clean = { ...DEFAULT_SETTINGS };
    for (const [key, options] of Object.entries(SETTING_OPTIONS)) {
        if (options.includes(values?.[key])) clean[key] = values[key];
    }
    return clean;
}

/** Aktuální nastavení (kopie). */
export function getSettings() {
    return { ...settings };
}

/** Režim, který se právě zobrazuje ("light" / "dark"). */
export function resolvedMode() {
    if (settings.mode === "light" || settings.mode === "dark") return settings.mode;
    return systemLight.matches ? "light" : "dark";
}

/** Změní jednu volbu, uloží ji a hned použije. */
export function setSetting(key, value) {
    if (!SETTING_OPTIONS[key]?.includes(value) || settings[key] === value) return;
    settings = { ...settings, [key]: value };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        localStorage.removeItem(OLD_THEME_KEY);
    } catch {
        // bez úložiště platí volba jen do zavření stránky
    }
    applySettings();
    for (const listener of listeners) listener(getSettings());
}

/** Zavolá funkci po každé změně nastavení. Vrací funkci pro odhlášení. */
export function onSettingsChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Zapíše nastavení na <html> a obarví lištu prohlížeče (theme-color). */
export function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = resolvedMode();
    root.dataset.style = settings.style;
    root.dataset.accent = settings.accent;
    root.dataset.density = settings.density;
    root.dataset.motion = settings.motion;
    const background = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (background) {
        document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", background));
    }
}

// Režim „System“ sleduje změnu v systému (např. večerní přepnutí na tmavý)
systemLight.addEventListener?.("change", () => {
    if (settings.mode !== "system") return;
    applySettings();
    for (const listener of listeners) listener(getSettings());
});

applySettings();

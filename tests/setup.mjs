// Společná příprava testů: podvrhne Supabase klienta a minimum z prohlížeče,
// aby šly moduly z web/js načíst v Node.js. Importuje se jako první řádek každého testu.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);

globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

/** Cesta k modulu webu, např. web("achievements.js"). */
export const web = (file) => new URL(`../web/js/${file}`, import.meta.url).href;

// Minimum z DOM pro moduly, které při načtení sáhnou na <html> (settings.js – V4.0)
globalThis.document ??= {
    documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } },
    querySelectorAll: () => [],
};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => "" });

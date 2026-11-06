// Drobné volby uživatele uložené v prohlížeči (pořadí, filtr).
// Když úložiště nefunguje (soukromé okno), volba platí jen do zavření stránky.

const memory = new Map();

export function loadPref(key, fallback) {
    try {
        const value = localStorage.getItem(`mmd-${key}`);
        return value ?? memory.get(key) ?? fallback;
    } catch {
        return memory.get(key) ?? fallback;
    }
}

export function savePref(key, value) {
    memory.set(key, value);
    try {
        localStorage.setItem(`mmd-${key}`, value);
    } catch {
        // bez úložiště jen v paměti
    }
}

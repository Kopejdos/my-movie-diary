// PWA: registrace service workeru a instalace aplikace na plochu.

let deferredPrompt = null;     // výzva k instalaci (Chrome, Edge, Android)
const listeners = new Set();

/** Spustí aplikace jako nainstalovaná (z plochy), ne v prohlížeči? */
export function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;    // iOS Safari
}

/** iPhone / iPad – instalace jen ručně přes Sdílet → Přidat na plochu. */
export function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Dá se teď nabídnout tlačítko Install? */
export function canInstall() {
    return deferredPrompt !== null && !isStandalone();
}

/** Odběr změny (výzva k instalaci přišla / aplikace se nainstalovala). */
export function onInstallChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) listener();
}

/** Zobrazí systémový dialog instalace. Vrací true, když uživatel potvrdil. */
export async function promptInstall() {
    if (!deferredPrompt) return false;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    notify();
    return outcome === "accepted";
}

/** Odběr zprávy „je nová verze aplikace“ (service worker ji pošle po nasazení). */
const updateListeners = new Set();
export function onUpdateAvailable(listener) {
    updateListeners.add(listener);
}

/** Registrace service workeru a sledování instalace. */
export function initPwa() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data?.type === "update-available") {
                for (const listener of updateListeners) listener();
            }
        });
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("sw.js").catch((error) => {
                console.warn("Service worker registration failed", error);
            });
        });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();          // vlastní tlačítko místo automatické lišty
        deferredPrompt = event;
        notify();
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        notify();
    });
}

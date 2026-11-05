// =====================================================================
// My Movie Diary – service worker (PWA; rychlé načítání od V1.4.1)
//
// • Stránky (index.html, privacy.html): síť první, při výpadku / pomalé
//   síti (> 3 s) poslední uložená verze.
// • Soubory webu (JS, CSS, ikony): OKAMŽITĚ z mezipaměti, na pozadí se
//   ověří u serveru. Když se soubor změnil (nové nasazení), stránka dostane
//   zprávu „update-available“ a nabídne tlačítko Reload.
// • Soubory s verzí v názvu (vendor/, fonts/): jen z mezipaměti – nemění se.
// • Supabase (data, přihlášení) a obrázky TMDB: prohlížeč sám (bez SW).
// =====================================================================

const VERSION = "mmd-v2";
let updateNotified = false;           // o nové verzi se dá vědět jen jednou
const CACHE = `${VERSION}-app`;

// Uloží se při instalaci, aby aplikace šla otevřít i offline
const SHELL = [
    "./",
    "index.html",
    "privacy.html",
    "manifest.webmanifest",
    "css/style.css",
    "vendor/supabase-js-2.119.0.min.js",
    "fonts/inter-latin-wght-normal.woff2",
    "fonts/chakra-petch-latin-600-normal.woff2",
    "fonts/chakra-petch-latin-700-normal.woff2",
    "js/app.js",
    "js/config.js",
    "js/supabase.js",
    "js/router.js",
    "js/texts.js",
    "js/dom.js",
    "js/theme.js",
    "js/prefs.js",
    "js/pwa.js",
    "js/auth.js",
    "js/data.js",
    "js/admin.js",
    "js/achievements.js",
    "js/search.js",
    "js/stats.js",
    "js/social.js",
    "js/views/universes.js",
    "js/views/universe.js",
    "js/views/watchlist.js",
    "js/views/search.js",
    "js/views/stats.js",
    "js/views/public-profile.js",
    "js/views/achievements.js",
    "js/views/login.js",
    "js/views/register.js",
    "js/views/profile.js",
    "js/views/admin.js",
    "js/views/admin-universe.js",
    "js/views/not-found.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/favicon.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;          // Supabase, TMDB… řeší prohlížeč

    if (request.mode === "navigate") {
        updateNotified = false;        // nové otevření stránky = o další nové verzi zase dát vědět
        event.respondWith(networkFirst(request, 3000));
    } else if (url.pathname.includes("/vendor/") || url.pathname.includes("/fonts/")) {
        event.respondWith(cacheFirst(request));
    } else {
        event.respondWith(staleWhileRevalidate(request, event));
    }
});

/** Síť první s časovým limitem; jinak uložená verze (offline / pomalá síť). */
async function networkFirst(request, timeoutMs) {
    const cache = await caches.open(CACHE);
    const cached = () => cache.match(request, { ignoreSearch: true }).then((r) => r ?? cache.match("index.html"));

    const network = fetch(request, { cache: "no-cache" }).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs, null));

    try {
        const response = await Promise.race([network, timeout]);
        if (response) return response;
        return (await cached()) ?? (await network);
    } catch {
        const fallback = await cached();
        if (fallback) return fallback;
        throw new Error("Offline and not cached");
    }
}

/** Soubory, které se nikdy nemění (verze v názvu). */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}

/** Hned z mezipaměti; na pozadí ověřit u serveru a při změně dát vědět stránce. */
async function staleWhileRevalidate(request, event) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });

    const update = fetch(request, { cache: "no-cache" }).then(async (response) => {
        if (!response.ok) return response;
        if (cached && fingerprint(cached) !== fingerprint(response)) notifyUpdate();
        await cache.put(request, response.clone());
        return response;
    }).catch(() => cached);

    if (cached) {
        event.waitUntil(update);       // ověření doběhne i po vrácení odpovědi
        return cached;
    }
    return update;
}

/** Otisk verze souboru – GitHub Pages posílá ETag a Last-Modified. */
function fingerprint(response) {
    return response.headers.get("etag") ?? response.headers.get("last-modified") ?? response.headers.get("content-length");
}

/** Pošle otevřeným stránkám zprávu o nové verzi (jednou za otevření stránky). */
async function notifyUpdate() {
    if (updateNotified) return;
    updateNotified = true;
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) client.postMessage({ type: "update-available" });
}

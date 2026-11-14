// =====================================================================
// My Movie Diary – service worker (PWA; rychlé načítání od V1.4.1)
//
// • Stránky (index.html, privacy.html, terms.html): síť první, při výpadku / pomalé
//   síti (> 3 s) poslední uložená verze.
// • Soubory webu (JS, CSS, ikony): od V3.1.5 také SÍŤ PRVNÍ (> 2,5 s nebo offline →
//   uložená verze). Dřív šly hned z mezipaměti a nová verze webu se ukázala až po
//   druhém obnovení stránky – po nasazení teď stačí jedno načtení.
// • Soubory s verzí v názvu (vendor/, fonts/): jen z mezipaměti – nemění se.
// • Supabase (data, přihlášení) a obrázky TMDB: prohlížeč sám (bez SW).
// =====================================================================

const VERSION = "mmd-v20";       // V4.0: nastavení; od V3.1.5 síť první i pro JS a CSS
const CACHE = `${VERSION}-app`;

// Uloží se při instalaci, aby aplikace šla otevřít i offline
const SHELL = [
    "./",
    "index.html",
    "privacy.html",
    "terms.html",
    "manifest.webmanifest",
    "css/style.css",
    "vendor/supabase-lite-2.119.0.min.js",
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
    "js/db.js",
    "js/admin.js",
    "js/achievements.js",
    "js/cache.js",
    "js/captcha.js",
    "js/ratings.js",
    "js/search.js",
    "js/stats.js",
    "js/social.js",
    "js/today.js",
    "js/compare.js",
    "js/requests.js",
    "js/lists.js",
    "js/settings.js",
    "js/views/universes.js",
    "js/views/universe.js",
    "js/views/watchlist.js",
    "js/views/search.js",
    "js/views/stats.js",
    "js/views/public-profile.js",
    "js/views/about.js",
    "js/views/password.js",
    "js/views/rating.js",
    "js/views/today.js",
    "js/views/coming-soon.js",
    "js/views/upcoming.js",
    "js/views/friends.js",
    "js/views/compare.js",
    "js/views/requests.js",
    "js/views/admin-requests.js",
    "js/views/admin-search.js",
    "js/views/admin-series.js",
    "js/views/lists.js",
    "js/views/list.js",
    "js/views/list-picker.js",
    "js/views/list-card.js",
    "js/views/list-button.js",
    "js/views/film-controls.js",
    "js/views/modal.js",
    "js/views/admin-reports.js",
    "js/views/achievements.js",
    "js/views/login.js",
    "js/views/register.js",
    "js/views/profile.js",
    "js/views/settings.js",
    "js/views/appearance.js",
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
        event.respondWith(networkFirst(request, 3000, true));
    } else if (url.pathname.includes("/vendor/") || url.pathname.includes("/fonts/")) {
        event.respondWith(cacheFirst(request));
    } else {
        event.respondWith(networkFirst(request, 2500, false));
    }
});

/**
 * Síť první s časovým limitem; jinak uložená verze (offline / pomalá síť).
 * isPage = při úplném výpadku vrátit aspoň index.html (aplikace si poradí sama).
 */
async function networkFirst(request, timeoutMs, isPage) {
    const cache = await caches.open(CACHE);
    const cached = () => cache.match(request, { ignoreSearch: true })
        .then((r) => r ?? (isPage ? cache.match("index.html") : undefined));

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

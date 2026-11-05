// =====================================================================
// My Movie Diary – service worker (fáze 8 – PWA)
//
// • Soubory webu (HTML, CSS, JS, ikony): vždy se zeptá serveru, jestli
//   nemá novější verzi (síť první, bez mezipaměti prohlížeče). Po nasazení
//   je tak nová verze vidět hned – bez Ctrl+F5. Bez internetu použije
//   poslední uloženou verzi, takže se aplikace aspoň otevře.
// • Knihovna Supabase z CDN a písma Google: z mezipaměti (rychlé,
//   funguje offline), na pozadí se obnoví. Plakáty z TMDB drží běžná
//   mezipaměť prohlížeče.
// • Supabase (data, přihlášení) a vše ostatní: jen síť, nic se neukládá.
// =====================================================================

const VERSION = "mmd-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const MEDIA_CACHE = `${VERSION}-media`;
const MEDIA_LIMIT = 300;   // kolik obrázků držet nejvýš

// Základ aplikace – uloží se při instalaci, aby šla otevřít i offline
const SHELL = [
    "./",
    "index.html",
    "privacy.html",
    "manifest.webmanifest",
    "css/style.css",
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
    "js/views/universes.js",
    "js/views/universe.js",
    "js/views/watchlist.js",
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
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
            .then(() => self.skipWaiting()),   // nová verze se aktivuje hned
    );
});

self.addEventListener("activate", (event) => {
    // Smazat mezipaměti starších verzí
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

    // Soubory webu (stejný původ)
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Obrázky TMDB, knihovna z CDN a písma Google
    if (url.hostname === "image.tmdb.org"
        || url.hostname === "cdn.jsdelivr.net"
        || url.hostname === "fonts.googleapis.com"
        || url.hostname === "fonts.gstatic.com") {
        event.respondWith(staleWhileRevalidate(request));
    }
    // Supabase a ostatní: prohlížeč to vyřídí sám (jen síť)
});

/** Síť první (s ověřením u serveru), při výpadku poslední uložená verze. */
async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // Offline navigace na neuloženou adresu → hlavní stránka (router si poradí)
        if (request.mode === "navigate") {
            const shell = await cache.match("index.html");
            if (shell) return shell;
        }
        throw new Error("Offline and not cached");
    }
}

/** Z mezipaměti hned, na pozadí stáhnout novou verzi. */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(MEDIA_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then(async (response) => {
            // Jen běžné (CORS) odpovědi – „opaque“ odpovědi (obrázky bez CORS) by si
            // Chrome počítal po megabajtech; ty obstará běžná mezipaměť prohlížeče
            if (response.ok) {
                await cache.put(request, response.clone());
                trimCache(cache);
            }
            return response;
        })
        .catch(() => cached);
    return cached ?? network;
}

/** Drží mezipaměť obrázků v rozumné velikosti (nejstarší pryč). */
async function trimCache(cache) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MEDIA_LIMIT; i++) {
        await cache.delete(keys[i]);
    }
}

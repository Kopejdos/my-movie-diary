// Průvodce pro nováčky (V4.3.4) – čistá logika: kroky prohlídek a zapamatování, co už uživatel viděl.
//
//   overview   – přehled kolekcí (#/): kolekce, hledání, Coming soon, watchlist, požadavky, profil, ⚙
//   collection – první otevřená kolekce (jen přihlášený – tlačítka u filmů): +, −, ☆, seznamy, hodnocení
//
// Krok má cíl (CSS selektory – první viditelný; na telefonu jiný prvek než na počítači), nadpis a text
// (klíče v js/i18n). Krok bez cíle je karta uprostřed obrazovky. Krok, jehož cíl na stránce není
// (např. watchlist pro nepřihlášeného), se přeskočí. Vykresluje views/guide.js.

/** Klíč v localStorage: { overview: 1, collection: 1 } – které prohlídky už uživatel viděl. */
export const GUIDE_KEY = "mmd-guide";

/** Verze prohlídek – po větší změně kroků se dá zvýšit a ukážou se znovu. */
export const GUIDE_VERSION = 1;

export const TOURS = {
    overview: {
        path: "/",
        steps: [
            { id: "welcome", title: "guideWelcomeTitle", text: "guideWelcomeText" },
            { id: "kinds", targets: [".kind-tabs"], title: "guideKindsTitle", text: "guideKindsText" },
            { id: "card", targets: [".universe-grid .universe-card"], title: "guideCardTitle", text: "guideCardText" },
            { id: "search", targets: [".tabbar__item[href='#/search']", ".nav__search"], title: "guideSearchTitle", text: "guideSearchText" },
            { id: "soon", targets: [".tabbar__item[href='#/coming-soon']", ".nav__soon"], title: "guideSoonTitle", text: "guideSoonText" },
            { id: "watchlist", user: true, targets: [".tabbar__item[href='#/watchlist']", ".nav__link[href='#/watchlist']"], title: "guideWatchlistTitle", text: "guideWatchlistText" },
            { id: "requests", user: true, targets: [".nav__requests"], title: "guideRequestsTitle", text: "guideRequestsText" },
            { id: "profile", user: true, targets: [".tabbar__item[href='#/profile']", ".tabbar__item[href='#/friends']", ".nav__user"], title: "guideProfileTitle", text: "guideProfileText" },
            { id: "settings", targets: [".settings-toggle"], title: "guideSettingsTitle", text: "guideSettingsText" },
            { id: "done", title: "guideDoneTitle", text: "guideDoneText", guestText: "guideDoneGuestText", final: true },
        ],
    },
    collection: {
        path: "/collection/",
        user: true,
        steps: [
            { id: "add", targets: [".film .counter__btn--add"], title: "guideAddTitle", text: "guideAddText" },
            { id: "remove", targets: [".film .counter"], title: "guideRemoveTitle", text: "guideRemoveText" },
            { id: "star", targets: [".film .star-btn:not(.list-btn)"], title: "guideStarTitle", text: "guideStarText" },
            { id: "list", targets: [".film .list-btn"], title: "guideListTitle", text: "guideListText" },
            { id: "rate", targets: [".film .rate-btn"], title: "guideRateTitle", text: "guideRateText" },
            { id: "progress", targets: [".banner__progress"], title: "guideProgressTitle", text: "guideProgressText" },
            { id: "order", targets: [".toolbar"], title: "guideOrderTitle", text: "guideOrderText", final: true },
        ],
    },
};

/** Uložený stav (bez úložiště = nic neviděl – prohlídka se ale ukáže jen jednou za návštěvu). */
const memory = {};

export function loadSeen(storage = globalThis.localStorage) {
    try {
        const value = JSON.parse(storage?.getItem(GUIDE_KEY) ?? "{}");
        return value && typeof value === "object" ? { ...value, ...memory } : { ...memory };
    } catch {
        return { ...memory };
    }
}

/** Prohlídku už uživatel viděl (dokončil nebo přeskočil). */
export function markSeen(name, storage = globalThis.localStorage) {
    memory[name] = GUIDE_VERSION;
    try {
        storage?.setItem(GUIDE_KEY, JSON.stringify({ ...loadSeen(storage), [name]: GUIDE_VERSION }));
    } catch {
        // bez úložiště jen v paměti
    }
}

/** Ukázat prohlídku znovu (stránka Help → „Take the tour again“). */
export function resetSeen(names = Object.keys(TOURS), storage = globalThis.localStorage) {
    const seen = loadSeen(storage);
    for (const name of names) {
        delete seen[name];
        delete memory[name];
    }
    try {
        storage?.setItem(GUIDE_KEY, JSON.stringify(seen));
    } catch {
        // bez úložiště
    }
}

/**
 * Která prohlídka se má na stránce spustit (nebo null): první, kterou uživatel ještě neviděl
 * a která patří k dané adrese. Přehled se nováčkovi ukáže hned, kolekce až po přihlášení.
 */
export function tourFor(path, signedIn, seen) {
    for (const [name, tour] of Object.entries(TOURS)) {
        if ((seen?.[name] ?? 0) >= GUIDE_VERSION) continue;
        if (tour.user && !signedIn) continue;
        const matches = tour.path.endsWith("/") && tour.path !== "/" ? path.startsWith(tour.path) : path === tour.path;
        if (matches) return name;
    }
    return null;
}

/** Kroky prohlídky pro uživatele (bez kroků jen pro přihlášené, když přihlášený není). */
export function stepsFor(name, signedIn) {
    return (TOURS[name]?.steps ?? []).filter((step) => signedIn || !step.user);
}

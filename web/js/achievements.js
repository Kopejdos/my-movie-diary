// Achievementy – výpočet ze zhlédnutí, která už jsou v databázi.
// Čistá logika (bez vykreslování). Nic se neukládá do databáze: odznaky
// i data odemčení se spočítají ze zhlédnutí, takže fungují i zpětně.
//
// Úrovně jdou škálovat – stačí připsat další číslo do `tiers`.

import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------
// Definice
// ---------------------------------------------------------------------

/** Názvy úrovní podle pořadí (víc úrovní = další názvy, pak čísla). */
export const TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Legend"];

/** Achievementy s úrovněmi. `measure` určuje, z čeho se počítá postup. */
export const ACHIEVEMENTS = [
    { key: "first", icon: "🎬", measure: "distinctFilms", tiers: [1] },
    { key: "collector", icon: "🎞️", measure: "distinctFilms", tiers: [10, 50, 100, 200] },
    { key: "screen-time", icon: "⏱️", measure: "hours", tiers: [24, 100, 200] },
    { key: "marathon", icon: "🏃", measure: "bestDay", tiers: [3, 5, 8] },
    { key: "rewatcher", icon: "🔁", measure: "mostRewatched", tiers: [3] },
    { key: "completionist", icon: "🏆", measure: "completedCollections", tiers: [1, 5, 10, 20] },
];

/** Fanoušek kategorie – úrovně podle počtu dokončených kolekcí v kategorii. */
export const CATEGORY_FAN_TIERS = [1, 3, 5];

/** Ikony kategorií (neznámá kategorie dostane hvězdu). */
export const CATEGORY_ICONS = {
    superhero: "🦸",
    "scifi-fantasy": "🚀",
    animation: "🎨",
    "action-adventure": "💥",
    horror: "🔪",
};

export function tierLabel(index, count) {
    if (count <= 1) return null;
    return TIER_LABELS[index] ?? `Tier ${index + 1}`;
}

// ---------------------------------------------------------------------
// Načtení dat
// ---------------------------------------------------------------------

/** Supabase vrací najednou nejvýš 1000 řádků – načte se po částech. */
async function fetchAll(buildQuery) {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        rows.push(...data);
        if (data.length < pageSize) return rows;
    }
}

/** Vše, co je k výpočtu potřeba: zhlédnutí, kolekce, jejich filmy a kategorie. */
export async function fetchAchievementData() {
    const [watches, universes, items, categories, links] = await Promise.all([
        fetchAll(() => supabase
            .from("watches")
            .select("tmdb_id, watched_on, created_at, film:films(runtime)")
            .order("watched_on")
            .order("created_at")),
        fetchAll(() => supabase.from("universes").select("id, slug, name, color").order("sort_order")),
        fetchAll(() => supabase.from("universe_items").select("universe_id, tmdb_id, is_optional")),
        fetchAll(() => supabase.from("categories").select("id, slug, name, color, sort_order").order("sort_order")),
        fetchAll(() => supabase.from("universe_categories").select("universe_id, category_id")),
    ]);
    return { watches, universes, items, categories, links };
}

// ---------------------------------------------------------------------
// Výpočet
// ---------------------------------------------------------------------

/**
 * Spočítá stav všech achievementů.
 * Vrací { cards, completed, unlockedKeys, unlockedCount, totalCount }.
 */
export function computeAchievements({ watches, universes, items, categories, links }) {
    // --- Průchod zhlédnutími v čase: první zhlédnutí, čas, dny, opakování ---
    const firstWatched = new Map();       // tmdb_id → datum prvního zhlédnutí
    const watchCount = new Map();         // tmdb_id → počet zhlédnutí
    const perDay = new Map();             // datum → počet zhlédnutí
    const reachDates = { distinctFilms: [], hours: [], bestDay: [], mostRewatched: [] };
    let minutes = 0;
    let bestDay = 0;
    let mostRewatched = 0;

    for (const w of watches) {
        const date = w.watched_on;

        if (!firstWatched.has(w.tmdb_id)) {
            firstWatched.set(w.tmdb_id, date);
            reachDates.distinctFilms.push(date);          // n-tý film viděn v den `date`
        }

        const before = Math.floor(minutes / 60);
        minutes += w.film?.runtime ?? 0;
        for (let h = before + 1; h <= Math.floor(minutes / 60); h++) reachDates.hours.push(date);

        const dayCount = (perDay.get(date) ?? 0) + 1;
        perDay.set(date, dayCount);
        if (dayCount > bestDay) {
            bestDay = dayCount;
            reachDates.bestDay.push(date);                // poprvé `bestDay` filmů za den
        }

        const count = (watchCount.get(w.tmdb_id) ?? 0) + 1;
        watchCount.set(w.tmdb_id, count);
        if (count > mostRewatched) {
            mostRewatched = count;
            reachDates.mostRewatched.push(date);
        }
    }

    // --- Dokončené kolekce (všechny povinné filmy viděné) ---
    const requiredByUniverse = new Map();
    for (const item of items) {
        if (item.is_optional) continue;
        const list = requiredByUniverse.get(item.universe_id) ?? [];
        list.push(item.tmdb_id);
        requiredByUniverse.set(item.universe_id, list);
    }

    const completed = [];                 // { universe, date } seřazené podle data dokončení
    for (const universe of universes) {
        const required = requiredByUniverse.get(universe.id) ?? [];
        if (required.length === 0 || !required.every((id) => firstWatched.has(id))) continue;
        const date = required.map((id) => firstWatched.get(id)).sort().at(-1);
        completed.push({ universe, date });
    }
    completed.sort((a, b) => a.date.localeCompare(b.date));
    reachDates.completedCollections = completed.map((c) => c.date);

    const values = {
        distinctFilms: firstWatched.size,
        hours: Math.floor(minutes / 60),
        bestDay,
        mostRewatched,
        completedCollections: completed.length,
    };

    // --- Karty achievementů ---
    const cards = ACHIEVEMENTS.map((a) => buildCard({
        key: a.key,
        icon: a.icon,
        tiers: a.tiers,
        value: values[a.measure],
        reached: reachDates[a.measure],
    }));

    // Fanoušci kategorií – jen kategorie, které mají nějakou kolekci
    for (const category of categories) {
        const inCategory = new Set(links.filter((l) => l.category_id === category.id).map((l) => l.universe_id));
        const collectionCount = universes.filter((u) => inCategory.has(u.id) && requiredByUniverse.has(u.id)).length;
        if (collectionCount === 0) continue;

        const done = completed.filter((c) => inCategory.has(c.universe.id));
        // Úrovně nad počet kolekcí v kategorii nemají smysl; menší kategorie má jako
        // nejvyšší úroveň „dokonči všechny“ (např. 2 kolekce → úrovně 1 a 2)
        const tiers = CATEGORY_FAN_TIERS.filter((t) => t <= collectionCount);
        if (collectionCount < CATEGORY_FAN_TIERS.at(-1) && !tiers.includes(collectionCount)) tiers.push(collectionCount);

        cards.push(buildCard({
            key: `fan-${category.slug}`,
            icon: CATEGORY_ICONS[category.slug] ?? "⭐",
            tiers,
            value: done.length,
            reached: done.map((c) => c.date),
            category,
        }));
    }

    // Klíče odemčených úrovní a dokončených kolekcí (pro oznámení „nově odemčeno“)
    const unlockedKeys = new Set();
    let unlockedCount = 0;
    let totalCount = 0;
    for (const card of cards) {
        card.tiers.forEach((tier) => {
            totalCount++;
            if (tier.unlockedOn) {
                unlockedCount++;
                unlockedKeys.add(`${card.key}:${tier.threshold}`);
            }
        });
    }
    for (const c of completed) unlockedKeys.add(`complete:${c.universe.slug}`);

    return { cards, completed, unlockedKeys, unlockedCount, totalCount, values };
}

/**
 * Karta jednoho achievementu: úrovně s datem odemčení a postup k další úrovni.
 * `reached[n - 1]` = datum, kdy hodnota poprvé dosáhla n.
 */
function buildCard({ key, icon, tiers, value, reached, category = null }) {
    const tierStates = tiers.map((threshold, index) => ({
        threshold,
        label: tierLabel(index, tiers.length),
        unlockedOn: value >= threshold ? (reached[threshold - 1] ?? null) : null,
    }));
    const next = tierStates.find((t) => !t.unlockedOn) ?? null;
    const unlockedTiers = tierStates.filter((t) => t.unlockedOn).length;
    return {
        key,
        icon,
        category,
        value,
        tiers: tierStates,
        unlockedTiers,
        next,                         // další úroveň (null = vše odemčeno)
        complete: next === null,
    };
}

// ---------------------------------------------------------------------
// Oznámení o nově odemčených
// ---------------------------------------------------------------------

const storageKey = (userId) => `mmd-achievements-${userId}`;

function loadSeen(userId) {
    try {
        const raw = localStorage.getItem(storageKey(userId));
        return raw ? new Set(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

function saveSeen(userId, keys) {
    try {
        localStorage.setItem(storageKey(userId), JSON.stringify([...keys]));
    } catch {
        // bez úložiště se oznámení prostě neukážou
    }
}

/**
 * Spočítá achievementy a vrátí klíče, které jsou nově odemčené od minula.
 * Napoprvé (v tomto prohlížeči) jen zapamatuje stav – žádná lavina oznámení.
 */
export async function findNewlyUnlocked(userId) {
    const result = computeAchievements(await fetchAchievementData());
    const seen = loadSeen(userId);
    saveSeen(userId, result.unlockedKeys);
    if (!seen) return { result, fresh: [] };
    return { result, fresh: [...result.unlockedKeys].filter((key) => !seen.has(key)) };
}

/**
 * Při přihlášení: když tento prohlížeč ještě nemá uložený stav, uloží ho hned
 * (bez oznámení). Pak už se oznámí každý nově odemčený achievement – i ten první.
 */
export async function ensureBaseline(userId) {
    if (loadSeen(userId)) return;
    const result = computeAchievements(await fetchAchievementData());
    if (!loadSeen(userId)) saveSeen(userId, result.unlockedKeys);
}

/** Po zobrazení stránky s achievementy: aktuální stav je „viděný“. */
export function markSeen(userId, unlockedKeys) {
    saveSeen(userId, unlockedKeys);
}

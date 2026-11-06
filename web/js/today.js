// „Co dneska?“ (V3.3) – tři tipy na film nahoře na přehledu. Čistá logika, nic nevykresluje.
//
//   watchlist – náhodný vydaný film z watchlistu,
//   next      – další neviděný film v rozkoukané kolekci (napoprvé ta naposledy sledovaná),
//   explore   – začátek kolekce, kterou uživatel ještě nezačal; vybírá se podle žánrů
//               (kategorií) kolekcí, ze kterých už viděl nejvíc filmů.
//
// Výběr je „náhodný na den“: stejný den = stejné tipy (generátor se semínkem z data),
// tlačítko Shuffle posune semínko a nabídne jiné filmy.

/** Pořadí, ve kterém se pro film hledá „jeho“ kolekce (série je nejvýstižnější). */
const KIND_RANK = { series: 0, path: 1, genre: 2, studio: 3 };

/** Malý generátor náhodných čísel se semínkem (mulberry32) – stejné semínko = stejná čísla. */
export function seededRandom(seedText) {
    let seed = 2166136261;
    for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Náhodný prvek pole (null pro prázdné). */
function pickOne(list, random) {
    return list.length === 0 ? null : list[Math.floor(random() * list.length)];
}

/** Náhodný prvek podle vah [{ value, weight }]. */
function pickWeighted(list, random) {
    const total = list.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return null;
    let roll = random() * total;
    for (const entry of list) {
        roll -= entry.weight;
        if (roll <= 0) return entry.value;
    }
    return list[list.length - 1].value;
}

/**
 * Připraví katalog pro výběr: filmy kolekcí v pořadí vydání (jen vydané)
 * a pro každý film jeho „hlavní“ kolekci.
 * universes = fetchUniverses(), items = řádky ze fetchSearchData().
 */
export function buildCatalog(universes, items, today) {
    const universeById = new Map(universes.map((u) => [u.id, u]));
    const itemsByUniverse = new Map();      // universe_id → [item] podle release_order
    const filmById = new Map();             // tmdb_id → film
    const homeOf = new Map();               // tmdb_id → nejvýstižnější kolekce filmu

    for (const item of items) {
        const universe = universeById.get(item.universe_id);
        const film = item.film;
        if (!universe || !film || item.is_upcoming) continue;
        if (!film.release_date || film.release_date > today) continue;     // pojistka: ještě nevyšlo

        const list = itemsByUniverse.get(universe.id) ?? [];
        list.push(item);
        itemsByUniverse.set(universe.id, list);
        filmById.set(film.tmdb_id, film);

        const home = homeOf.get(film.tmdb_id);
        if (!home || rankOf(universe) < rankOf(home)) homeOf.set(film.tmdb_id, universe);
    }
    for (const list of itemsByUniverse.values()) list.sort((a, b) => (a.release_order ?? 0) - (b.release_order ?? 0));
    return { universes, universeById, itemsByUniverse, filmById, homeOf };
}

function rankOf(universe) {
    return (KIND_RANK[universe.kind ?? "series"] ?? 9) * 100000 + (universe.sort_order ?? 0);
}

/** Neviděné povinné filmy kolekce v pořadí vydání. */
function unwatchedOf(catalog, universeId, counts) {
    return (catalog.itemsByUniverse.get(universeId) ?? [])
        .filter((item) => !item.is_optional && !counts.has(item.film.tmdb_id));
}

/** Tip z watchlistu: náhodný vydaný a neviděný film. */
export function pickWatchlist(catalog, watchlist, counts, random, exclude) {
    const candidates = [...watchlist]
        .filter((id) => catalog.filmById.has(id) && !counts.has(id) && !exclude.has(id))
        .sort((a, b) => a - b);             // stálé pořadí → stejné semínko = stejný film
    const id = pickOne(candidates, random);
    if (id === null) return null;
    return { film: catalog.filmById.get(id), universe: catalog.homeOf.get(id) ?? null };
}

/**
 * Tip „co tě čeká dál“: rozkoukané kolekce (něco viděl, něco zbývá).
 * Napoprvé (shuffle = 0) ta, ve které uživatel viděl film naposledy, jinak náhodně.
 * Při shodě má přednost série před studiem a kolekce s větším postupem.
 */
export function pickNext(catalog, counts, random, exclude, shuffle) {
    const started = [];
    for (const universe of catalog.universes) {
        if (!(universe.watchedCount > 0 && universe.watchedCount < universe.totalCount)) continue;
        // Vždy opravdu další film – když už byl ukázaný, přeskočí se celá kolekce
        const item = unwatchedOf(catalog, universe.id, counts)[0];
        if (!item || exclude.has(item.film.tmdb_id)) continue;
        let last = "";
        for (const listItem of catalog.itemsByUniverse.get(universe.id) ?? []) {
            const watchedOn = counts.get(listItem.film.tmdb_id)?.lastWatchedOn ?? "";
            if (watchedOn > last) last = watchedOn;
        }
        started.push({ universe, item, last, done: universe.watchedCount / universe.totalCount });
    }
    if (started.length === 0) return null;

    started.sort((a, b) =>
        b.last.localeCompare(a.last)
        || rankOf(a.universe) - rankOf(b.universe)
        || b.done - a.done);
    const chosen = shuffle === 0 ? started[0] : pickOne(started, random);
    return { film: chosen.item.film, item: chosen.item, universe: chosen.universe };
}

/**
 * Oblíbenost kategorií: kolik různých viděných filmů je v kolekcích dané kategorie.
 * Vrací Map category_id → počet.
 */
export function categoryAffinity(catalog, counts) {
    const affinity = new Map();
    for (const universe of catalog.universes) {
        if (!universe.watchedCount) continue;
        const watched = (catalog.itemsByUniverse.get(universe.id) ?? [])
            .filter((item) => counts.has(item.film.tmdb_id)).length;
        for (const categoryId of universe.categoryIds ?? []) {
            affinity.set(categoryId, (affinity.get(categoryId) ?? 0) + watched);
        }
    }
    return affinity;
}

/**
 * Tip „prozkoumej něco nového“: kolekce, kterou uživatel ještě nezačal.
 * Váha kolekce = součet oblíbenosti jejích kategorií (+ malý základ, ať má šanci všechno).
 * Série a cesta začíná prvním filmem; studio a žánrový výběr nabídne náhodný film.
 * reason = kategorie, která k výběru přispěla nejvíc (pro popisek „Because you watch…“).
 */
export function pickExplore(catalog, counts, categories, random, exclude) {
    const affinity = categoryAffinity(catalog, counts);
    const best = Math.max(1, ...affinity.values());

    const candidates = [];
    for (const universe of catalog.universes) {
        if (universe.watchedCount > 0) continue;
        // Série a cesta začínají prvním filmem, jinde (studio, žánr) se vybírá z celé kolekce
        const ordered = universe.kind === "series" || universe.kind === "path";
        const unwatched = unwatchedOf(catalog, universe.id, counts);
        const list = ordered
            ? unwatched.slice(0, 1).filter((item) => !exclude.has(item.film.tmdb_id))
            : unwatched.filter((item) => !exclude.has(item.film.tmdb_id));
        if (list.length === 0) continue;
        const score = (universe.categoryIds ?? []).reduce((sum, id) => sum + (affinity.get(id) ?? 0) / best, 0);
        candidates.push({ value: { universe, list }, weight: 0.03 + score * score });
    }
    const chosen = pickWeighted(candidates, random);
    if (!chosen) return null;

    const { universe, list } = chosen;
    const item = pickOne(list, random);

    // Popisek: nejoblíbenější kategorie téhle kolekce (jen když nějaká opravdu přispěla)
    let reason = null;
    let top = 0;
    for (const id of universe.categoryIds ?? []) {
        const value = affinity.get(id) ?? 0;
        if (value > top) {
            top = value;
            reason = categories.find((c) => c.id === id) ?? null;
        }
    }
    return { film: item.film, item, universe, reason };
}

/**
 * Všechny tři tipy najednou. Filmy se mezi kartami neopakují.
 * shown = Set tmdb_id už ukázaných filmů (Shuffle je přeskočí, dokud jsou jiné).
 */
export function pickToday({ catalog, counts, watchlist, categories, seed, shuffle = 0, shown = new Set() }) {
    const random = seededRandom(`${seed}|${shuffle}`);

    const attempt = (pick, exclude) => pick(exclude) ?? (exclude.size > 0 ? pick(used) : null);
    const used = new Set();        // filmy už vybrané pro jinou kartu (nikdy dvakrát)
    const avoid = () => new Set([...shown, ...used]);
    const remember = (result) => {
        if (result) used.add(result.film.tmdb_id);
        return result;
    };

    const watchlistPick = remember(attempt((exclude) => pickWatchlist(catalog, watchlist, counts, random, exclude), avoid()));
    const nextPick = remember(attempt((exclude) => pickNext(catalog, counts, random, exclude, shuffle), avoid()));
    const explorePick = remember(attempt((exclude) => pickExplore(catalog, counts, categories, random, exclude), avoid()));
    return { watchlist: watchlistPick, next: nextPick, explore: explorePick };
}

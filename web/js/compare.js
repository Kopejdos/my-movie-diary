// Porovnání s kamarádem (V3.4.2) – čistá logika, nic nevykresluje.
// Vstup: moje zhlédnutí a hodnocení, zhlédnutí (a u přítele i hodnocení) toho druhého,
// katalog kolekcí. Všechno se počítá v prohlížeči.

/** Od kolika společně hodnocených filmů má smysl ukazovat shodu v hodnocení. */
export const MIN_SHARED_RATINGS = 3;
/** Kolik filmů ukázat v seznamech „oba milujete“, „největší rozdíly“, „doporučuje“. */
export const LIST_LIMIT = 6;
/** Hodnocení od 4 ★ (score 8) = „miluje“. */
const LOVED = 8;
/** Kolik kolekcí ukázat ve srovnání postupu. */
export const COLLECTION_LIMIT = 8;

/** Zhlédnutí → Map tmdb_id → { film, count, last }. */
function byFilm(watches) {
    const films = new Map();
    for (const w of watches) {
        const entry = films.get(w.tmdb_id) ?? { film: { tmdb_id: w.tmdb_id, ...w.film }, count: 0, last: "" };
        entry.count++;
        if (!w.seen_before && (w.watched_on ?? "") > entry.last) entry.last = w.watched_on ?? "";
        films.set(w.tmdb_id, entry);
    }
    return films;
}

/** Celkový čas zhlédnutí v minutách (každé datované zhlédnutí zvlášť). */
function minutesOf(watches) {
    return watches.reduce((sum, w) => sum + (w.seen_before ? 0 : (w.film?.runtime ?? 0)), 0);   // „Seen before“ bez času (V3.6.1)
}

/**
 * Celé porovnání.
 *   mine   = { watches, ratings: Map tmdb_id → score }
 *   theirs = { watches, ratings: Map | null }   (null = hodnocení nevidím – nejsme přátelé)
 *   catalog = { universes, items } z fetchCatalogData (bez chystaných filmů)
 */
export function computeComparison(mine, theirs, catalog) {
    const a = byFilm(mine.watches);
    const b = byFilm(theirs.watches);

    const both = [];
    const onlyMine = [];
    const onlyTheirs = [];
    for (const [id, entry] of a) {
        if (b.has(id)) both.push({ film: entry.film, mine: entry, theirs: b.get(id) });
        else onlyMine.push({ film: entry.film, mine: entry });
    }
    for (const [id, entry] of b) {
        if (!a.has(id)) onlyTheirs.push({ film: entry.film, theirs: entry });
    }
    // Nejnověji viděné nahoře (u společných podle toho, kdo viděl později)
    const lastOf = (x) => [x.mine?.last ?? "", x.theirs?.last ?? ""].sort().pop();
    for (const list of [both, onlyMine, onlyTheirs]) {
        list.sort((x, y) => lastOf(y).localeCompare(lastOf(x)) || (x.film.title ?? "").localeCompare(y.film.title ?? ""));
    }

    const union = a.size + b.size - both.length;
    return {
        totals: {
            mine: { films: a.size, minutes: minutesOf(mine.watches) },
            theirs: { films: b.size, minutes: minutesOf(theirs.watches) },
            both: both.length,
        },
        // Shoda ve viděných filmech: společné / všechny filmy, které viděl aspoň jeden (Jaccard)
        overlap: union === 0 ? 0 : Math.round((both.length / union) * 100),
        both,
        onlyMine,
        onlyTheirs,
        ratings: theirs.ratings ? compareRatings(both, mine.ratings, theirs.ratings) : null,
        recommended: recommendations(onlyTheirs, theirs.ratings),
        collections: compareCollections(catalog, a, b),
    };
}

/**
 * Shoda v hodnocení u filmů, které hodnotili oba.
 * agreement = 100 % při stejných hodnoceních, 0 % při rozdílu 4,5 ★ (score 1 vs 10).
 */
function compareRatings(both, mineRatings, theirRatings) {
    const shared = both
        .filter((x) => mineRatings.has(x.film.tmdb_id) && theirRatings.has(x.film.tmdb_id))
        .map((x) => ({ film: x.film, mine: mineRatings.get(x.film.tmdb_id), theirs: theirRatings.get(x.film.tmdb_id) }));
    if (shared.length < MIN_SHARED_RATINGS) return { count: shared.length, agreement: null, loved: [], differences: [] };

    const avgDiff = shared.reduce((sum, x) => sum + Math.abs(x.mine - x.theirs), 0) / shared.length;
    return {
        count: shared.length,
        agreement: Math.round((1 - avgDiff / 9) * 100),
        loved: shared
            .filter((x) => x.mine >= LOVED && x.theirs >= LOVED)
            .sort((x, y) => (y.mine + y.theirs) - (x.mine + x.theirs) || (x.film.title ?? "").localeCompare(y.film.title ?? ""))
            .slice(0, LIST_LIMIT),
        differences: shared
            .filter((x) => Math.abs(x.mine - x.theirs) >= 3)        // aspoň 1,5 ★ rozdíl
            .sort((x, y) => Math.abs(y.mine - y.theirs) - Math.abs(x.mine - x.theirs) || (x.film.title ?? "").localeCompare(y.film.title ?? ""))
            .slice(0, LIST_LIMIT),
    };
}

/**
 * „Doporučuje“: filmy, které viděl jen ten druhý. S hodnocením (přítel) jen od 4 ★ výš,
 * nejlépe hodnocené první; bez hodnocení ty, které viděl nejvíckrát.
 */
function recommendations(onlyTheirs, theirRatings) {
    if (theirRatings) {
        return onlyTheirs
            .filter((x) => (theirRatings.get(x.film.tmdb_id) ?? 0) >= LOVED)
            .map((x) => ({ ...x, score: theirRatings.get(x.film.tmdb_id) }))
            .sort((x, y) => y.score - x.score || y.theirs.count - x.theirs.count)
            .slice(0, LIST_LIMIT);
    }
    return onlyTheirs
        .filter((x) => x.theirs.count > 1)
        .sort((x, y) => y.theirs.count - x.theirs.count)
        .slice(0, LIST_LIMIT);
}

/**
 * Postup v kolekcích, které rozkoukal aspoň jeden: [{ universe, total, mine, theirs }].
 * Nejdřív kolekce, kde jste oba, pak podle součtu viděných; cesty se nepočítají (jsou to výběry).
 */
function compareCollections(catalog, a, b) {
    const required = new Map();
    for (const item of catalog.items) {
        if (item.is_optional) continue;
        const list = required.get(item.universe_id) ?? [];
        list.push(item.tmdb_id);
        required.set(item.universe_id, list);
    }
    const rows = [];
    for (const universe of catalog.universes) {
        if (universe.kind === "path") continue;
        const ids = required.get(universe.id) ?? [];
        if (ids.length === 0) continue;
        const mine = ids.filter((id) => a.has(id)).length;
        const theirs = ids.filter((id) => b.has(id)).length;
        if (mine === 0 && theirs === 0) continue;
        rows.push({ universe, total: ids.length, mine, theirs });
    }
    return rows
        .sort((x, y) =>
            Number(y.mine > 0 && y.theirs > 0) - Number(x.mine > 0 && x.theirs > 0)
            || (y.mine + y.theirs) / y.total - (x.mine + x.theirs) / x.total
            || x.universe.name.localeCompare(y.universe.name))
        .slice(0, COLLECTION_LIMIT);
}

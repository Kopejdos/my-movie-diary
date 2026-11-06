// Vyhledávání filmů a kolekcí – čistá logika, nic nevykresluje.
// Hledá se v prohlížeči nad načteným seznamem (stovky filmů = okamžitě),
// databáze se při psaní neptá.

/** Nejvíc zobrazených filmů – víc výsledků chce upřesnit dotaz. */
export const MAX_FILM_RESULTS = 60;

/** Nejvíc zobrazených kolekcí. */
export const MAX_COLLECTION_RESULTS = 6;

/**
 * Text pro porovnávání: malá písmena, bez diakritiky a interpunkce.
 * "Bram Stoker's Dracula" → "bram stokers dracula", "Amélie" → "amelie",
 * "Spider-Man: No Way Home" → "spider man no way home".
 */
export function normalize(text) {
    return (text ?? "")
        .normalize("NFKD")                     // rozloží „é“ na „e“ + čárku, „³“ na „3“
        .replace(/[\u0300-\u036f]/g, "")       // čárky a háčky pryč
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/['’`]/g, "")                 // apostrof slovo nedělí (stoker's → stokers)
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/**
 * Připravený text k porovnání: slova a „slepená“ podoba bez mezer
 * (díky ní „spiderman“ najde „Spider-Man“ a „wall e“ najde „WALL·E“).
 */
function prepare(text) {
    const normalized = normalize(text);
    return {
        normalized,
        words: normalized === "" ? [] : normalized.split(" "),
        compact: normalized.replace(/ /g, ""),
    };
}

/**
 * Skóre shody textu s dotazem (0 = neodpovídá).
 * Každé slovo dotazu musí sedět: začátek některého slova, rok filmu,
 * nebo (od 3 znaků) část slepeného názvu.
 */
function scoreText(target, query, year) {
    if (target.normalized === "") return 0;

    let allPrefix = true;
    for (const token of query.tokens) {
        if (target.words.some((word) => word.startsWith(token))) continue;
        if (year && token === year) continue;
        if (token.length >= 3 && target.compact.includes(token)) {
            allPrefix = false;
            continue;
        }
        return 0;
    }

    // Pořadí dotazu bez roku – „alien 1979“ se porovná jako „alien“
    const text = query.tokens.filter((t) => !(year && t === year)).join(" ");
    if (text !== "" && target.normalized === text) return 100;          // přesná shoda
    if (text !== "" && target.normalized.startsWith(text)) return 80;   // název tak začíná
    if (target.compact === query.compact) return 90;                     // „spiderman“ = „Spider-Man“
    return allPrefix ? 60 : 40;
}

/** Rozloží dotaz na slova. Prázdný dotaz → null. */
export function parseQuery(raw) {
    const normalized = normalize(raw);
    if (normalized === "") return null;
    return { normalized, tokens: normalized.split(" "), compact: normalized.replace(/ /g, "") };
}

/**
 * Index pro hledání z načtených dat.
 * universes: kolekce (fetchUniverses), items: řádky universe_items s filmem.
 * Film ve více kolekcích je v indexu jednou a nese seznam kolekcí.
 * Chystaný film (Coming soon, V3.3) má upcoming = true – najde se, ale nejde označit jako viděný.
 */
export function buildSearchIndex(universes, items) {
    const universeById = new Map(universes.map((u) => [u.id, u]));
    const films = new Map();
    const groups = new Map();       // "universe_id|série" → skupina uvnitř kolekce (V3.0.1)

    for (const item of items) {
        const film = item.film;
        const universe = universeById.get(item.universe_id);
        if (!film || !universe) continue;

        if (item.franchise && !item.is_upcoming) {
            const key = `${universe.id}|${item.franchise}`;
            const group = groups.get(key) ?? { universe, franchise: item.franchise, name: prepare(item.franchise), count: 0 };
            group.count += 1;
            groups.set(key, group);
        }

        let entry = films.get(film.tmdb_id);
        if (!entry) {
            entry = {
                film,
                year: film.release_date ? film.release_date.slice(0, 4) : "",
                title: prepare(film.title),
                original: film.original_title && film.original_title !== film.title
                    ? prepare(film.original_title)
                    : null,
                universes: [],
                upcoming: Boolean(item.is_upcoming),
            };
            films.set(film.tmdb_id, entry);
        }
        // Vydaný aspoň v jedné kolekci = vydaný (jiná kolekce mohla být importovaná dřív)
        if (!item.is_upcoming) entry.upcoming = false;
        if (!entry.universes.includes(universe)) entry.universes.push(universe);
    }
    for (const entry of films.values()) {
        entry.universes.sort((a, b) => a.sort_order - b.sort_order);
    }

    return {
        films: [...films.values()],
        groups: [...groups.values()],
        collections: universes.map((universe) => ({
            universe,
            name: prepare(universe.name),
            slug: prepare(universe.slug),
            description: prepare(universe.description),
        })),
    };
}

/**
 * Najde filmy: [{ entry, score }] od nejlepší shody.
 * Stejné skóre → starší film dřív (série se pak řadí přirozeně: Alien, Aliens, Alien 3…).
 */
export function searchFilms(index, query) {
    if (!query) return [];
    const results = [];
    for (const entry of index.films) {
        // Rok ve dotazu se porovná s rokem filmu – „2024“ najde všechny filmy toho roku
        const score = Math.max(
            scoreText(entry.title, query, entry.year),
            entry.original ? scoreText(entry.original, query, entry.year) - 5 : 0,
        );
        if (score > 0) results.push({ entry, score });
    }
    return results.sort((a, b) =>
        b.score - a.score
        || a.entry.year.localeCompare(b.entry.year)
        || a.entry.film.title.localeCompare(b.entry.film.title));
}

/** Najde kolekce podle názvu (nebo zkratky v adrese), slabší shoda i podle popisu. */
export function searchCollections(index, query) {
    if (!query) return [];
    const results = [];
    for (const item of index.collections) {
        const byName = Math.max(scoreText(item.name, query, null), scoreText(item.slug, query, null) - 10);
        // Popis jen při shodě začátků slov – jinak by „man“ našlo půlku popisů
        const byDescription = scoreText(item.description, query, null) >= 60 ? 20 : 0;
        const score = Math.max(byName, byDescription);
        if (score > 0) results.push({ universe: item.universe, score });
    }
    return results.sort((a, b) => b.score - a.score || a.universe.sort_order - b.universe.sort_order);
}

/**
 * Najde série uvnitř kolekcí („Cars“ → Pixar › Cars): [{ universe, franchise, count, score }].
 * Série se stejným názvem jako celá kolekce se vynechá – tu už najde searchCollections.
 */
export function searchGroups(index, query) {
    if (!query) return [];
    const results = [];
    for (const group of index.groups ?? []) {
        if (group.name.normalized === normalize(group.universe.name)) continue;
        const score = scoreText(group.name, query, null);
        if (score > 0) results.push({ ...group, score });
    }
    return results.sort((a, b) => b.score - a.score || a.universe.sort_order - b.universe.sort_order);
}

/**
 * Filtr podle zhlédnutí: "all" | "unwatched" | "watched".
 * counts = Map tmdb_id → { count } (fetchMyFilmCounts).
 */
export function filterByWatched(results, filter, counts) {
    if (filter !== "all") results = results.filter((r) => !r.entry.upcoming);   // chystaný film nejde vidět
    if (filter === "watched") return results.filter((r) => counts.has(r.entry.film.tmdb_id));
    if (filter === "unwatched") return results.filter((r) => !counts.has(r.entry.film.tmdb_id));
    return results;
}

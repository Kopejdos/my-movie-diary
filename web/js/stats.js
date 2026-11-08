// Statistiky profilu – výpočet ze zhlédnutí, která už jsou v databázi.
// Čistá logika (bez vykreslování); data se načítají stejně jako pro achievementy
// (fetchAchievementData), takže stránka nepotřebuje žádný další dotaz.

/** Kolik položek ukázat v žebříčcích. */
export const TOP_FILMS = 5;
export const ALMOST_THERE = 6;
export const OTHER_FILMS = 8;          // kolik filmů mimo kolekce ukázat (V3.5.1)

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11-05" → Date v místním čase (půlnoc). */
function parseDate(date) {
    return new Date(`${date}T00:00:00`);
}

/** Date → "2026-11-05". */
function toKey(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Počet dní mezi dvěma daty "YYYY-MM-DD" (b − a). */
function daysBetween(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

/**
 * Spočítá všechny statistiky.
 * data = { watches, universes, items, categories, links } (viz fetchAchievementData),
 * today = dnešní datum "YYYY-MM-DD" podle hodin uživatele.
 */
export function computeStats({ watches, universes, items, categories, links }, today) {
    // --- Filmy: počty, poslední zhlédnutí, údaje o filmu ---
    const byFilm = new Map();            // tmdb_id → { film, count, first, last }
    const perDay = new Map();            // datum → počet zhlédnutí
    let minutes = 0;

    for (const w of watches) {
        const entry = byFilm.get(w.tmdb_id) ?? { film: { tmdb_id: w.tmdb_id, ...w.film }, count: 0, first: w.watched_on, last: w.watched_on };
        entry.count++;
        if (w.watched_on < entry.first) entry.first = w.watched_on;
        if (w.watched_on > entry.last) entry.last = w.watched_on;
        byFilm.set(w.tmdb_id, entry);

        perDay.set(w.watched_on, (perDay.get(w.watched_on) ?? 0) + 1);
        minutes += w.film?.runtime ?? 0;
    }
    const films = [...byFilm.values()];

    // --- Kolekce: postup a dokončení (volitelné filmy se nepočítají) ---
    const requiredByUniverse = new Map();
    for (const item of items) {
        if (item.is_optional) continue;
        const list = requiredByUniverse.get(item.universe_id) ?? [];
        list.push(item.tmdb_id);
        requiredByUniverse.set(item.universe_id, list);
    }
    const progress = universes
        .filter((u) => requiredByUniverse.has(u.id))
        .map((universe) => {
            const required = requiredByUniverse.get(universe.id);
            const watched = required.filter((id) => byFilm.has(id)).length;
            return { universe, watched, total: required.length, remaining: required.length - watched };
        });
    const completed = progress.filter((p) => p.remaining === 0);
    const inCollections = new Set(items.map((item) => item.tmdb_id));
    // „Skoro hotovo“: rozkoukané kolekce, nejmíň zbývajících filmů první
    const almostThere = progress
        .filter((p) => p.watched > 0 && p.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining || b.watched / b.total - a.watched / a.total)
        .slice(0, ALMOST_THERE);

    return {
        totals: {
            films: films.length,
            watches: watches.length,
            minutes,
            rewatches: watches.length - films.length,
            completed: completed.length,
            started: progress.filter((p) => p.watched > 0).length,
            collections: progress.length,
        },
        topFilms: [...films]
            .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
            .slice(0, TOP_FILMS),
        months: lastMonths(perDay, today, 12),
        years: perYear(watches, byFilm),
        decades: byDecade(films),
        categories: byCategory(categories, links, items, byFilm),
        almostThere,
        // Viděné filmy mimo kolekce (schválené požadavky, V3.5.1) – nejnověji viděné první
        otherFilms: films
            .filter((f) => !inCollections.has(f.film.tmdb_id))
            .sort((a, b) => b.last.localeCompare(a.last))
            .slice(0, OTHER_FILMS),
        otherCount: films.filter((f) => !inCollections.has(f.film.tmdb_id)).length,
        streaks: streaks([...perDay.keys()].sort(), today),
        bestDay: bestDay(perDay),
        weekday: favoriteWeekday(perDay),
        facts: facts(films),
    };
}

/** Zhlédnutí po měsících za posledních `count` měsíců (včetně aktuálního). */
function lastMonths(perDay, today, count) {
    const end = parseDate(today);
    const months = [];
    for (let i = count - 1; i >= 0; i--) {
        const date = new Date(end.getFullYear(), end.getMonth() - i, 1);
        const key = toKey(date).slice(0, 7);
        months.push({ key, date, count: 0 });
    }
    const index = new Map(months.map((m) => [m.key, m]));
    for (const [day, n] of perDay) {
        const month = index.get(day.slice(0, 7));
        if (month) month.count += n;
    }
    return months;
}

/** Po rocích: zhlédnutí a nově viděné filmy (od nejnovějšího roku). */
function perYear(watches, byFilm) {
    const years = new Map();
    const row = (year) => {
        if (!years.has(year)) years.set(year, { year, watches: 0, newFilms: 0 });
        return years.get(year);
    };
    for (const w of watches) row(w.watched_on.slice(0, 4)).watches++;
    for (const f of byFilm.values()) row(f.first.slice(0, 4)).newFilms++;
    return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}

/** Viděné filmy podle dekády vydání (1970, 1980…), od nejstarší. */
function byDecade(films) {
    const decades = new Map();
    for (const { film } of films) {
        const year = Number(film.release_date?.slice(0, 4));
        if (!year) continue;
        const decade = Math.floor(year / 10) * 10;
        decades.set(decade, (decades.get(decade) ?? 0) + 1);
    }
    return [...decades.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([decade, count]) => ({ decade, count }));
}

/**
 * Kategorie: kolik různých filmů z kolekcí kategorie uživatel viděl (z kolika).
 * Seřazeno podle počtu viděných – nahoře nejoblíbenější.
 */
function byCategory(categories, links, items, byFilm) {
    const filmsByUniverse = new Map();
    for (const item of items) {
        if (item.is_optional) continue;
        const set = filmsByUniverse.get(item.universe_id) ?? new Set();
        set.add(item.tmdb_id);
        filmsByUniverse.set(item.universe_id, set);
    }
    return categories
        .map((category) => {
            const filmIds = new Set();
            for (const link of links) {
                if (link.category_id !== category.id) continue;
                for (const id of filmsByUniverse.get(link.universe_id) ?? []) filmIds.add(id);
            }
            const watched = [...filmIds].filter((id) => byFilm.has(id)).length;
            return { category, watched, total: filmIds.size };
        })
        .filter((c) => c.total > 0)
        .sort((a, b) => b.watched - a.watched || a.category.sort_order - b.category.sort_order);
}

/**
 * Série dní po sobě se zhlédnutím: nejdelší (a kdy skončila) a aktuální.
 * Aktuální série platí, když poslední zhlédnutí bylo dnes nebo včera.
 */
function streaks(days, today) {
    if (days.length === 0) return { longest: 0, longestEnd: null, current: 0 };
    let longest = 1;
    let longestEnd = days[0];
    let run = 1;
    for (let i = 1; i < days.length; i++) {
        run = daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
        if (run > longest) {
            longest = run;
            longestEnd = days[i];
        }
    }
    const sinceLast = daysBetween(days.at(-1), today);
    return { longest, longestEnd, current: sinceLast <= 1 ? run : 0 };
}

/** Den s nejvíc zhlédnutími (při shodě ten dřívější). */
function bestDay(perDay) {
    let best = null;
    for (const [date, count] of [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!best || count > best.count) best = { date, count };
    }
    return best;
}

/** Den v týdnu s nejvíc zhlédnutími: 0 = neděle … 6 = sobota, nebo null. */
function favoriteWeekday(perDay) {
    const counts = new Array(7).fill(0);
    for (const [date, count] of perDay) counts[parseDate(date).getDay()] += count;
    const max = Math.max(...counts);
    return max > 0 ? { day: counts.indexOf(max), count: max } : null;
}

/** Zajímavosti: nejdelší a nejkratší film, nejstarší a nejnovější, první záznam. */
function facts(films) {
    if (films.length === 0) return null;
    const withRuntime = films.filter((f) => f.film.runtime);
    const withDate = films.filter((f) => f.film.release_date);
    const pick = (list, better) => list.reduce((best, f) => (best === null || better(f, best) ? f : best), null);
    return {
        longest: pick(withRuntime, (a, b) => a.film.runtime > b.film.runtime),
        shortest: pick(withRuntime, (a, b) => a.film.runtime < b.film.runtime),
        oldest: pick(withDate, (a, b) => a.film.release_date < b.film.release_date),
        newest: pick(withDate, (a, b) => a.film.release_date > b.film.release_date),
        first: pick(films, (a, b) => a.first < b.first),
    };
}

// ---------------------------------------------------------------------
// Hodnocení (V3.2)
// ---------------------------------------------------------------------

/** Kolik nejlépe hodnocených filmů ukázat. */
export const TOP_RATED = 8;

/**
 * Statistiky vlastních hodnocení.
 * ratings = Map tmdb_id → score (1–10), watches = zhlédnutí s údaji o filmu (kvůli názvu a plakátu).
 * Vrací null, když uživatel nic nehodnotil.
 */
export function computeRatingStats(ratings, watches) {
    if (!ratings || ratings.size === 0) return null;
    const films = new Map();
    const lastWatched = new Map();
    for (const w of watches) {
        if (!films.has(w.tmdb_id)) films.set(w.tmdb_id, { tmdb_id: w.tmdb_id, ...w.film });
        if (w.watched_on > (lastWatched.get(w.tmdb_id) ?? "")) lastWatched.set(w.tmdb_id, w.watched_on);
    }

    const scores = [...ratings.values()];
    const distribution = Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 }));
    for (const score of scores) distribution[score - 1].count++;

    const top = [...ratings.entries()]
        .filter(([tmdbId]) => films.has(tmdbId))
        .map(([tmdbId, score]) => ({ film: films.get(tmdbId), score, last: lastWatched.get(tmdbId) }))
        .sort((a, b) => b.score - a.score || (b.last ?? "").localeCompare(a.last ?? "") || (a.film.title ?? "").localeCompare(b.film.title ?? ""))
        .slice(0, TOP_RATED);

    return {
        count: scores.length,
        average: scores.reduce((sum, s) => sum + s, 0) / scores.length / 2,   // v hvězdičkách
        distribution,
        top,
    };
}

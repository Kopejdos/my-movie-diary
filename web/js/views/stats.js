// Obrazovka: statistiky profilu (#/stats).
// Výpočet je v ../stats.js; tady jen vykreslení – dlaždice, sloupcové grafy v CSS a seznamy.

import { fetchAchievementData } from "../achievements.js";
import { fetchWatchlistIds, todayLocal } from "../data.js";
import { computeStats } from "../stats.js";
import { isSignedIn } from "../auth.js";
import { navigate } from "../router.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, formatDate, loadingView, errorView } from "../dom.js";

export async function statsView(container, context) {
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    document.title = `${TEXTS.statsTitle} · ${TEXTS.appName}`;
    mount(container, profileTabs("stats"), loadingView());

    let stats, watchlistCount;
    try {
        const [data, watchlist] = await Promise.all([fetchAchievementData(), fetchWatchlistIds(true)]);
        stats = computeStats(data, todayLocal());
        watchlistCount = watchlist.size;
    } catch (error) {
        if (!context.isCurrent()) return;
        mount(container, profileTabs("stats"),
            errorView(format("errorGeneric", error.message), () => statsView(container, context)));
        return;
    }
    if (!context.isCurrent()) return;

    if (stats.totals.watches === 0) {
        mount(container, profileTabs("stats"),
            h("div", { class: "empty-filter" },
                h("p", { style: "margin: 0 0 12px" }, TEXTS.statsEmpty),
                h("a", { class: "btn btn--primary", href: "#/" }, TEXTS.watchlistBrowse)));
        return;
    }

    mount(container, profileTabs("stats"), statsContent(stats, watchlistCount));
}

/**
 * Dlaždice a panely z hotových statistik (vlastní i veřejný profil).
 * watchlistCount = null → dlaždice watchlistu se nezobrazí (watchlist je soukromý).
 */
export function statsContent(stats, watchlistCount = null) {
    return [
        tiles(stats, watchlistCount),
        h("div", { class: "stats-grid" },
            panel(TEXTS.statsActivity, monthChart(stats.months), yearList(stats.years)),
            panel(TEXTS.statsTopFilms, topFilms(stats.topFilms)),
            panel(TEXTS.statsDecades, decadeChart(stats.decades)),
            panel(TEXTS.statsCategories, categoryChart(stats.categories)),
            panel(TEXTS.statsAlmostThere, almostThere(stats.almostThere)),
            panel(TEXTS.statsFacts, factList(stats)),
        ),
    ];
}

/** Přepínač „Achievements | Stats“ nad profilem a statistikami. */
export function profileTabs(active) {
    const tab = (key, href, label) => h("a", {
        class: `segmented__option${active === key ? " segmented__option--active" : ""}`,
        href,
        "aria-current": active === key ? "page" : null,
    }, label);
    return h("nav", { class: "profile-tabs" },
        h("div", { class: "segmented" },
            tab("profile", "#/profile", TEXTS.profileTabAchievements),
            tab("stats", "#/stats", TEXTS.profileTabStats)));
}

/** Sekce s nadpisem. */
function panel(title, ...content) {
    return h("section", { class: "stats-panel" }, h("h2", { class: "stats-panel__title" }, title), content);
}

// ---------------------------------------------------------------------
// Dlaždice nahoře
// ---------------------------------------------------------------------

function tiles({ totals, streaks }, watchlistCount) {
    const hours = Math.floor(totals.minutes / 60);
    const tile = (value, label, sub = null) => h("div", { class: "stat-tile" },
        h("span", { class: "stat-tile__value" }, value),
        h("span", { class: "stat-tile__label" }, label),
        sub ? h("span", { class: "stat-tile__sub" }, sub) : null);

    return h("div", { class: "stat-tiles" },
        tile(String(totals.films), TEXTS.statsMovies),
        tile(String(totals.watches), TEXTS.statsViewings, format("statsRewatches", totals.rewatches)),
        tile(format("statsHours", hours), TEXTS.statsTime,
            hours >= 24 ? format("statsDays", (totals.minutes / 60 / 24).toFixed(1)) : format("statsMinutes", totals.minutes)),
        tile(`${totals.completed} / ${totals.collections}`, TEXTS.statsCompleted, format("statsStarted", totals.started)),
        tile(format("statsStreakDays", streaks.longest), TEXTS.statsLongestStreak,
            streaks.current > 0 ? format("statsCurrentStreak", streaks.current) : null),
        watchlistCount === null ? null : tile(String(watchlistCount), TEXTS.navWatchlist),
    );
}

// ---------------------------------------------------------------------
// Grafy (sloupce v CSS – jedna barva pro velikost, popisky v barvě textu)
// ---------------------------------------------------------------------

/** Svislé sloupce: zhlédnutí po měsících za posledních 12 měsíců. */
function monthChart(months) {
    const max = Math.max(1, ...months.map((m) => m.count));
    const total = months.reduce((sum, m) => sum + m.count, 0);
    const label = (date) => date.toLocaleDateString("en-GB", { month: "short" });

    return h("figure", { class: "chart" },
        h("div", { class: "month-chart", role: "img", "aria-label": format("statsMonthsAria", total) },
            months.map((m) => {
                const text = `${date(m.date)}: ${format("statsViewingsCount", m.count)}`;
                return h("div", { class: `month-chart__col${m.count === max && m.count > 0 ? " month-chart__col--max" : ""}`, title: text },
                    h("span", { class: "month-chart__value" }, m.count > 0 ? String(m.count) : ""),
                    h("span", { class: "month-chart__bar", style: `height: ${(m.count / max) * 100}%` }),
                    h("span", { class: "month-chart__label" }, label(m.date)));
            })),
        h("figcaption", { class: "hint" }, format("statsMonthsCaption", total)),
    );

    function date(d) {
        return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    }
}

/** Po rocích – textově (zhlédnutí a nové filmy). */
function yearList(years) {
    return h("ul", { class: "stats-list stats-list--years" },
        years.map((y) => h("li", {},
            h("strong", {}, y.year),
            h("span", { class: "muted" }, format("statsYearLine", y.watches, y.newFilms)))));
}

/** Vodorovné sloupce s popiskem vlevo a hodnotou vpravo. */
function barRows(rows) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return h("ul", { class: "bar-rows" },
        rows.map((r) => {
            const bar = h("span", { class: "bar-rows__bar", style: `width: ${Math.max(2, (r.value / max) * 100)}%` });
            if (r.color) bar.style.setProperty("--bar", r.color);
            return h("li", { class: "bar-rows__row", title: r.title ?? null },
                h("span", { class: "bar-rows__label" }, r.label),
                h("span", { class: "bar-rows__track" }, bar),
                h("span", { class: "bar-rows__value" }, r.valueText ?? String(r.value)));
        }));
}

function decadeChart(decades) {
    return barRows(decades.map((d) => ({
        label: `${d.decade}s`,
        value: d.count,
        title: `${d.decade}s: ${movies(d.count)}`,
    })));
}

/** Kategorie v jejich barvách (barva = identita, název je vždy vedle). */
function categoryChart(categories) {
    return barRows(categories.map((c) => ({
        label: c.category.name,
        value: c.watched,
        valueText: `${c.watched} / ${c.total}`,
        color: c.category.color,
        title: format("statsCategoryTitle", c.watched, c.total, c.category.name),
    })));
}

// ---------------------------------------------------------------------
// Seznamy
// ---------------------------------------------------------------------

function topFilms(films) {
    return h("ol", { class: "top-films" },
        films.map((f, index) => h("li", { class: "top-films__item" },
            h("span", { class: "top-films__rank" }, String(index + 1)),
            poster(f.film.poster_path, f.film.title, "top-films__poster"),
            h("div", { class: "top-films__info" },
                h("strong", {}, f.film.title),
                h("span", { class: "muted" }, format("lastWatched", formatDate(f.last)))),
            h("span", { class: "top-films__count" }, `${f.count}×`))));
}

function almostThere(list) {
    if (list.length === 0) return h("p", { class: "muted" }, TEXTS.statsAlmostEmpty);
    return h("ul", { class: "almost-list" },
        list.map((p) => {
            const value = Math.round((p.watched / p.total) * 100);
            const link = h("a", { class: "almost-list__item", href: `#/collection/${p.universe.slug}` },
                h("div", { class: "almost-list__top" },
                    h("strong", {}, p.universe.name),
                    h("span", { class: "muted" }, format("statsRemaining", p.remaining))),
                h("div", { class: "progress" }, h("div", { class: "progress__bar", style: `width: ${value}%` })),
                h("span", { class: "hint" }, format("progressCount", p.watched, p.total)));
            if (p.universe.color) {
                link.style.setProperty("--u", p.universe.color);
                link.style.setProperty("--u-ink", inkFor(p.universe.color));
            }
            return link;
        }));
}

function factList({ facts, bestDay, weekday }) {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const year = (f) => f.film.release_date.slice(0, 4);
    const fact = (label, value, sub) => h("li", {},
        h("span", { class: "muted" }, label),
        h("strong", {}, value),
        sub ? h("span", { class: "hint" }, sub) : null);

    return h("ul", { class: "stats-list stats-list--facts" },
        fact(TEXTS.statsFirstLogged, facts.first.film.title, formatDate(facts.first.first)),
        facts.longest ? fact(TEXTS.statsLongest, facts.longest.film.title, format("minutes", facts.longest.film.runtime)) : null,
        facts.shortest ? fact(TEXTS.statsShortest, facts.shortest.film.title, format("minutes", facts.shortest.film.runtime)) : null,
        facts.oldest ? fact(TEXTS.statsOldest, facts.oldest.film.title, year(facts.oldest)) : null,
        facts.newest ? fact(TEXTS.statsNewest, facts.newest.film.title, year(facts.newest)) : null,
        // „Nejrušnější den“ s jedním filmem nic neříká
        bestDay && bestDay.count > 1 ? fact(TEXTS.statsBestDay, movies(bestDay.count), formatDate(bestDay.date)) : null,
        weekday ? fact(TEXTS.statsWeekday, weekdays[weekday.day], format("statsViewingsCount", weekday.count)) : null,
    );
}

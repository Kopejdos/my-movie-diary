// Obrazovka: porovnání s kamarádem (#/compare/<nick>, V3.4.2).
// Funguje s přítelem (i se soukromým profilem, včetně hodnocení) a s veřejným profilem
// (bez hodnocení – ta vidí jen přátelé). Výpočet je v ../compare.js.

import { fetchPublicProfile } from "../social.js";
import { fetchAchievementData } from "../achievements.js";
import { fetchMyRatings, starsText } from "../ratings.js";
import { computeComparison } from "../compare.js";
import { isSignedIn, getProfile } from "../auth.js";
import { navigate } from "../router.js";
import { setAccent, inkFor } from "../theme.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, yearOf, loadingView, errorView } from "../dom.js";
import { friendButton } from "./friends.js";

const FILMS_SHOWN = 48;          // kolik filmů v záložce ukázat před tlačítkem „Show all“

export async function compareView(container, context) {
    const { params, isCurrent } = context;
    setAccent(null);
    if (!isSignedIn()) {
        navigate("/login");
        return;
    }
    const own = getProfile();
    if (own && own.username.toLowerCase() === params.username.toLowerCase()) {
        navigate("/profile");
        return;
    }
    document.title = `${format("compareTitle", params.username)} · ${TEXTS.appName}`;
    mount(container, loadingView());

    let found, mine, myRatings;
    try {
        [found, mine, myRatings] = await Promise.all([
            fetchPublicProfile(params.username),
            fetchAchievementData(),
            fetchMyRatings(true).catch(() => new Map()),
        ]);
    } catch (error) {
        if (!isCurrent()) return;
        mount(container, errorView(format("errorGeneric", error.message), () => compareView(container, context)));
        return;
    }
    if (!isCurrent()) return;

    const back = h("a", { class: "back-link", href: `#/u/${encodeURIComponent(params.username)}` }, TEXTS.compareBack);
    if (!found) {
        mount(container, h("a", { class: "back-link", href: "#/friends" }, TEXTS.compareBackFriends),
            h("div", { class: "state" }, h("p", {}, TEXTS.publicNotFound)));
        return;
    }
    // Cizí soukromý profil – porovnat jde až po přijetí přátelství
    if (found.private) {
        mount(container, back,
            h("div", { class: "state" },
                h("p", {}, format("compareNeedsFriend", found.profile.username)),
                friendButton(found.profile.username, found.friendship, (state) => {
                    if (state === "friend") compareView(container, context);
                })));
        return;
    }

    const them = found.profile.username;
    const result = computeComparison(
        { watches: mine.watches, ratings: myRatings },
        { watches: found.data.watches, ratings: found.ratings },
        { universes: mine.universes, items: mine.items },
    );

    mount(container,
        back,
        hero(own?.username ?? "", them, result),
        ratingsSection(them, result.ratings, found.friendship),
        result.recommended.length > 0
            ? section(format("compareRecommends", them), filmGrid(result.recommended.map((x) => ({
                film: x.film, note: x.score ? `★ ${starsText(x.score)}` : format("compareTimes", x.theirs.count),
            }))))
            : null,
        result.collections.length > 0 ? section(TEXTS.compareCollections, collectionsTable(them, result.collections)) : null,
        filmsSection(them, result),
    );
}

/** Hlavička: dvě iniciály, velké procento společných filmů, počty a čas. */
function hero(me, them, result) {
    const { totals, overlap } = result;
    const hours = (minutes) => format("compareHours", Math.round(minutes / 60));
    const person = (name, label, stats) => h("div", { class: "cmp-person" },
        h("span", { class: "profile-hero__avatar cmp-person__avatar", "aria-hidden": "true" }, name.charAt(0).toUpperCase()),
        h("strong", { class: "cmp-person__name" }, label),
        h("span", { class: "muted" }, `${movies(stats.films)} · ${hours(stats.minutes)}`));

    return h("section", { class: "cmp-hero" },
        h("span", { class: "eyebrow" }, TEXTS.compareEyebrow),
        h("div", { class: "cmp-hero__row" },
            person(me || "?", TEXTS.compareYou, totals.mine),
            h("div", { class: "cmp-hero__match" },
                h("span", { class: "cmp-hero__percent" }, `${overlap} %`),
                h("span", { class: "cmp-hero__label" }, TEXTS.compareOverlap),
                h("span", { class: "muted cmp-hero__sub" }, format("compareInCommon", totals.both))),
            person(them, `@${them}`, totals.theirs),
        ),
        h("div", { class: "cmp-venn", "aria-hidden": "true" },
            vennPart("mine", result.onlyMine.length, totals),
            vennPart("both", totals.both, totals),
            vennPart("theirs", result.onlyTheirs.length, totals)),
    );
}

/** Pruh „jen ty | oba | jen on“ – šířky podle počtu filmů. */
function vennPart(kind, count, totals) {
    const all = totals.mine.films + totals.theirs.films - totals.both;
    const part = h("span", { class: `cmp-venn__part cmp-venn__part--${kind}` }, count > 0 ? String(count) : "");
    part.style.flexGrow = String(all === 0 ? 1 : Math.max(count, 0.0001));
    return part;
}

/** Shoda v hodnocení (jen u přítele) – procento, oba milujete, největší rozdíly. */
function ratingsSection(them, ratings, friendship) {
    if (!ratings) {
        return friendship === "friend"
            ? null
            : h("p", { class: "notice cmp-note" }, format("compareRatingsFriendsOnly", them));
    }
    if (ratings.agreement === null) {
        return section(TEXTS.compareTaste,
            h("p", { class: "muted" }, format("compareRatingsTooFew", ratings.count, 3)));
    }
    const row = (x) => h("li", { class: "cmp-rated" },
        poster(x.film.poster_path, x.film.title, "cmp-rated__poster", false, "tiny"),
        h("span", { class: "cmp-rated__title" }, x.film.title),
        h("span", { class: "cmp-rated__scores" },
            h("span", { title: TEXTS.compareYou }, `${TEXTS.compareYouShort} ★ ${starsText(x.mine)}`),
            h("span", { title: `@${them}` }, `@${them} ★ ${starsText(x.theirs)}`)));

    return section(TEXTS.compareTaste,
        h("div", { class: "cmp-taste" },
            h("span", { class: "cmp-taste__percent" }, `${ratings.agreement} %`),
            h("span", { class: "muted" }, format("compareTasteFrom", ratings.count))),
        h("div", { class: "cmp-lists" },
            ratings.loved.length > 0
                ? h("div", {}, h("h3", { class: "cmp-subtitle" }, `💛 ${TEXTS.compareLoved}`), h("ul", { class: "cmp-rated-list" }, ratings.loved.map(row)))
                : null,
            ratings.differences.length > 0
                ? h("div", {}, h("h3", { class: "cmp-subtitle" }, `⚡ ${TEXTS.compareDifferences}`), h("ul", { class: "cmp-rated-list" }, ratings.differences.map(row)))
                : null,
        ),
    );
}

/** Kolekce vedle sebe: dva pruhy postupu (ty / kamarád). */
function collectionsTable(them, rows) {
    const bar = (value, total, who) => h("div", { class: `cmp-bar cmp-bar--${who}` },
        h("span", { class: "cmp-bar__fill", style: `width: ${total ? Math.round((value / total) * 100) : 0}%` }),
        h("span", { class: "cmp-bar__text" }, `${value} / ${total}`));
    return h("ul", { class: "cmp-collections" }, rows.map((r) => {
        const link = h("a", { class: "cmp-collection__name", href: `#/collection/${r.universe.slug}` }, r.universe.name);
        const li = h("li", { class: "cmp-collection" },
            link,
            h("div", { class: "cmp-collection__bars" },
                h("span", { class: "cmp-collection__who" }, TEXTS.compareYouShort), bar(r.mine, r.total, "mine"),
                h("span", { class: "cmp-collection__who" }, `@${them}`), bar(r.theirs, r.total, "theirs")));
        if (r.universe.color) {
            li.style.setProperty("--c", r.universe.color);
            li.style.setProperty("--c-ink", inkFor(r.universe.color));
        }
        return li;
    }));
}

/** Záložky Both | Only you | Only @kamarád s mřížkou plakátů. */
function filmsSection(them, result) {
    const tabs = [
        { key: "both", label: TEXTS.compareBoth, items: result.both },
        { key: "mine", label: TEXTS.compareOnlyYou, items: result.onlyMine },
        { key: "theirs", label: format("compareOnlyThem", them), items: result.onlyTheirs },
    ];
    let active = "both";
    let showAll = false;
    const bar = h("div", { class: "segmented cmp-tabs", role: "group" });
    const body = h("div");

    function render() {
        mount(bar, tabs.map((t) => h("button", {
            class: `segmented__option${active === t.key ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(active === t.key),
            onClick: () => { active = t.key; showAll = false; render(); },
        }, `${t.label} · ${t.items.length}`)));
        const items = tabs.find((t) => t.key === active).items;
        const shown = showAll ? items : items.slice(0, FILMS_SHOWN);
        mount(body,
            items.length === 0
                ? h("p", { class: "empty-filter" }, TEXTS.compareNone)
                : filmGrid(shown.map((x) => ({ film: x.film, note: yearOf(x.film.release_date) }))),
            items.length > shown.length
                ? h("button", { class: "btn cmp-more", type: "button", onClick: () => { showAll = true; render(); } },
                    format("compareShowAll", items.length))
                : null);
    }
    render();
    return section(TEXTS.compareFilms, h("div", { class: "toolbar" }, bar), body);
}

/** Mřížka malých plakátů s názvem a poznámkou (rok, hodnocení…). */
function filmGrid(entries) {
    return h("ul", { class: "cmp-grid" }, entries.map(({ film, note }) => h("li", { class: "cmp-film" },
        poster(film.poster_path, film.title, "cmp-film__poster", false, "small"),
        h("span", { class: "cmp-film__title" }, film.title),
        note ? h("span", { class: "cmp-film__note" }, note) : null)));
}

/** Sekce s nadpisem. */
function section(title, ...content) {
    return h("section", { class: "cmp-section" }, h("h2", { class: "cmp-section__title" }, title), content);
}

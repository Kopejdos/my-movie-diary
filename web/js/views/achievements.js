// Sekce „Achievements“ na profilu – karty odznaků a dokončené kolekce.

import { fetchAchievementData, computeAchievements, markSeen, xpForLevel } from "../achievements.js";
import { PERKS, PERK_KEYS, perksFor, nextPerks, loadPerks, levelTitle } from "../perks.js";
import { getUser } from "../auth.js";
import { inkFor, applyUniverseColor } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, formatDate, loadingView, errorView } from "../dom.js";
import { collapsible } from "./collapsible.js";

/** Název, popis a jednotka postupu podle klíče achievementu. */
function describe(card) {
    const t = card.next?.threshold ?? card.tiers.at(-1).threshold;
    if (card.key.startsWith("fan-")) {
        return {
            name: format("achFanName", card.category.name),
            desc: format("achFanDesc", t, card.category.name),
            unit: format("achUnitCollections", card.value, t),
        };
    }
    const map = {
        first: ["achFirstName", "achFirstDesc", "achUnitFilms"],
        collector: ["achCollectorName", "achCollectorDesc", "achUnitFilms"],
        "screen-time": ["achScreenTimeName", "achScreenTimeDesc", "achUnitHours"],
        marathon: ["achMarathonName", "achMarathonDesc", "achUnitDay"],
        rewatcher: ["achRewatcherName", "achRewatcherDesc", "achUnitRewatch"],
        completionist: ["achCompletionistName", "achCompletionistDesc", "achUnitCollections"],
        pathfinder: ["achPathfinderName", "achPathfinderDesc", "achUnitPaths"],
        auteur: ["achAuteurName", "achAuteurDesc", "achUnitDirectors"],
    };
    const [name, desc, unit] = map[card.key];
    return { name: TEXTS[name], desc: format(desc, t), unit: format(unit, Math.min(card.value, t), t) };
}

/** Sekce se načte sama (prázdný obal hned, obsah po výpočtu). */
export function achievementsSection() {
    const section = h("section", { class: "achievements" }, loadingView());
    load(section);
    return section;
}

async function load(section) {
    let result;
    try {
        result = computeAchievements(await fetchAchievementData());
    } catch (error) {
        mount(section, errorView(format("errorGeneric", error.message), () => load(section)));
        return;
    }
    const user = getUser();
    if (user) markSeen(user.id, result.unlockedKeys);
    const content = achievementsContent(result);
    // Výhody za úroveň (V4.4) – jen na vlastním profilu, hned pod kartou úrovně
    content.splice(1, 0, perksSection(result));
    mount(section, content);
}

/**
 * Výhody za úroveň (V4.4): co teď smím, co odemkne další úroveň a přehled všech úrovní.
 * Úroveň z databáze (ta limity hlídá); než se načte (nebo bez migrace), úroveň z výpočtu webu.
 */
function perksSection(result) {
    const body = h("div", { class: "perks" });
    const paint = (level) => {
        const now = perksFor(level);
        const next = nextPerks(level);
        const tile = (key, value, previous = null) => h("div", { class: "perk" },
            h("span", { class: "perk__value" }, previous !== null && previous !== value
                ? [h("span", { class: "perk__old" }, String(previous)), " → ", String(value)]
                : String(value)),
            h("span", { class: "perk__label" }, TEXTS[`perk_${key}`]));
        mount(body,
            h("p", { class: "hint perks__intro" }, TEXTS.perksIntro),
            h("div", { class: "perks__grid" }, PERK_KEYS.map((key) => tile(key, now[key]))),
            next
                ? h("div", { class: "perks__next" },
                    h("p", { class: "perks__next-title" },
                        h("strong", {}, format("perksNext", next.level, levelTitle(next.level))), " ",
                        h("span", { class: "muted" }, format("perksNextXp", Math.max(0, xpForLevel(next.level) - result.xp.total)))),
                    h("div", { class: "perks__grid" },
                        PERK_KEYS.filter((key) => next[key] !== now[key]).map((key) => tile(key, next[key], now[key]))))
                : h("p", { class: "perks__max" }, TEXTS.perksMax),
            h("details", { class: "perks__all" },
                h("summary", {}, TEXTS.perksAll),
                h("div", { class: "perks__table-wrap" },
                    h("table", { class: "perks__table" },
                        h("thead", {}, h("tr", {},
                            h("th", { scope: "col" }, TEXTS.perksLevel),
                            PERK_KEYS.map((key) => h("th", { scope: "col" }, TEXTS[`perk_${key}`])))),
                        h("tbody", {}, PERKS.map((row) => h("tr", { class: row.level === now.level ? "perks__row--current" : null },
                            h("th", { scope: "row" }, `${row.level} · ${levelTitle(row.level)}`),
                            PERK_KEYS.map((key) => h("td", {}, String(row[key]))))))))));
    };
    paint(result.level.level);
    loadPerks().then((perks) => {
        if (perks.level && perks.level !== result.level.level && body.isConnected) paint(perks.level);
    });
    return collapsible({
        key: "achievements-perks", title: TEXTS.perksTitle, meta: format("perksMeta", result.level.level),
        content: body, className: "fold--section",
    });
}

/**
 * Úroveň, karty achievementů a dokončené kolekce z hotového výpočtu
 * (vlastní profil i veřejný profil kohokoli jiného).
 */
export function achievementsContent(result) {
    const fans = result.cards.filter((card) => card.key.startsWith("fan-"));
    const main = result.cards.filter((card) => !card.key.startsWith("fan-"));
    return [
        levelCard(result),
        // Sbalitelné skupiny (V4.1.2) – hlavní achievementy, fanoušci kategorií, dokončené kolekce;
        // stav si pamatuje prohlížeč (i na veřejném profilu)
        foldGroup("achievements-main", TEXTS.achievementsTitle,
            format("achievementsSummary", unlocked(main), tierTotal(main)),
            [h("div", { class: "achievement-grid" }, main.map(achievementCard)),
                h("p", { class: "hint achievements-note" }, TEXTS.achievementsSeenBeforeNote)]),
        fans.length > 0
            ? foldGroup("achievements-fans", TEXTS.achievementsFans,
                format("achievementsSummary", unlocked(fans), tierTotal(fans)),
                h("div", { class: "achievement-grid" }, fans.map(achievementCard)))
            : null,
        foldGroup("achievements-completed", TEXTS.achievementsCompleted, String(result.completed.length),
            result.completed.length > 0
                ? h("div", { class: "completed-list" }, [...result.completed].reverse().map(completedBadge))
                : h("p", { class: "muted" }, TEXTS.achievementsCompletedEmpty)),
    ];
}

/** Odemčené / všechny úrovně karet (stejně jako souhrn „22 / 57 unlocked“). */
const unlocked = (cards) => cards.reduce((sum, card) => sum + card.tiers.filter((tier) => tier.unlockedOn).length, 0);
const tierTotal = (cards) => cards.reduce((sum, card) => sum + card.tiers.length, 0);

/** Sbalitelná skupina s nadpisem jako dosud (section-title). */
function foldGroup(key, title, meta, content) {
    return collapsible({ key, title, meta, content, className: "fold--section" });
}

/** Karta úrovně: číslo, titul, XP do další úrovně a rozpad podle zdroje. */
function levelCard({ level, xp }) {
    const part = (label, value) => h("div", { class: "xp-part" },
        h("span", { class: "xp-part__value" }, `+${value}`),
        h("span", { class: "xp-part__label" }, label));

    return h("section", { class: "level-card" },
        h("div", { class: "level-card__badge", "aria-hidden": "true" },
            h("span", { class: "level-card__number" }, String(level.level))),
        h("div", { class: "level-card__body" },
            h("span", { class: "eyebrow" }, format("levelLabel", level.level)),
            h("h2", { class: "level-card__title" }, level.title),
            h("div", { class: "progress progress--large" },
                h("div", { class: "progress__bar", style: `width: ${level.progress}%` })),
            h("p", { class: "level-card__next" },
                h("strong", {}, format("levelXp", level.xp)),
                " · ",
                format("levelToNext", level.toNext, level.level + 1)),
            h("div", { class: "xp-parts" },
                part(TEXTS.levelBreakdownFilms, xp.films),
                part(TEXTS.levelBreakdownRewatches, xp.rewatches),
                part(TEXTS.levelBreakdownCollections, xp.collections),
                part(TEXTS.levelBreakdownAchievements, xp.achievements)),
            h("p", { class: "hint" }, TEXTS.levelHowTo),
        ),
    );
}

/** Karta jednoho achievementu: ikona, název, úrovně, postup k další úrovni. */
function achievementCard(card) {
    const { name, desc, unit } = describe(card);
    const unlocked = card.unlockedTiers > 0;
    const lastUnlocked = [...card.tiers].reverse().find((t) => t.unlockedOn);
    const target = card.next?.threshold ?? card.tiers.at(-1).threshold;
    const progress = Math.min(100, Math.round((card.value / target) * 100));

    const el = h("article", {
            class: `achievement${unlocked ? " achievement--unlocked" : ""}${card.complete ? " achievement--complete" : ""}`,
        },
        h("div", { class: "achievement__icon", "aria-hidden": "true" }, card.icon),
        h("div", { class: "achievement__body" },
            h("h3", { class: "achievement__name" }, name,
                lastUnlocked?.label ? h("span", { class: `tier tier--${lastUnlocked.label.toLowerCase()}` }, lastUnlocked.label) : null),
            h("p", { class: "achievement__desc" }, card.complete ? TEXTS.achievementAllDone : desc),
            card.tiers.length > 1
                ? h("div", { class: "tier-dots", "aria-hidden": "true" },
                    card.tiers.map((t) => h("span", {
                        class: `tier-dot${t.unlockedOn ? " tier-dot--on" : ""}`,
                        title: `${t.label ?? ""} ${t.threshold}`,
                    })))
                : null,
            card.complete
                ? null
                : h("div", { class: "achievement__progress" },
                    h("div", { class: "progress" }, h("div", { class: "progress__bar", style: `width: ${progress}%` })),
                    h("span", { class: "achievement__unit" }, unit)),
            lastUnlocked
                ? h("p", { class: "achievement__date" }, format("achievementUnlockedOn", formatDate(lastUnlocked.unlockedOn)))
                : null,
        ),
    );
    if (card.category?.color) {
        applyUniverseColor(el, card.category.color);
    }
    return el;
}

/** Odznak dokončené kolekce v její barvě. */
function completedBadge({ universe, date }) {
    const el = h("a", { class: "completed-badge", href: `#/collection/${universe.slug}` },
        h("span", { class: "completed-badge__icon", "aria-hidden": "true" }, "🏆"),
        h("span", { class: "completed-badge__name" }, universe.name),
        h("span", { class: "completed-badge__date" }, formatDate(date)),
    );
    if (universe.color) {
        el.style.setProperty("--c", universe.color);
        el.style.setProperty("--c-ink", inkFor(universe.color));
    }
    return el;
}

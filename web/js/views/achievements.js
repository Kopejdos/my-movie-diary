// Sekce „Achievements“ na profilu – karty odznaků a dokončené kolekce.

import { fetchAchievementData, computeAchievements, markSeen } from "../achievements.js";
import { getUser } from "../auth.js";
import { inkFor } from "../theme.js";
import { TEXTS, format } from "../texts.js";
import { h, mount, formatDate, loadingView, errorView } from "../dom.js";

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
    mount(section, achievementsContent(result));
}

/**
 * Úroveň, karty achievementů a dokončené kolekce z hotového výpočtu
 * (vlastní profil i veřejný profil kohokoli jiného).
 */
export function achievementsContent(result) {
    return [
        levelCard(result),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.achievementsTitle),
            h("span", { class: "muted" }, format("achievementsSummary", result.unlockedCount, result.totalCount)),
        ),
        h("div", { class: "achievement-grid" }, result.cards.map(achievementCard)),
        h("p", { class: "hint achievements-note" }, TEXTS.achievementsSeenBeforeNote),
        h("div", { class: "section-title" },
            h("h2", {}, TEXTS.achievementsCompleted),
            h("span", { class: "muted" }, String(result.completed.length)),
        ),
        result.completed.length > 0
            ? h("div", { class: "completed-list" }, [...result.completed].reverse().map(completedBadge))
            : h("p", { class: "muted" }, TEXTS.achievementsCompletedEmpty),
    ];
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
        el.style.setProperty("--u", card.category.color);
        el.style.setProperty("--u-ink", inkFor(card.category.color));
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

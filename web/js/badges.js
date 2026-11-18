// Odznaky uživatelů (V4.4) – zatím jen Elite ★. Je to jen ozdoba: přiděluje ho správce
// (admin panel → Users), uživatel si ho nastavit nemůže.
//
// Použití: u nicku stačí atribut data-badge-user="nick" (data-badge-compact="1" = jen hvězda) a po vykreslení zavolat
// applyBadges(kořen) – odznaky se načtou jedním dotazem (badges_for) a připojí za nick.
// Výsledky jsou v paměti, takže hlavička a seznamy se netahají znovu.

import { supabase } from "./supabase.js";
import { TEXTS } from "./texts.js";
import { h } from "./dom.js";

/** Odznaky, které web umí ukázat (pořadí = pořadí zobrazení). */
export const BADGES = ["elite"];

const known = new Map();        // nick (malými písmeny) → [odznaky]
let disabled = false;           // bez migrace V4.4 se už dál nezkouší

/** Odznaky pro nicky – jen ty, které ještě nejsou v paměti (jeden dotaz). */
export async function fetchBadges(usernames) {
    const missing = [...new Set(usernames.map((u) => u.toLowerCase()))].filter((u) => !known.has(u));
    if (missing.length === 0 || disabled) return;
    for (const name of missing) known.set(name, []);
    const { data, error } = await supabase.rpc("badges_for", { p_usernames: usernames.filter((u) => missing.includes(u.toLowerCase())) });
    if (error) {
        disabled = true;
        return;
    }
    for (const row of data ?? []) known.set(row.username.toLowerCase(), row.badges ?? []);
}

/** Odznaky nicku z paměti (prázdné, dokud se nenačtou). */
export function badgesOf(username) {
    return known.get((username ?? "").toLowerCase()) ?? [];
}

/** Po změně v admin panelu – načíst znovu. */
export function forgetBadges(username = null) {
    if (username) known.delete(username.toLowerCase());
    else known.clear();
}

/** Štítek odznaku; compact = jen hvězda (hlavička – málo místa), název v title a pro čtečky. */
export function badgeChip(badge, compact = false) {
    const name = TEXTS[`badge_${badge}`] ?? badge;
    return h("span", {
        class: `user-badge user-badge--${badge}${compact ? " user-badge--compact" : ""}`,
        title: TEXTS[`badge_${badge}_title`] ?? badge,
        "aria-label": compact ? name : null,
        role: compact ? "img" : null,
    }, compact ? "★" : `★ ${name}`);
}

/** Připojí odznaky ke všem nickům v kořeni (prvky s data-badge-user). */
export async function applyBadges(root) {
    const targets = [...root.querySelectorAll("[data-badge-user]")];
    if (targets.length === 0) return;
    const paint = () => {
        for (const element of targets) {
            if (!element.isConnected || element.dataset.badgesShown === "1") continue;
            const badges = badgesOf(element.dataset.badgeUser);
            if (!known.has(element.dataset.badgeUser.toLowerCase())) continue;
            element.dataset.badgesShown = "1";
            const compact = element.dataset.badgeCompact === "1";
            if (badges.length > 0) element.after(...badges.filter((b) => BADGES.includes(b)).map((b) => badgeChip(b, compact)));
        }
    };
    paint();
    await fetchBadges(targets.map((element) => element.dataset.badgeUser));
    paint();
}

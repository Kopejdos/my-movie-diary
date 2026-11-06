// Veřejné profily a hledání uživatelů – logika (bez vykreslování).
// Data cizích uživatelů se čtou jen přes databázové funkce public_profile
// a search_public_profiles, které vrací výhradně veřejné profily.

import { supabase } from "./supabase.js";
import { SITE_URL } from "./config.js";
import { fetchCatalogData } from "./achievements.js";

/** Převede chybu Supabase na běžnou výjimku. */
function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Veřejný profil podle nicku: { profile: { username, memberSince }, data } pro výpočet
 * achievementů a statistik, nebo null (profil neexistuje nebo je soukromý).
 */
export async function fetchPublicProfile(username) {
    const [profile, catalog] = await Promise.all([
        supabase.rpc("public_profile", { p_username: username }).then(check),
        fetchCatalogData(),
    ]);
    if (!profile) return null;
    return {
        profile: { username: profile.username, memberSince: profile.member_since },
        data: { watches: profile.watches ?? [], ...catalog },
    };
}

/** Veřejné profily podle části nicku (od 2 znaků, nejvýš 10). */
export async function searchUsers(query) {
    if (query.trim().length < 2) return [];
    const rows = await supabase.rpc("search_public_profiles", { p_query: query.trim() }).then(check);
    return rows.map((r) => ({ username: r.username, memberSince: r.member_since }));
}

/** Adresa veřejného profilu – odkaz ke sdílení. */
export function profileUrl(username) {
    return `${SITE_URL}#/u/${encodeURIComponent(username)}`;
}

/**
 * Sdílení odkazu: na telefonu systémová nabídka (Web Share API), jinak kopie do schránky.
 * Vrací "shared" | "copied" | "cancelled".
 */
export async function shareProfile(username, title) {
    const url = profileUrl(username);
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            return "shared";
        } catch (error) {
            if (error?.name === "AbortError") return "cancelled";
            // jinak zkusit schránku
        }
    }
    await copyText(url);
    return "copied";
}

/** Kopie do schránky; starší / nezabezpečený prohlížeč přes skryté textové pole. */
async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    if (!ok) throw new Error("Copying is not supported in this browser.");
}

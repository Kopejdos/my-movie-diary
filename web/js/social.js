// Veřejné profily, hledání uživatelů a přátelé – logika (bez vykreslování).
// Data cizích uživatelů se čtou jen přes databázové funkce public_profile
// a search_people: plná data jen u veřejných profilů a u přátel (V3.4.1).
// Přátelství se mění jen přes funkce send_friend_request / respond_friend_request /
// remove_friend – pracují s nickem, ID účtů web nikdy nedostane.

import { supabase } from "./supabase.js";
import { SITE_URL } from "./config.js";
import { fetchCatalogData } from "./achievements.js";

/** Převede chybu Supabase na běžnou výjimku. */
function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Profil podle nicku:
 *   • veřejný nebo přítel → { profile: { username, memberSince }, friendship, data } (achievementy, statistiky),
 *   • cizí soukromý (jen pro přihlášené) → { profile: { username }, friendship, private: true } – žádná data,
 *   • neexistuje / soukromý pro nepřihlášeného / vlastní soukromý → null.
 * friendship = "none" | "friend" | "incoming" | "outgoing" | "self".
 */
export async function fetchPublicProfile(username) {
    const [profile, catalog] = await Promise.all([
        supabase.rpc("public_profile", { p_username: username }).then(check),
        fetchCatalogData(),
    ]);
    if (!profile) return null;
    const friendship = profile.friendship ?? "none";
    if (profile.private) {
        return { profile: { username: profile.username }, friendship, private: true };
    }
    return {
        profile: { username: profile.username, memberSince: profile.member_since, isPublic: profile.is_public !== false },
        friendship,
        data: { watches: profile.watches ?? [], ...catalog },
    };
}

/**
 * Lidé podle části nicku (od 2 znaků, nejvýš 10): veřejné profily a přátelé;
 * soukromý účet jen podle přesného nicku – bez data registrace (visible = false).
 */
export async function searchUsers(query) {
    if (query.trim().length < 2) return [];
    const rows = await supabase.rpc("search_people", { p_query: query.trim() }).then(check);
    return rows.map((r) => ({
        username: r.username,
        memberSince: r.member_since,
        visible: r.visible,
        friendship: r.friendship,
    }));
}

// ---------------------------------------------------------------------
// Přátelé (V3.4.1)
// ---------------------------------------------------------------------

let pendingCount = 0;          // počet přijatých žádostí – odznak v hlavičce a v záložce Friends

/** Počet nevyřízených přijatých žádostí (poslední známý). */
export function getPendingCount() {
    return pendingCount;
}

/** Oznámí zbytku aplikace změnu počtu žádostí (hlavička se překreslí). */
function setPendingCount(count) {
    if (count === pendingCount) return;
    pendingCount = count;
    document.dispatchEvent(new CustomEvent("friends-changed"));
}

/** Odhlášení – žádosti patří jinému účtu. */
export function resetFriends() {
    setPendingCount(0);
}

/**
 * Přátelé a žádosti: { friends, incoming, outgoing } – každá položka { username, since }.
 * Zároveň obnoví počet žádostí pro odznak.
 */
export async function fetchFriends() {
    const rows = await supabase.rpc("my_friends").then(check);
    const pick = (state) => rows
        .filter((r) => r.state === state)
        .map((r) => ({ username: r.username, since: r.since }));
    const result = { friends: pick("friend"), incoming: pick("incoming"), outgoing: pick("outgoing") };
    setPendingCount(result.incoming.length);
    return result;
}

/** Jen obnoví odznak žádostí (chyby se ignorují – odznak je doplněk). */
export async function refreshPendingCount() {
    try {
        await fetchFriends();
    } catch (error) {
        console.warn("Friend requests check failed", error);
    }
}

/**
 * Žádost o přátelství podle nicku.
 * Vrací "sent" | "accepted" | "already_friends" | "already_sent" | "not_found" | "self" | "limit".
 */
export async function sendFriendRequest(username) {
    const result = await supabase.rpc("send_friend_request", { p_username: username.trim() }).then(check);
    if (result === "accepted") refreshPendingCount();
    return result;
}

/** Přijetí / odmítnutí žádosti. Vrací "accepted" | "declined" | "not_found". */
export async function respondFriendRequest(username, accept) {
    const result = await supabase.rpc("respond_friend_request", { p_username: username, p_accept: accept }).then(check);
    refreshPendingCount();
    return result;
}

/** Odebrání přítele / zrušení žádosti. Vrací "removed" | "not_found". */
export async function removeFriend(username) {
    const result = await supabase.rpc("remove_friend", { p_username: username }).then(check);
    refreshPendingCount();
    return result;
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

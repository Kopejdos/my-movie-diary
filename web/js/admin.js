// Logika admin panelu: univerza a jejich filmy (přímo přes Supabase – pravidla RLS
// pustí jen správce) a akce přes Edge Function "admin" (TMDB, uživatelé).
// Čistá logika – nic nevykresluje.

import { supabase } from "./supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

// ---------------------------------------------------------------------
// Edge Function "admin"
// ---------------------------------------------------------------------

/** Zavolá akci funkce admin s přístupovým tokenem přihlášeného uživatele. */
async function callAdmin(action, payload = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");

    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body;
}

export const searchTmdb = (query) => callAdmin("search", { query });
export const addFilmFromTmdb = (tmdbId) => callAdmin("add-film", { tmdb_id: tmdbId });
export const listUsers = () => callAdmin("users");
export const setUserAdmin = (userId, isAdmin) => callAdmin("set-admin", { user_id: userId, is_admin: isAdmin });
export const deleteUser = (userId) => callAdmin("delete-user", { user_id: userId });

// ---------------------------------------------------------------------
// Univerza
// ---------------------------------------------------------------------

/** Všechna univerza pro správu, s počtem filmů. */
export async function listUniversesForAdmin() {
    return await supabase
        .from("universes")
        .select("id, slug, name, description, color, sort_order, items:universe_items(count)")
        .order("sort_order")
        .then(check);
}

/** Adresa univerza z názvu: "Star Wars: Saga" → "star-wars-saga". */
export function slugify(text) {
    return text
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

export async function createUniverse({ name, slug, description, color }) {
    const last = await supabase
        .from("universes").select("sort_order").order("sort_order", { ascending: false }).limit(1)
        .then(check);
    const sortOrder = (last[0]?.sort_order ?? 0) + 10;
    return await supabase
        .from("universes")
        .insert({ name, slug, description: description || null, color: color || null, sort_order: sortOrder })
        .select("id, slug")
        .single()
        .then(check);
}

export async function updateUniverse(id, fields) {
    await supabase.from("universes").update(fields).eq("id", id).then(check);
}

export async function deleteUniverse(id) {
    await supabase.from("universes").delete().eq("id", id).then(check);
}

/** Prohodí pořadí dvou univerz (posun nahoru / dolů na přehledu). */
export async function swapUniverseOrder(a, b) {
    await Promise.all([
        supabase.from("universes").update({ sort_order: b.sort_order }).eq("id", a.id).then(check),
        supabase.from("universes").update({ sort_order: a.sort_order }).eq("id", b.id).then(check),
    ]);
}

// ---------------------------------------------------------------------
// Filmy v univerzu
// ---------------------------------------------------------------------

/** Přidá film (už uložený v films) na konec univerza. */
export async function addUniverseItem(universeId, tmdbId, { group = null, optional = false } = {}) {
    const last = await supabase
        .from("universe_items").select("release_order")
        .eq("universe_id", universeId).order("release_order", { ascending: false }).limit(1)
        .then(check);
    await supabase.from("universe_items").insert({
        universe_id: universeId,
        tmdb_id: tmdbId,
        release_order: (last[0]?.release_order ?? 0) + 1,
        group_label: group || null,
        is_optional: optional,
    }).then(check);
}

export async function updateUniverseItem(id, fields) {
    await supabase.from("universe_items").update(fields).eq("id", id).then(check);
}

export async function removeUniverseItem(id) {
    await supabase.from("universe_items").delete().eq("id", id).then(check);
}

/** Prohodí pořadí vydání dvou filmů v univerzu. */
export async function swapItemOrder(a, b) {
    await Promise.all([
        supabase.from("universe_items").update({ release_order: b.release_order }).eq("id", a.id).then(check),
        supabase.from("universe_items").update({ release_order: a.release_order }).eq("id", b.id).then(check),
    ]);
}

/** Nastaví film jako obal univerza (plakát na kartě, záběr v banneru). */
export async function setUniverseCover(universeId, tmdbId) {
    await updateUniverse(universeId, { cover_tmdb_id: tmdbId });
}

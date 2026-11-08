// Požadavky na filmy (V3.5.1) – logika, nic nevykresluje.
// Hledání v TMDB a založení požadavku jdou přes Edge Function "requests" (údaje o filmech
// si bere z TMDB sama), čtení a +1 přímo přes Supabase (pravidla RLS).

import { supabase } from "./supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

/** Nejvíc filmů v jednom požadavku a nevyřízených požadavků (stejně jako ve funkci requests). */
export const MAX_REQUEST_FILMS = 20;
export const MAX_OPEN_REQUESTS = 5;
export const MAX_NOTE = 300;

function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/** Chyba z funkce requests s kódem (limit, too_many…), podle kterého web ukáže text. */
export class RequestError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

/** Zavolá akci funkce requests s tokenem přihlášeného uživatele. */
async function callRequests(action, payload = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new RequestError("Not signed in", "not_signed_in");

    const response = await fetch(`${SUPABASE_URL}/functions/v1/requests`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new RequestError(body.error ?? `HTTP ${response.status}`, body.code ?? "error");
    return body;
}

/**
 * Hledání filmů v TMDB pro požadavek: [{ tmdb_id, title, year, poster_path, state }],
 * state = "in_catalog" (už je v MMD) | "mine" (už ho chci) | "pending" (čeká cizí požadavek) | "new".
 */
export function searchTmdbForRequest(query) {
    return callRequests("search", { query });
}

/** Založí požadavek na filmy. Vrací { request_id, requested, voted, in_catalog, already_mine, not_found }. */
export function createFilmRequest(tmdbIds, note) {
    return callRequests("create", { tmdb_ids: tmdbIds, note });
}

/**
 * Série TMDB, do které film patří (V3.5.2):
 * { movie, collection: { id, name, parts: [{ tmdb_id, title, year, poster_path, in_catalog }] } | null,
 *   in_mmd: { slug, name } | null (série už má kolekci), pending (na kolekci už čeká požadavek) }.
 */
export function fetchSeriesForRequest(tmdbId) {
    return callRequests("series", { tmdb_id: tmdbId });
}

/**
 * Požadavek na kolekci: jen díly jedné série (kontroluje funkce requests – jinak chyba
 * not_same_series), aspoň 2 filmy.
 */
export function createCollectionRequest(collectionId, tmdbIds, note) {
    return callRequests("create", { kind: "collection", tmdb_collection_id: collectionId, tmdb_ids: tmdbIds, note });
}

/**
 * Požadované filmy (všechny požadavky, bez jmen žadatelů):
 * [{ tmdb_id, title, release_date, poster_path, status, wants, i_want, requested_by_me, first_requested }].
 */
export async function fetchWantedFilms(query = "", status = null) {
    return await supabase
        .rpc("wanted_films", { p_query: query || null, p_status: status })
        .then(check);
}

/** Moje požadavky s filmy a stavem, nejnovější první. */
export async function fetchMyRequests() {
    const rows = await supabase
        .from("film_requests")
        .select("id, note, created_at, kind, collection_name, items:film_request_items(id, tmdb_id, title, release_date, poster_path, status, decided_at, universe:universes(slug, name, color))")
        .order("created_at", { ascending: false })
        .then(check);
    return rows.map((r) => ({ ...r, status: requestStatus(r.items) }));
}

/** Stav celého požadavku: pending (něco čeká) | added (vše přidáno) | rejected (vše zamítnuto) | partial. */
export function requestStatus(items) {
    if (items.some((i) => i.status === "pending")) return "pending";
    if (items.every((i) => i.status === "added")) return "added";
    if (items.every((i) => i.status === "rejected")) return "rejected";
    return "partial";
}

/** +1 u filmu, na který čeká požadavek (on = true), nebo jeho zrušení. */
export async function voteForFilm(tmdbId, on) {
    if (on) {
        await supabase.from("film_request_votes").insert({ tmdb_id: tmdbId }).then(check);
    } else {
        await supabase.from("film_request_votes").delete().eq("tmdb_id", tmdbId).then(check);
    }
}

/** Zruší vlastní požadavek, o kterém se ještě nerozhodlo. */
export async function cancelFilmRequest(id) {
    const rows = await supabase.from("film_requests").delete().eq("id", id).select("id").then(check);
    if (!rows || rows.length === 0) throw new Error("This request can no longer be canceled.");
}

/** Počet nevyřízených vlastních požadavků (limit MAX_OPEN_REQUESTS). */
export function openRequestCount(requests) {
    return requests.filter((r) => r.status === "pending").length;
}

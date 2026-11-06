// Hodnocení filmů (V3.2) – data.
// V databázi je score 1–10 (= hvězdičky × 2), na webu se ukazuje 0,5–5 ★.
// Vlastní hodnocení vidí jen autor; průměr všech uživatelů vrací funkce
// film_rating_stats (jen průměr a počet hlasů).

import { supabase } from "./supabase.js";

const MAX_IDS_PER_REQUEST = 1000;

function check({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
}

/** Vlastní hodnocení: Map tmdb_id → score (1–10). Nepřihlášený = prázdná mapa. */
export async function fetchMyRatings(signedIn) {
    if (!signedIn) return new Map();
    const rows = await supabase.from("ratings").select("tmdb_id, score").then(check);
    return new Map(rows.map((r) => [r.tmdb_id, r.score]));
}

/** Uloží (nebo změní) hodnocení filmu. score 1–10. */
export async function saveRating(tmdbId, score) {
    await supabase
        .from("ratings")
        .upsert({ tmdb_id: tmdbId, score }, { onConflict: "user_id,tmdb_id" })
        .then(check);
}

/** Smaže vlastní hodnocení filmu. */
export async function clearRating(tmdbId) {
    await supabase.from("ratings").delete().eq("tmdb_id", tmdbId).then(check);
}

/** Průměr uživatelů MMD: Map tmdb_id → { average (0,5–5), votes }. */
export async function fetchRatingStats(tmdbIds) {
    const ids = [...new Set(tmdbIds)];
    const result = new Map();
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
        const rows = await supabase
            .rpc("film_rating_stats", { p_ids: ids.slice(i, i + MAX_IDS_PER_REQUEST) })
            .then(check);
        for (const r of rows ?? []) result.set(r.tmdb_id, { average: Number(r.average), votes: r.votes });
    }
    return result;
}

/** score 1–10 → text hvězdiček („4.5“, „3“). */
export function starsText(score) {
    const stars = score / 2;
    return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

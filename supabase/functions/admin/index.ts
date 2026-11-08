// =====================================================================
// My Movie Diary – Edge Function "admin"
//
// Správcovské akce, které potřebují serverový klíč nebo TMDB token.
// Volá ji jen přihlášený správce (profiles.is_admin = true) – funkce si
// sama ověří přístupový token z hlavičky Authorization.
//
// POST { "action": "…", … }
//   search       { query }              → hledání filmů v TMDB
//   add-film     { tmdb_id }            → uloží film do tabulky films (detail z TMDB)
//   users        {}                     → seznam uživatelů (nick, e-mail, správce, počet zhlédnutí)
//   set-admin    { user_id, is_admin }  → udělí / odebere správce (ne sám sobě)
//   delete-user  { user_id }            → smaže účet i všechna jeho data (ne sám sebe)
//   reset-username { user_id }          → automatický nick + skrytý profil (V2.3, ne sám sobě)
//   requests     {}                     → nevyřízené požadavky na filmy s návrhem kolekce (V3.5.1)
//   request-decide { items: [{ id, approve, universe_id? }] }
//                                       → přijme (film do films, případně do kolekce) / zamítne;
//                                         rozhodnutí platí pro film ve všech požadavcích
//
// V nastavení funkce musí být vypnuté "Verify JWT" (ověřuje si přístup sama).
// =====================================================================

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Chyba, která se pošle správci s daným HTTP kódem. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

/** Klíč s plnými právy (starší projekty: SUPABASE_SERVICE_ROLE_KEY, novější: SUPABASE_SECRET_KEYS). */
function getServiceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    const key = parsed["default"] ?? Object.values(parsed)[0];
    if (key) return key;
  }
  throw new Error("No service key available in the Edge Function environment");
}

// ---------------------------------------------------------------------
// Ověření správce
// ---------------------------------------------------------------------

/** Z hlavičky Authorization zjistí uživatele a ověří, že je správce. Vrací jeho id. */
async function requireAdmin(db: SupabaseClient, request: Request): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session");

  const { data: profile } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_admin) throw new HttpError(403, "Administrators only");

  return data.user.id;
}

// ---------------------------------------------------------------------
// TMDB
// ---------------------------------------------------------------------

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${requireEnv("TMDB_READ_TOKEN")}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new HttpError(502, `TMDB ${response.status}`);
  return (await response.json()) as T;
}

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
}

interface TmdbMovieDetails extends TmdbSearchResult {
  runtime: number | null;
  backdrop_path: string | null;
  status: string;
  belongs_to_collection?: { id: number; name: string } | null;
  production_companies?: { id: number; name: string }[];
}

/** Hledání filmů podle názvu (prvních 12 výsledků). */
async function search(query: string) {
  if (!query?.trim()) return [];
  const data = await tmdbGet<{ results: TmdbSearchResult[] }>("/search/movie", {
    query: query.trim(),
    include_adult: "false",
    language: "en-US",
  });
  return data.results.slice(0, 12).map((r) => ({
    tmdb_id: r.id,
    title: r.title,
    original_title: r.original_title,
    year: r.release_date ? r.release_date.slice(0, 4) : null,
    poster_path: r.poster_path,
    overview: r.overview,
  }));
}

/** Stáhne detail filmu z TMDB a uloží ho do tabulky films. */
async function addFilm(db: SupabaseClient, tmdbId: number) {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, "Invalid tmdb_id");
  const d = await tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, { language: "en-US" });

  const film = {
    tmdb_id: d.id,
    title: d.title,
    original_title: d.original_title || null,
    release_date: d.release_date || null,
    runtime: d.runtime || null,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    overview: d.overview || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("films").upsert(film, { onConflict: "tmdb_id" });
  if (error) throw new Error(error.message);
  return { ...film, status: d.status };
}

// ---------------------------------------------------------------------
// Uživatelé
// ---------------------------------------------------------------------

async function listUsers(db: SupabaseClient) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);

  const [
    { data: profiles, error: profileError },
    { data: watches, error: watchError },
    { data: flagged, error: flaggedError },
  ] = await Promise.all([
    db.from("profiles").select("id, username, is_admin, is_public, created_at"),
    db.from("watches").select("user_id"),
    db.rpc("flagged_profile_ids"),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (watchError) throw new Error(watchError.message);
  if (flaggedError) throw new Error(flaggedError.message);
  const flaggedIds = new Set((flagged ?? []) as string[]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const watchCount = new Map<string, number>();
  for (const w of watches ?? []) watchCount.set(w.user_id, (watchCount.get(w.user_id) ?? 0) + 1);

  return data.users
    .map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        email: user.email ?? null,
        username: profile?.username ?? null,
        is_admin: profile?.is_admin ?? false,
        is_public: profile?.is_public ?? false,
        flagged: flaggedIds.has(user.id),        // nick porušuje pravidla (V2.3)
        provider: (user.app_metadata?.provider as string | undefined) ?? "email",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        watch_count: watchCount.get(user.id) ?? 0,
      };
    })
    .sort((a, b) => (a.username ?? "").localeCompare(b.username ?? ""));
}

async function setAdmin(db: SupabaseClient, selfId: string, userId: string, isAdmin: boolean) {
  if (userId === selfId) throw new HttpError(400, "You cannot change your own administrator role");
  const { error } = await db.from("profiles").update({ is_admin: isAdmin === true }).eq("id", userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function deleteUser(db: SupabaseClient, selfId: string, userId: string) {
  if (userId === selfId) throw new HttpError(400, "You cannot delete your own account here");
  // Smazání účtu smaže díky cizím klíčům (on delete cascade) i profil, zhlédnutí a watchlist
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Reset nicku (V2.3): automatický nick user_xxxxxxxx a skrytý veřejný profil.
 * Uživatel si při dalším otevření webu musí zvolit nový nick (web ho pošle do profilu).
 */
async function resetUsername(db: SupabaseClient, selfId: string, userId: string) {
  if (userId === selfId) throw new HttpError(400, "You cannot reset your own nickname here");
  const generated = "user_" + userId.replaceAll("-", "").slice(0, 8);
  const { error } = await db.from("profiles").update({ username: generated, is_public: false }).eq("id", userId);
  if (error) throw new Error(error.message);
  return { ok: true, username: generated };
}

// ---------------------------------------------------------------------
// Požadavky na filmy (V3.5.1)
// ---------------------------------------------------------------------

interface UniverseLite {
  id: number;
  slug: string;
  name: string;
  kind: string;
}

/** Slova, která se při porovnání studia s produkční společností ignorují. */
const COMPANY_STOP_WORDS = new Set([
  "the", "studio", "studios", "pictures", "picture", "films", "film", "entertainment",
  "productions", "production", "ltd", "inc", "company", "co",
]);

function companyTokens(name: string): string[] {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !COMPANY_STOP_WORDS.has(t));
}

/** Spustí úlohy s omezeným počtem souběžných běhů. */
async function mapLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

/**
 * Návrh kolekcí pro film:
 *   • stejná série v TMDB (belongs_to_collection) → kolekce, ve kterých už je jiný díl,
 *   • produkční společnost → studio stejného jména (Pixar, Marvel Studios → Marvel…).
 * Série první, pak studia.
 */
async function suggestCollections(db: SupabaseClient, tmdbId: number, universes: UniverseLite[]) {
  const details = await tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, { language: "en-US" });
  const byId = new Map(universes.map((u) => [u.id, u]));
  const suggestions = new Map<number, { universe_id: number; slug: string; name: string; kind: string; reason: string }>();

  if (details.belongs_to_collection) {
    const collection = await tmdbGet<{ name: string; parts: { id: number }[] }>(
      `/collection/${details.belongs_to_collection.id}`, { language: "en-US" });
    const partIds = collection.parts.map((p) => p.id).filter((id) => id !== tmdbId);
    if (partIds.length > 0) {
      const { data, error } = await db.from("universe_items").select("universe_id").in("tmdb_id", partIds);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const universe = byId.get(row.universe_id);
        if (universe && !suggestions.has(universe.id)) {
          suggestions.set(universe.id, { universe_id: universe.id, slug: universe.slug, name: universe.name, kind: universe.kind, reason: `Same series: ${collection.name}` });
        }
      }
    }
  }

  for (const company of details.production_companies ?? []) {
    const tokens = new Set(companyTokens(company.name));
    for (const universe of universes) {
      if (universe.kind !== "studio" || suggestions.has(universe.id)) continue;
      const core = companyTokens(universe.name);
      if (core.length > 0 && core.every((t) => tokens.has(t))) {
        suggestions.set(universe.id, { universe_id: universe.id, slug: universe.slug, name: universe.name, kind: universe.kind, reason: `Studio: ${company.name}` });
      }
    }
  }

  const rank = (kind: string) => ["series", "genre", "studio", "path"].indexOf(kind);
  return [...suggestions.values()].sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));
}

/** Nevyřízené požadavky: žadatel, poznámka, filmy (s počtem zájemců a návrhem kolekcí). */
async function listRequests(db: SupabaseClient) {
  const [{ data: items, error }, { data: universes, error: uError }, { data: votes, error: vError }] = await Promise.all([
    db.from("film_request_items")
      .select("id, tmdb_id, title, release_date, poster_path, status, request:film_requests(id, note, created_at, user_id)")
      .eq("status", "pending"),
    db.from("universes").select("id, slug, name, kind").order("sort_order"),
    db.from("film_request_votes").select("tmdb_id"),
  ]);
  if (error) throw new Error(error.message);
  if (uError) throw new Error(uError.message);
  if (vError) throw new Error(vError.message);

  // deno-lint-ignore no-explicit-any
  const rows = (items ?? []) as any[];
  const userIds = [...new Set(rows.map((r) => r.request?.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await db.from("profiles").select("id, username").in("id", userIds)
    : { data: [] };
  const nickOf = new Map((profiles ?? []).map((p) => [p.id, p.username]));

  const wants = new Map<number, number>();
  for (const r of rows) wants.set(r.tmdb_id, (wants.get(r.tmdb_id) ?? 0) + 1);
  for (const v of votes ?? []) if (wants.has(v.tmdb_id)) wants.set(v.tmdb_id, (wants.get(v.tmdb_id) ?? 0) + 1);

  // Návrhy kolekcí – každý film jen jednou, nejvýš 6 dotazů na TMDB najednou
  const filmIds = [...new Set(rows.map((r) => r.tmdb_id as number))];
  const suggestionList = await mapLimited(filmIds, 6, (id) =>
    suggestCollections(db, id, (universes ?? []) as UniverseLite[]).catch(() => []));
  const suggestionsOf = new Map(filmIds.map((id, i) => [id, suggestionList[i]]));

  const requests = new Map<number, { id: number; note: string | null; created_at: string; username: string | null; items: unknown[] }>();
  for (const r of rows) {
    const request = requests.get(r.request.id) ?? {
      id: r.request.id, note: r.request.note, created_at: r.request.created_at,
      username: nickOf.get(r.request.user_id) ?? null, items: [],
    };
    request.items.push({
      id: r.id, tmdb_id: r.tmdb_id, title: r.title, release_date: r.release_date, poster_path: r.poster_path,
      wants: wants.get(r.tmdb_id) ?? 1, suggestions: suggestionsOf.get(r.tmdb_id) ?? [],
    });
    requests.set(r.request.id, request);
  }
  return {
    requests: [...requests.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    universes: universes ?? [],
  };
}

/**
 * Rozhodnutí o filmech z požadavků. Přijetí: film do films (detail z TMDB), případně na konec
 * kolekce; všechny čekající položky s tímto filmem → added. Zamítnutí: → rejected.
 * Vrací i řádky do seedu – bez nich by film z kolekce smazal příští import.
 */
async function decideRequests(db: SupabaseClient, decisions: unknown) {
  if (!Array.isArray(decisions) || decisions.length === 0) throw new HttpError(400, "Nothing to decide");
  const ids = decisions.map((d) => Number(d?.id)).filter((id) => Number.isInteger(id));
  const { data: items, error } = await db.from("film_request_items").select("id, tmdb_id, status").in("id", ids);
  if (error) throw new Error(error.message);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const now = new Date().toISOString();
  const results = [];
  for (const decision of decisions) {
    const item = itemById.get(Number(decision?.id));
    if (!item || item.status !== "pending") continue;

    if (decision.approve !== true) {
      const { error: rejectError } = await db.from("film_request_items")
        .update({ status: "rejected", decided_at: now })
        .eq("tmdb_id", item.tmdb_id).eq("status", "pending");
      if (rejectError) throw new Error(rejectError.message);
      results.push({ tmdb_id: item.tmdb_id, status: "rejected" });
      continue;
    }

    const film = await addFilm(db, item.tmdb_id);
    const universeId = Number.isInteger(Number(decision.universe_id)) && Number(decision.universe_id) > 0
      ? Number(decision.universe_id) : null;
    let universe: { id: number; slug: string } | null = null;
    if (universeId) {
      const { data: u } = await db.from("universes").select("id, slug").eq("id", universeId).maybeSingle();
      universe = u;
      const { data: existing } = await db.from("universe_items").select("id")
        .eq("universe_id", universeId).eq("tmdb_id", item.tmdb_id).maybeSingle();
      if (u && !existing) {
        const { data: last } = await db.from("universe_items").select("release_order")
          .eq("universe_id", universeId).order("release_order", { ascending: false }).limit(1);
        const { error: insertError } = await db.from("universe_items").insert({
          universe_id: universeId,
          tmdb_id: item.tmdb_id,
          release_order: (last?.[0]?.release_order ?? 0) + 1,
          is_upcoming: film.status !== "Released",
        });
        if (insertError) throw new Error(insertError.message);
      }
    }
    const { error: addError } = await db.from("film_request_items")
      .update({ status: "added", decided_at: now, universe_id: universe?.id ?? null })
      .eq("tmdb_id", item.tmdb_id).eq("status", "pending");
    if (addError) throw new Error(addError.message);

    const year = film.release_date ? Number(film.release_date.slice(0, 4)) : undefined;
    results.push({
      tmdb_id: item.tmdb_id,
      status: "added",
      title: film.title,
      universe: universe?.slug ?? null,
      // řádek do supabase/seed/universes.json (do kolekce universe)
      seed: universe ? JSON.stringify({ title: film.title, year, tmdb: film.tmdb_id }) : null,
    });
  }
  return { results };
}

// ---------------------------------------------------------------------
// Vstupní bod
// ---------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  try {
    const db = createClient(requireEnv("SUPABASE_URL"), getServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const selfId = await requireAdmin(db, request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    switch (body.action) {
      case "search":
        return json(await search(String(body.query ?? "")));
      case "add-film":
        return json(await addFilm(db, Number(body.tmdb_id)));
      case "users":
        return json(await listUsers(db));
      case "set-admin":
        return json(await setAdmin(db, selfId, String(body.user_id), body.is_admin === true));
      case "delete-user":
        return json(await deleteUser(db, selfId, String(body.user_id)));
      case "reset-username":
        return json(await resetUsername(db, selfId, String(body.user_id)));
      case "requests":
        return json(await listRequests(db));
      case "request-decide":
        return json(await decideRequests(db, body.items));
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

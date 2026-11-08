// =====================================================================
// My Movie Diary – Edge Function "requests" (V3.5.1)
//
// Požadavky na filmy od přihlášených uživatelů. Funkce si sama ověří
// přístupový token z hlavičky Authorization (jakýkoli přihlášený uživatel).
//
// POST { "action": "…", … }
//   search  { query }               → hledání v TMDB; u každého filmu, jestli už je
//                                     v MMD, jestli na něj čeká požadavek a jestli
//                                     ho uživatel už chce
//   create  { tmdb_ids[], note? }    → založí požadavek (1–20 filmů). Údaje o filmech
//                                     (název, rok, plakát) si funkce stáhne z TMDB sama.
//                                     Film, který už je v MMD, přeskočí; na film, na který
//                                     už čeká cizí požadavek, dá místo toho +1.
//
// Tajemství: TMDB_READ_TOKEN (stejné jako funkce tmdb a admin).
// V nastavení funkce musí být vypnuté "Verify JWT" (ověřuje si přístup sama).
// =====================================================================

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const TMDB_BASE = "https://api.themoviedb.org/3";
const MAX_FILMS = 20;          // filmů v jednom požadavku
const MAX_PENDING = 5;         // nevyřízených požadavků na uživatele
const MAX_NOTE = 300;

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

/** Chyba pro uživatele s HTTP kódem a strojově čitelným kódem (web podle něj ukáže text). */
class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
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

/** Z hlavičky Authorization zjistí přihlášeného uživatele. Vrací jeho id. */
async function requireUser(db: SupabaseClient, request: Request): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in", "not_signed_in");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session", "not_signed_in");
  return data.user.id;
}

// ---------------------------------------------------------------------
// TMDB
// ---------------------------------------------------------------------

interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  adult?: boolean;
}

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${requireEnv("TMDB_READ_TOKEN")}`, Accept: "application/json" },
  });
  if (response.status === 404) throw new HttpError(404, "Movie not found on TMDB", "not_found");
  if (!response.ok) throw new HttpError(502, `TMDB ${response.status}`, "tmdb");
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------
// Stav filmů v MMD (v katalogu / čeká požadavek / chci ho já)
// ---------------------------------------------------------------------

async function statusOf(db: SupabaseClient, userId: string, ids: number[]) {
  if (ids.length === 0) return { inCatalog: new Set<number>(), pending: new Set<number>(), mine: new Set<number>() };
  const [films, items, votes] = await Promise.all([
    db.from("films").select("tmdb_id").in("tmdb_id", ids),
    db.from("film_request_items").select("tmdb_id, status, request:film_requests(user_id)").in("tmdb_id", ids),
    db.from("film_request_votes").select("tmdb_id").eq("user_id", userId).in("tmdb_id", ids),
  ]);
  for (const result of [films, items, votes]) if (result.error) throw new Error(result.error.message);

  const inCatalog = new Set((films.data ?? []).map((f) => f.tmdb_id as number));
  const pending = new Set<number>();
  const mine = new Set((votes.data ?? []).map((v) => v.tmdb_id as number));
  for (const item of items.data ?? []) {
    if (item.status === "pending") pending.add(item.tmdb_id);
    // deno-lint-ignore no-explicit-any
    if ((item.request as any)?.user_id === userId && item.status === "pending") mine.add(item.tmdb_id);
  }
  return { inCatalog, pending, mine };
}

/** Hledání v TMDB (prvních 12 filmů bez filmů pro dospělé) s jejich stavem v MMD. */
async function search(db: SupabaseClient, userId: string, query: string) {
  const text = query.trim();
  if (text.length < 2) return [];
  const data = await tmdbGet<{ results: TmdbMovie[] }>("/search/movie", {
    query: text.slice(0, 100), include_adult: "false", language: "en-US",
  });
  const results = data.results.filter((r) => !r.adult).slice(0, 12);
  const { inCatalog, pending, mine } = await statusOf(db, userId, results.map((r) => r.id));
  return results.map((r) => ({
    tmdb_id: r.id,
    title: r.title,
    year: r.release_date ? r.release_date.slice(0, 4) : null,
    poster_path: r.poster_path,
    state: inCatalog.has(r.id) ? "in_catalog" : mine.has(r.id) ? "mine" : pending.has(r.id) ? "pending" : "new",
  }));
}

/** Založí požadavek. Vrací, co se s kterým filmem stalo. */
async function create(db: SupabaseClient, userId: string, tmdbIds: unknown, note: unknown) {
  const ids = [...new Set(Array.isArray(tmdbIds) ? tmdbIds.map(Number) : [])]
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) throw new HttpError(400, "Pick at least one movie", "empty");
  if (ids.length > MAX_FILMS) throw new HttpError(400, `At most ${MAX_FILMS} movies`, "too_many");
  const text = typeof note === "string" ? note.trim().slice(0, MAX_NOTE) : "";

  // Nevyřízené požadavky uživatele (aspoň jeden film čeká)
  const { data: open, error: openError } = await db
    .from("film_requests")
    .select("id, items:film_request_items!inner(status)")
    .eq("user_id", userId)
    .eq("items.status", "pending");
  if (openError) throw new Error(openError.message);

  const { inCatalog, pending, mine } = await statusOf(db, userId, ids);
  const toRequest = ids.filter((id) => !inCatalog.has(id) && !pending.has(id));
  const toVote = ids.filter((id) => pending.has(id) && !mine.has(id));

  if (toRequest.length > 0 && (open ?? []).length >= MAX_PENDING) {
    throw new HttpError(429, `At most ${MAX_PENDING} open requests`, "limit");
  }

  // Údaje o filmech z TMDB (ne z webu – nejdou podvrhnout)
  const details = await Promise.all(toRequest.map((id) =>
    tmdbGet<TmdbMovie>(`/movie/${id}`, { language: "en-US" }).catch(() => null)));
  const found = details.filter((d): d is TmdbMovie => d !== null && !d.adult);

  let requestId: number | null = null;
  if (found.length > 0) {
    const { data: request, error } = await db
      .from("film_requests")
      .insert({ user_id: userId, note: text || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    requestId = request.id;
    const { error: itemsError } = await db.from("film_request_items").insert(found.map((d) => ({
      request_id: requestId,
      tmdb_id: d.id,
      title: d.title,
      release_date: d.release_date || null,
      poster_path: d.poster_path,
    })));
    if (itemsError) throw new Error(itemsError.message);
  }

  if (toVote.length > 0) {
    const { error } = await db.from("film_request_votes")
      .upsert(toVote.map((id) => ({ tmdb_id: id, user_id: userId })), { onConflict: "tmdb_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return {
    request_id: requestId,
    requested: found.map((d) => d.id),
    voted: toVote,
    in_catalog: ids.filter((id) => inCatalog.has(id)),
    already_mine: ids.filter((id) => mine.has(id)),
    not_found: toRequest.filter((id) => !found.some((d) => d.id === id)),
  };
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
    const userId = await requireUser(db, request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    switch (body.action) {
      case "search":
        return json(await search(db, userId, String(body.query ?? "")));
      case "create":
        return json(await create(db, userId, body.tmdb_ids, body.note));
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

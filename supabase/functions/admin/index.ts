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
//   series-updates                      → nové díly sérií; kontrola TMDB, jen když od poslední uběhl den
//   series-check                        → kontrola sérií hned (V3.5.2.3)
//   series-decide { id, add, also? }    → přidat nalezený díl do kolekce (i do studií) / zahodit
//   series-dismiss-all                  → zahodit všechny čekající díly
//   add-item     { universe_id, tmdb_id, group?, optional? }
//                                       → film do films a do kolekce, zařazený podle data premiéry
//                                         (V3.5.2.1); sync-seed ho dopíše do seedu
//   users        {}                     → seznam uživatelů (nick, e-mail, správce, počet zhlédnutí)
//   set-admin    { user_id, is_admin }  → udělí / odebere správce (ne sám sobě)
//   delete-user  { user_id }            → smaže účet i všechna jeho data (ne sám sebe)
//   reset-username { user_id }          → automatický nick + skrytý profil (V2.3, ne sám sobě)
//   requests     {}                     → nevyřízené požadavky na filmy s návrhem kolekce (V3.5.1)
//   request-decide { items: [{ id, approve, universe_id? }] }
//                                       → přijme (film do films, případně do kolekce) / zamítne;
//                                         rozhodnutí platí pro film ve všech požadavcích
//   request-create-collection { tmdb_collection_id, name, tmdb_ids?, also? }
//                                       → nová kolekce ze série TMDB (V3.5.2): díly série
//                                         do films a do kolekce, čekající požadavky na ně → added;
//                                         also = kolekce studií, kam díly přidat taky (V3.5.2.1);
//                                         vrací blok do seedu (jen pro kontrolu)
//
// Filmy přidané do kolekcí mají universe_items.source = 'request' a řadí se podle data
// premiéry (V3.5.2.1) – import je nesmaže a scripts/sync-seed.sh je dopíše do seedu.
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
    tmdb_collection_id: d.belongs_to_collection?.id ?? 0,      // série TMDB (V3.5.2.3)
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
  let series: { id: number; name: string; parts: number } | null = null;     // série v TMDB (V3.5.2)

  if (details.belongs_to_collection) {
    const collection = await tmdbGet<{ name: string; parts: { id: number }[] }>(
      `/collection/${details.belongs_to_collection.id}`, { language: "en-US" });
    series = { id: details.belongs_to_collection.id, name: collection.name, parts: collection.parts.length };
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
  return {
    suggestions: [...suggestions.values()].sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name)),
    // série má vlastní kolekci v MMD, když aspoň jeden návrh přišel ze „stejné série“ a je to série
    series: series ? { ...series, inMmd: [...suggestions.values()].some((s) => s.kind === "series" && s.reason.startsWith("Same series")) } : null,
  };
}

/** Nevyřízené požadavky: žadatel, poznámka, filmy (s počtem zájemců a návrhem kolekcí). */
async function listRequests(db: SupabaseClient) {
  const [{ data: items, error }, { data: universes, error: uError }, { data: votes, error: vError }] = await Promise.all([
    db.from("film_request_items")
      .select("id, tmdb_id, title, release_date, poster_path, status, request:film_requests(id, note, created_at, user_id, kind, tmdb_collection_id, collection_name)")
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
    suggestCollections(db, id, (universes ?? []) as UniverseLite[]).catch(() => ({ suggestions: [], series: null })));
  const suggestionsOf = new Map(filmIds.map((id, i) => [id, suggestionList[i].suggestions]));
  const seriesOf = new Map(filmIds.map((id, i) => [id, suggestionList[i].series]));

  // Návrhy NOVÝCH kolekcí (V3.5.2): aspoň 2 požadované filmy ze stejné série TMDB,
  // která v MMD ještě nemá vlastní kolekci (napříč všemi čekajícími požadavky)
  const bySeries = new Map<number, { tmdb_collection_id: number; tmdb_name: string; name: string; parts: number; items: { id: number; tmdb_id: number; title: string }[] }>();
  for (const r of rows) {
    const series = seriesOf.get(r.tmdb_id);
    if (!series || series.inMmd || r.request?.kind === "collection") continue;
    const entry = bySeries.get(series.id) ?? {
      tmdb_collection_id: series.id, tmdb_name: series.name, name: series.name.replace(/\s+Collection$/i, ""),
      parts: series.parts, items: [],
    };
    entry.items.push({ id: r.id, tmdb_id: r.tmdb_id, title: r.title });
    bySeries.set(series.id, entry);
  }
  const newCollections = [...bySeries.values()].filter((c) => new Set(c.items.map((i) => i.tmdb_id)).size >= 2);

  // deno-lint-ignore no-explicit-any
  const requests = new Map<number, any>();
  for (const r of rows) {
    const request = requests.get(r.request.id) ?? {
      id: r.request.id, note: r.request.note, created_at: r.request.created_at,
      username: nickOf.get(r.request.user_id) ?? null, items: [],
      // požadavek na kolekci (V3.5.2)
      kind: r.request.kind ?? "films",
      tmdb_collection_id: r.request.tmdb_collection_id ?? null,
      collection_name: r.request.collection_name ?? null,
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
    new_collections: newCollections,
  };
}

/**
 * Vloží film do kolekce podle data premiéry (V3.5.2.1): před první film, který vyšel později
 * (filmy bez data jsou na konci); u cesty (path) na konec. Pozdější filmy se posunou o jedno místo.
 * extra = další údaje položky (franchise, group_label…). Film, který už v kolekci je, nechá být.
 */
async function insertChronological(
  db: SupabaseClient,
  universeId: number,
  film: { tmdb_id: number; release_date: string | null; status?: string },
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const [{ data: universe, error: uError }, { data: rows, error }] = await Promise.all([
    db.from("universes").select("kind").eq("id", universeId).maybeSingle(),
    db.from("universe_items").select("id, tmdb_id, release_order, film:films(release_date)")
      .eq("universe_id", universeId).order("release_order"),
  ]);
  if (uError) throw new Error(uError.message);
  if (error) throw new Error(error.message);
  if (!universe) return false;
  // deno-lint-ignore no-explicit-any
  const items = (rows ?? []) as any[];
  if (items.some((r) => r.tmdb_id === film.tmdb_id)) return false;

  let position = items.length;
  if (universe.kind !== "path" && film.release_date) {
    const later = items.findIndex((r) => !r.film?.release_date || r.film.release_date > film.release_date!);
    if (later >= 0) position = later;
  }
  const releaseOrder = position < items.length ? items[position].release_order : (items.at(-1)?.release_order ?? 0) + 1;
  await mapLimited(items.slice(position), 8, async (row) => {
    const { error: shiftError } = await db.from("universe_items")
      .update({ release_order: row.release_order + 1 }).eq("id", row.id);
    if (shiftError) throw new Error(shiftError.message);
  });
  const { error: insertError } = await db.from("universe_items").insert({
    universe_id: universeId,
    tmdb_id: film.tmdb_id,
    release_order: releaseOrder,
    is_upcoming: film.status !== undefined ? film.status !== "Released" || Boolean(film.release_date && film.release_date > new Date().toISOString().slice(0, 10)) : false,
    source: "request",          // import ji nesmaže, sync-seed ji dopíše do seedu
    ...extra,
  });
  if (insertError) throw new Error(insertError.message);
  return true;
}

/**
 * Údaje pro zařazení dílu série do kolekce studia (V3.5.2.1): série (franchise) podle dílů,
 * které už v kolekci jsou (jinak název nové kolekce), oddíl (group) podle sousedního filmu –
 * když studio dělí filmy po desetiletích („1980s“), dostane film svoje desetiletí.
 */
async function studioFields(db: SupabaseClient, universeId: number, partIds: number[], name: string, releaseDate: string | null) {
  const { data, error } = await db.from("universe_items")
    .select("tmdb_id, group_label, franchise, release_order, film:films(release_date)")
    .eq("universe_id", universeId).order("release_order");
  if (error) throw new Error(error.message);
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  const franchise = rows.find((r) => partIds.includes(r.tmdb_id) && r.franchise)?.franchise ?? name.slice(0, 60);
  const dated = rows.filter((r) => r.film?.release_date);
  const neighbour = releaseDate
    ? [...dated].reverse().find((r) => r.film.release_date <= releaseDate) ?? dated[0]
    : rows.at(-1);
  let group: string | null = neighbour?.group_label ?? null;
  if (group && /^\d{4}s$/.test(group)) {
    group = releaseDate ? `${releaseDate.slice(0, 3)}0s` : rows.at(-1)?.group_label ?? group;
  }
  return { franchise, group_label: group };
}

/**
 * Popis zkrácený na celé věty (V3.5.2.3): nejvýš max znaků, konec na tečce / vykřičníku /
 * otazníku mimo závorky; když se ani první věta nevejde, useknout na slově a přidat „…“.
 */
export function shortDescription(text: string | null | undefined, max = 200): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let depth = 0;
  let lastEnd = -1;
  for (let i = 0; i < max; i++) {
    const ch = clean[i];
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    else if (depth === 0 && ".!?".includes(ch) && (clean[i + 1] === " " || i + 1 === clean.length)) {
      // „Mr.“, „Dr.“, „St.“ a iniciály („J.“) konec věty nejsou
      const word = clean.slice(0, i).split(" ").pop() ?? "";
      if (!/^(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|[A-Z])$/.test(word)) lastEnd = i;
    }
  }
  if (lastEnd >= 40) return clean.slice(0, lastEnd + 1);
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:–-]+$/, "")}…`;
}

/** Žánry TMDB → naše kategorie (slug). */
const GENRE_TO_CATEGORY: Record<string, string> = {
  "Horror": "horror", "Science Fiction": "scifi", "Fantasy": "fantasy", "Animation": "animation",
  "Family": "family", "Action": "action-adventure", "Adventure": "action-adventure", "Comedy": "comedy",
  "Drama": "drama", "Crime": "crime-thriller", "Thriller": "crime-thriller", "Mystery": "crime-thriller", "War": "war",
};

/** Barvy nových kolekcí – vybírá se podle názvu, ať je barva pokaždé stejná. */
const COLLECTION_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#f43f5e"];

function slugFrom(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "collection";
}

/**
 * Nová kolekce (série) ze série TMDB: všechny díly do films, kolekce na konec přehledu,
 * díly v pořadí vydání, kategorie podle žánrů, čekající požadavky na tyto filmy → added.
 * Vrací i blok do seedu – jen pro kontrolu: do souboru ho dopíše skript scripts/sync-seed.sh.
 */
async function createCollectionFromSeries(db: SupabaseClient, tmdbCollectionId: number, rawName: unknown, onlyIds: unknown, alsoIds: unknown = []) {
  if (!Number.isInteger(tmdbCollectionId) || tmdbCollectionId <= 0) throw new HttpError(400, "Invalid collection");
  const collection = await tmdbGet<{ name: string; overview: string; parts: { id: number; release_date: string; genre_ids: number[] }[] }>(
    `/collection/${tmdbCollectionId}`, { language: "en-US" });
  const name = (typeof rawName === "string" && rawName.trim() ? rawName.trim() : collection.name.replace(/\s+Collection$/i, "")).slice(0, 80);

  // Díly v pořadí vydání (bez data na konci); u požadavku na kolekci jen ty, které uživatel vybral
  const only = new Set(Array.isArray(onlyIds) ? onlyIds.map(Number).filter(Number.isInteger) : []);
  const parts = [...collection.parts]
    .filter((p) => only.size === 0 || only.has(p.id))
    .sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"));
  if (parts.length === 0) throw new HttpError(400, "No movies of this series selected");
  const films = [];
  for (const part of parts) films.push(await addFilm(db, part.id));

  // Kategorie: nejčastější žánry dílů (nejvýš 2)
  const genreList = await tmdbGet<{ genres: { id: number; name: string }[] }>("/genre/movie/list", { language: "en-US" });
  const genreName = new Map(genreList.genres.map((g) => [g.id, g.name]));
  const counts = new Map<string, number>();
  for (const part of parts) {
    for (const slug of new Set(part.genre_ids.map((id) => GENRE_TO_CATEGORY[genreName.get(id) ?? ""]).filter(Boolean))) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  const categorySlugs = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([slug]) => slug);

  // Volná adresa a pořadí na konci sérií
  let slug = slugFrom(name);
  for (let n = 2; ; n++) {
    const { data: taken } = await db.from("universes").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${slugFrom(name).slice(0, 36)}-${n}`;
  }
  const { data: last } = await db.from("universes").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const color = COLLECTION_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COLLECTION_COLORS.length];
  const description = shortDescription(collection.overview, 200) || `Every ${name} movie.`;

  const { data: universe, error } = await db.from("universes").insert({
    slug, name, description, color, kind: "series",
    source: "app",              // nová kolekce z aplikace – sync-seed ji dopíše do seedu (V3.5.2.1)
    sort_order: (last?.[0]?.sort_order ?? 0) + 10,
    cover_tmdb_id: films[0]?.tmdb_id ?? null,
    tmdb_collection_id: tmdbCollectionId,     // hlídání nových dílů (V3.5.2.3)
  }).select("id, slug").single();
  if (error) throw new Error(error.message);

  const { error: itemsError } = await db.from("universe_items").insert(films.map((film, index) => ({
    universe_id: universe.id,
    tmdb_id: film.tmdb_id,
    release_order: index + 1,
    is_upcoming: film.status !== "Released",
    source: "request",          // import ji nesmaže, sync-seed ji dopíše do seedu (V3.5.2)
  })));
  if (itemsError) throw new Error(itemsError.message);

  if (categorySlugs.length > 0) {
    const { data: cats } = await db.from("categories").select("id, slug").in("slug", categorySlugs);
    if (cats && cats.length > 0) {
      await db.from("universe_categories").insert(cats.map((c) => ({ universe_id: universe.id, category_id: c.id })));
    }
  }

  // Díly i do kolekcí studií (V3.5.2.1) – např. Lethal Weapon → Warner Bros.
  const also = [...new Set(Array.isArray(alsoIds) ? alsoIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [])];
  const partIds = collection.parts.map((p) => p.id);
  const alsoAdded: { universe: string; films: number }[] = [];      // název kolekce studia, počet přidaných
  for (const studioId of also) {
    const { data: studio } = await db.from("universes").select("id, slug, name, kind").eq("id", studioId).maybeSingle();
    if (!studio || studio.kind === "path" || studio.id === universe.id) continue;
    let count = 0;
    for (const film of films) {
      const fields = await studioFields(db, studio.id, partIds, name, film.release_date);
      if (await insertChronological(db, studio.id, film, fields)) count++;
    }
    alsoAdded.push({ universe: studio.name, films: count });
  }

  const ids = films.map((f) => f.tmdb_id);
  const { data: decided, error: decideError } = await db.from("film_request_items")
    .update({ status: "added", decided_at: new Date().toISOString(), universe_id: universe.id })
    .in("tmdb_id", ids).eq("status", "pending")
    .select("id");
  if (decideError) throw new Error(decideError.message);

  // Blok do supabase/seed/universes.json (stejné formátování jako seed)
  const filmLines = films.map((film) => {
    const year = film.release_date ? Number(film.release_date.slice(0, 4)) : undefined;
    return `        ${JSON.stringify({ title: film.title, year, tmdb: film.tmdb_id }).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/,"/g, ", \"").replace(/":/g, "\": ")}`;
  });
  const seed = [
    "    {",
    `      "slug": ${JSON.stringify(slug)},`,
    `      "name": ${JSON.stringify(name)},`,
    `      "kind": "series",`,
    `      "categories": ${JSON.stringify(categorySlugs).replace(/,/g, ", ")},`,
    `      "color": ${JSON.stringify(color)},`,
    `      "description": ${JSON.stringify(description)},`,
    `      "films": [`,
    filmLines.join(",\n"),
    "      ]",
    "    },",
  ].join("\n");

  return { slug, name, films: films.length, requests_added: decided?.length ?? 0, also: alsoAdded, seed };
}

/**
 * Rozhodnutí o filmech z požadavků. Přijetí: film do films (detail z TMDB), případně na konec
 * kolekce; všechny čekající položky s tímto filmem → added. Zamítnutí: → rejected.
 * Vrací i řádky do seedu – jen pro kontrolu: položky mají source = 'request', import je nesmaže
 * a skript scripts/sync-seed.sh je do seedu dopíše sám (V3.5.2).
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
      if (u) await insertChronological(db, universeId, film);      // podle data premiéry (V3.5.2.1)
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
// Hlídání nových dílů sérií (V3.5.2.3)
//
// Kolekce typu série se porovnají se sériemi TMDB, ze kterých mají filmy:
//   • série, ze které kolekce vznikla (universes.tmdb_collection_id),
//   • každá série TMDB, ze které má kolekce aspoň 2 filmy.
// Díl série, který v kolekci chybí (a nebyl dřív zahozen), se uloží do series_updates
// a správce ho v admin panelu přidá nebo zahodí. Zrušené filmy (Canceled) se přeskočí.
// U filmů, které v kolekci jsou, se zároveň srovná datum premiéry podle TMDB
// (posunutá premiéra chystaného filmu se tak promítne sama).
// Kontrola se spustí sama, když správce otevře admin panel a od poslední uběhlo
// SERIES_CHECK_HOURS hodin; tlačítkem „Check now“ kdykoli.
// ---------------------------------------------------------------------

const SERIES_CHECK_HOURS = 20;
const SERIES_BACKFILL_PER_RUN = 150;     // kolik filmů bez zjištěné série doplnit za jednu kontrolu

interface CollectionPart {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

/** Kontrola sérií. force = i když od poslední neuběhl den. Vrací stav + nalezené díly. */
async function seriesCheck(db: SupabaseClient, force: boolean) {
  const { data: stateRow } = await db.from("admin_state").select("value").eq("key", "series_check").maybeSingle();
  const previous = (stateRow?.value ?? {}) as Record<string, unknown>;
  const lastAt = typeof previous.checked_at === "string" ? Date.parse(previous.checked_at) : 0;
  if (!force && Date.now() - lastAt < SERIES_CHECK_HOURS * 3600_000) {
    return { ...previous, ran: false, updates: await listSeriesUpdates(db) };
  }

  // 1. Kolekce typu série s filmy a jejich sériemi TMDB
  const { data: universes, error } = await db
    .from("universes")
    .select("id, slug, name, tmdb_collection_id, items:universe_items(tmdb_id, film:films(tmdb_id, release_date, tmdb_collection_id))")
    .eq("kind", "series");
  if (error) throw new Error(error.message);
  // deno-lint-ignore no-explicit-any
  const list = (universes ?? []) as any[];

  // 2. Filmy bez zjištěné série – doplnit z TMDB (po dávkách, ať kontrola netrvá dlouho)
  const filmCollection = new Map<number, number | null>();
  for (const u of list) for (const i of u.items ?? []) if (i.film) filmCollection.set(i.tmdb_id, i.film.tmdb_collection_id);
  const unknown = [...filmCollection.entries()].filter(([, c]) => c === null).map(([id]) => id);
  const batch = unknown.slice(0, SERIES_BACKFILL_PER_RUN);
  await mapLimited(batch, 8, async (tmdbId) => {
    try {
      const d = await tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, { language: "en-US" });
      const collectionId = d.belongs_to_collection?.id ?? 0;
      await db.from("films").update({ tmdb_collection_id: collectionId }).eq("tmdb_id", tmdbId);
      filmCollection.set(tmdbId, collectionId);
    } catch {
      // film v TMDB nenalezen – zkusí se příště
    }
  });

  // 3. Hlídané série každé kolekce
  const watched: { universeId: number; collectionId: number; have: Set<number> }[] = [];
  for (const u of list) {
    const have = new Set<number>((u.items ?? []).map((i: { tmdb_id: number }) => i.tmdb_id));
    const counts = new Map<number, number>();
    for (const id of have) {
      const c = filmCollection.get(id);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const ids = new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([c]) => c));
    if (u.tmdb_collection_id) ids.add(u.tmdb_collection_id);
    for (const collectionId of ids) watched.push({ universeId: u.id, collectionId, have });
  }

  // 4. Díly sérií z TMDB (každá série jednou)
  const collectionIds = [...new Set(watched.map((w) => w.collectionId))];
  const parts = new Map<number, CollectionPart[]>();
  await mapLimited(collectionIds, 8, async (collectionId) => {
    try {
      const c = await tmdbGet<{ parts: CollectionPart[] }>(`/collection/${collectionId}`, { language: "en-US" });
      parts.set(collectionId, c.parts ?? []);
    } catch {
      // série v TMDB zmizela / chyba sítě – přeskočit
    }
  });

  // 5a. Posunutá data premiér u filmů, které v kolekcích jsou
  const filmDates = new Map<number, string | null>();
  for (const u of list) for (const i of u.items ?? []) if (i.film) filmDates.set(i.tmdb_id, i.film.release_date);
  let datesUpdated = 0;
  const dateFixes = new Map<number, string>();
  for (const partList of parts.values()) {
    for (const part of partList) {
      if (!part.release_date || !filmDates.has(part.id)) continue;
      if (filmDates.get(part.id) !== part.release_date) dateFixes.set(part.id, part.release_date);
    }
  }
  await mapLimited([...dateFixes.entries()], 8, async ([tmdbId, date]) => {
    const { error: dateError } = await db.from("films").update({ release_date: date }).eq("tmdb_id", tmdbId);
    if (!dateError) datesUpdated++;
  });

  // 5b. Chybějící díly → series_updates (jen nové – už nabídnuté / zahozené znovu ne)
  const { data: known } = await db.from("series_updates").select("universe_id, tmdb_id");
  const seen = new Set((known ?? []).map((k) => `${k.universe_id}:${k.tmdb_id}`));
  const candidates: { universeId: number; collectionId: number; part: CollectionPart }[] = [];
  for (const w of watched) {
    for (const part of parts.get(w.collectionId) ?? []) {
      if (w.have.has(part.id) || seen.has(`${w.universeId}:${part.id}`)) continue;
      seen.add(`${w.universeId}:${part.id}`);
      candidates.push({ universeId: w.universeId, collectionId: w.collectionId, part });
    }
  }
  // Zrušené filmy pryč (stav je jen v detailu filmu)
  const status = new Map<number, string>();
  await mapLimited([...new Set(candidates.map((c) => c.part.id))], 8, async (tmdbId) => {
    try {
      status.set(tmdbId, (await tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, { language: "en-US" })).status ?? "");
    } catch {
      status.set(tmdbId, "");
    }
  });
  const rows = candidates
    .filter((c) => status.get(c.part.id) !== "Canceled")
    .map((c) => ({
      universe_id: c.universeId,
      tmdb_collection_id: c.collectionId,
      tmdb_id: c.part.id,
      title: c.part.title,
      release_date: c.part.release_date || null,
      poster_path: c.part.poster_path,
    }));
  if (rows.length > 0) {
    const { error: insertError } = await db.from("series_updates").upsert(rows, { onConflict: "universe_id,tmdb_id", ignoreDuplicates: true });
    if (insertError) throw new Error(insertError.message);
  }

  const state = {
    checked_at: new Date().toISOString(),
    series: collectionIds.length,
    collections: new Set(watched.map((w) => w.universeId)).size,
    found: rows.length,
    dates_updated: datesUpdated,
    backfill_left: Math.max(0, unknown.length - batch.length),
  };
  await db.from("admin_state").upsert({ key: "series_check", value: state, updated_at: state.checked_at });
  return { ...state, ran: true, updates: await listSeriesUpdates(db) };
}

/**
 * Čekající nové díly + kolekce studií, kam díl jde přidat taky (studio, ve kterém už jsou
 * jiné díly téže série – např. Warner Bros. u Lethal Weapon).
 */
async function listSeriesUpdates(db: SupabaseClient) {
  const { data, error } = await db
    .from("series_updates")
    .select("id, universe_id, tmdb_collection_id, tmdb_id, title, release_date, poster_path, found_at, universe:universes(slug, name, color)")
    .eq("status", "pending")
    .order("release_date", { ascending: false, nullsFirst: true });
  if (error) throw new Error(error.message);
  // deno-lint-ignore no-explicit-any
  const updates = (data ?? []) as any[];
  if (updates.length === 0) return [];

  const collectionIds = [...new Set(updates.map((u) => u.tmdb_collection_id))];
  const { data: films } = await db.from("films").select("tmdb_id, tmdb_collection_id").in("tmdb_collection_id", collectionIds);
  const filmToCollection = new Map((films ?? []).map((f) => [f.tmdb_id, f.tmdb_collection_id]));
  const { data: studioItems } = filmToCollection.size > 0
    ? await db.from("universe_items")
      .select("tmdb_id, universe:universes!inner(id, name, kind)")
      .in("tmdb_id", [...filmToCollection.keys()])
      .eq("universe.kind", "studio")
    : { data: [] };
  const studiosByCollection = new Map<number, Map<number, { universe_id: number; name: string; items: Set<number> }>>();
  // deno-lint-ignore no-explicit-any
  for (const row of (studioItems ?? []) as any[]) {
    const collectionId = filmToCollection.get(row.tmdb_id);
    if (!collectionId || !row.universe) continue;
    const studios = studiosByCollection.get(collectionId) ?? new Map();
    const studio = studios.get(row.universe.id) ?? { universe_id: row.universe.id, name: row.universe.name, items: new Set<number>() };
    studio.items.add(row.tmdb_id);
    studios.set(row.universe.id, studio);
    studiosByCollection.set(collectionId, studios);
  }
  return updates.map((u) => ({
    ...u,
    also: [...(studiosByCollection.get(u.tmdb_collection_id)?.values() ?? [])]
      .filter((s) => !s.items.has(u.tmdb_id) && s.universe_id !== u.universe_id)
      .map((s) => ({ universe_id: s.universe_id, name: s.name })),
  }));
}

/** Přidat nalezený díl do kolekce (a případně do studií), nebo zahodit. */
async function decideSeriesUpdate(db: SupabaseClient, id: number, add: boolean, alsoIds: unknown) {
  const { data: update, error } = await db.from("series_updates")
    .select("id, universe_id, tmdb_collection_id, tmdb_id, status").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!update) throw new HttpError(404, "Update not found");
  if (update.status !== "pending") return { id, status: update.status, also: [] };

  const alsoAdded: string[] = [];
  if (add) {
    const film = await addFilm(db, update.tmdb_id);
    await insertChronological(db, update.universe_id, film, { source: "admin" });
    const also = [...new Set(Array.isArray(alsoIds) ? alsoIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])];
    if (also.length > 0) {
      const { data: partFilms } = await db.from("films").select("tmdb_id").eq("tmdb_collection_id", update.tmdb_collection_id);
      const partIds = (partFilms ?? []).map((f) => f.tmdb_id);
      const { data: universe } = await db.from("universes").select("name").eq("id", update.universe_id).maybeSingle();
      for (const studioId of also) {
        const { data: studio } = await db.from("universes").select("id, name, kind").eq("id", studioId).maybeSingle();
        if (!studio || studio.kind === "path") continue;
        const fields = await studioFields(db, studio.id, partIds, universe?.name ?? film.title, film.release_date);
        if (await insertChronological(db, studio.id, film, { ...fields, source: "admin" })) alsoAdded.push(studio.name);
      }
    }
  }
  const status = add ? "added" : "dismissed";
  const { error: saveError } = await db.from("series_updates")
    .update({ status, decided_at: new Date().toISOString() }).eq("id", id);
  if (saveError) throw new Error(saveError.message);
  return { id, status, also: alsoAdded };
}

/** Zahodit všechny čekající díly (např. po první kontrole, která najde staré vynechané filmy). */
async function dismissAllSeriesUpdates(db: SupabaseClient) {
  const { data, error } = await db.from("series_updates")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("status", "pending").select("id");
  if (error) throw new Error(error.message);
  return { dismissed: data?.length ?? 0 };
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
      case "add-item": {
        // Film do kolekce z admin panelu (V3.5.2.1): detail z TMDB + zařazení podle data premiéry
        const film = await addFilm(db, Number(body.tmdb_id));
        const universeId = Number(body.universe_id);
        if (!Number.isInteger(universeId) || universeId <= 0) throw new HttpError(400, "Invalid universe_id");
        const added = await insertChronological(db, universeId, film, {
          group_label: typeof body.group === "string" && body.group.trim() ? body.group.trim().slice(0, 60) : null,
          is_optional: body.optional === true,
          source: "admin",
        });
        return json({ ...film, added });
      }
      case "series-updates":       // kontrola sérií, jen když od poslední uběhl den (V3.5.2.3)
        return json(await seriesCheck(db, false));
      case "series-check":         // kontrola hned („Check now“)
        return json(await seriesCheck(db, true));
      case "series-decide":
        return json(await decideSeriesUpdate(db, Number(body.id), body.add === true, body.also));
      case "series-dismiss-all":
        return json(await dismissAllSeriesUpdates(db));
      case "request-create-collection":
        return json(await createCollectionFromSeries(db, Number(body.tmdb_collection_id), body.name, body.tmdb_ids, body.also));
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

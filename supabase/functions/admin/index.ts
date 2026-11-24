// =====================================================================
// My Movie Diary – Edge Function "admin"
//
// Správcovské akce, které potřebují serverový klíč nebo TMDB token.
// Volá ji jen přihlášený správce (profiles.is_admin = true) – funkce si
// sama ověří přístupový token z hlavičky Authorization.
//
// POST { "action": "…", … }
//   search       { query }              → hledání filmů v TMDB
//   add-film     { tmdb_id }            → uloží film do tabulky films (detail z TMDB);
//                                         od V4.2.2 i s překlady názvu (film_translations)
//   series-updates                      → nové díly sérií; kontrola TMDB, jen když od poslední uběhl den
//   series-check                        → kontrola sérií hned (V3.5.2.3)
//   series-decide { id, add, also? }    → přidat nalezený díl do kolekce (i do studií) / zahodit
//   series-dismiss-all                  → zahodit všechny čekající díly
//   add-item     { universe_id, tmdb_id, group?, optional? }
//                                       → film do films a do kolekce, zařazený podle data premiéry
//                                         (V3.5.2.1); sync-seed ho dopíše do seedu
//   users        {}                     → seznam uživatelů (nick, e-mail, správce, počet zhlédnutí;
//                                         od V4.4 i odznaky a úroveň z databáze)
//   set-admin    { user_id, is_admin }  → udělí / odebere správce (ne sám sobě) – od V4.4.6 jen vlastník
//   delete-user  { user_id }            → smaže účet i všechna jeho data (ne sám sebe; správce jen vlastník)
//   reset-username { user_id }          → automatický nick + skrytý profil (V2.3, ne sám sobě; správce jen vlastník)
//
// Admin tým (V4.4.6): vlastník (profiles.is_owner, nastavuje se jen v SQL) je jediný, kdo smí
// měnit roli správce a mazat / resetovat jiné správce; vlastníka nesmí změnit nikdo z webu.
// Akce, které něco mění, se zapisují do deníku správců (admin_log – záložka Activity).
//   requests     {}                     → nevyřízené požadavky na filmy s návrhem kolekce (V3.5.1;
//                                         od V4.3.5 i kolekce režiséra podle režiséra filmu)
//   request-decide { items: [{ id, approve, universe_id?, reason?, note?, only_this? }] }
//                                       → přijme (film do films, případně do kolekce) / zamítne;
//                                         rozhodnutí platí pro film ve všech požadavcích – zamítnutí
//                                         s only_this jen pro tuto položku (požadavek na kolekci);
//                                         reason + note = důvod zamítnutí pro uživatele (V4.3.3)
//   people-search { query }            → hledání osoby v TMDB (V4.3.2 – stavitel kolekcí)
//   person-films { person_id, second_person_id? }
//                                       → filmografie osoby / dvou osob s rolemi (průnik = Together)
//   company-search { query }, keyword-search { query }
//                                       → hledání studia / klíčového slova v TMDB
//   discover-films { company_id | keyword_id, sort: popularity | year | votes, pages? }
//                                       → filmy studia / klíčového slova (TMDB discover, až 10 × 20)
//   create-collection { name, description?, kind?, tmdb_collection_id?, items[], also?, reject_ids? }
//                                       → nová kolekce z editoru (V4.3.1) – schválení požadavku na kolekci
//                                         (série TMDB i vlastní): filmy v daném pořadí s oddílem, sérií,
//                                         popiskem; čekající požadavky na ně → added, reject_ids → rejected
//   collection-names { universe_ids? }  → názvy sérií v jazycích aplikace z TMDB (V4.3.4, záložka
//                                         Translations): název série TMDB, jinak název prvního filmu
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

/** Přihlášený správce: id a jestli je vlastník (V4.4.6). */
interface AdminActor {
  id: string;
  isOwner: boolean;
}

/** Z hlavičky Authorization zjistí uživatele a ověří, že je správce. */
async function requireAdmin(db: SupabaseClient, request: Request): Promise<AdminActor> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Invalid session");

  const { data: profile } = await db
    .from("profiles")
    .select("*")                      // is_owner jen po migraci V4.4.6 – * nespadne ani bez ní
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_admin) throw new HttpError(403, "Administrators only");

  return { id: data.user.id, isOwner: profile.is_owner === true };
}

/**
 * Smí správce (actor) měnit účet uživatele (target)? Vlastníka nikdo z webu, jiného správce
 * jen vlastník, běžného uživatele kterýkoli správce. Sám sebe tu nikdo (V4.4.6).
 */
export function canManageUser(actor: AdminActor, target: { id: string; is_admin?: boolean; is_owner?: boolean } | null): string | null {
  if (!target) return "User not found";
  if (target.id === actor.id) return "You cannot change your own account here";
  if (target.is_owner) return "The owner account can only be changed in SQL";
  if (target.is_admin && !actor.isOwner) return "Only the owner can change other administrators";
  return null;
}

async function targetProfile(db: SupabaseClient, userId: string) {
  const { data } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data ? { id: userId, is_admin: data.is_admin === true, is_owner: data.is_owner === true, username: data.username as string | null } : null;
}

/** Zápis do deníku správců (V4.4.6). Chyba zápisu akci nezastaví (např. bez migrace). */
async function logAction(db: SupabaseClient, actor: AdminActor, action: string, target: string | null, details: Record<string, unknown> | null = null) {
  const { error } = await db.from("admin_log").insert({ admin_id: actor.id, action, target: target?.slice(0, 200) ?? null, details });
  if (error) console.error(`admin_log: ${error.message}`);
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
  genres?: { id: number; name: string }[];
  translations?: TmdbTranslations;    // s append_to_response=translations (V4.2.2)
  original_language?: string;         // V4.4.6
  videos?: { results: TmdbVideo[] };  // s append_to_response=videos (V4.4.6)
}

interface TmdbVideo { key: string; site: string; type: string; official?: boolean; iso_639_1?: string; published_at?: string }

/** Nejlepší trailer na YouTube (stejné pravidlo jako v Edge Function tmdb, V4.4.6). */
function pickTrailer(videos: { results: TmdbVideo[] } | undefined): string | null {
  const list = (videos?.results ?? []).filter((v) =>
    v.site === "YouTube" && /^[A-Za-z0-9_-]{6,20}$/.test(v.key) && (v.type === "Trailer" || v.type === "Teaser"));
  if (list.length === 0) return null;
  const score = (v: TmdbVideo) => (v.type === "Trailer" ? 8 : 0) + (v.official ? 4 : 0) + (v.iso_639_1 === "en" ? 2 : 0);
  list.sort((a, b) => score(b) - score(a) || (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  return list[0].key;
}

// ---------------------------------------------------------------------
// Překlady názvů filmů (V4.2.2) – stejná pravidla jako v Edge Function tmdb
// ---------------------------------------------------------------------

interface TmdbTranslations {
  translations: { iso_639_1: string; iso_3166_1: string; data: { title?: string; overview?: string } }[];
}

/** Jazyky aplikace a země, jejichž překlad má přednost (španělština ze Španělska…). */
const TRANSLATION_REGIONS: Record<string, string[]> = {
  cs: ["CZ"],
  de: ["DE", "AT", "CH"],
  es: ["ES", "MX"],
  uk: ["UA"],
};

const regionRank = (regions: string[], region: string) => {
  const index = regions.indexOf(region);
  return index === -1 ? regions.length : index;
};

/** Řádky film_translations z překladů TMDB (název stejný jako anglický se neukládá). */
function pickTranslations(tmdbId: number, englishTitle: string, data: TmdbTranslations | undefined) {
  const all = data?.translations ?? [];
  const rows: { tmdb_id: number; lang: string; title: string | null; overview: string | null }[] = [];
  for (const [lang, regions] of Object.entries(TRANSLATION_REGIONS)) {
    const candidates = all
      .filter((t) => t.iso_639_1 === lang)
      .sort((a, b) => regionRank(regions, a.iso_3166_1) - regionRank(regions, b.iso_3166_1));
    const title = candidates.map((t) => t.data?.title?.trim()).find(Boolean) ?? null;
    const overview = candidates.map((t) => t.data?.overview?.trim()).find(Boolean) ?? null;
    const localTitle = title && title !== englishTitle ? title : null;
    if (localTitle || overview) rows.push({ tmdb_id: tmdbId, lang, title: localTitle, overview });
  }
  return rows;
}

// ---------------------------------------------------------------------
// Překlady názvů kolekcí (V4.3.4) – název série TMDB v jazycích aplikace
// ---------------------------------------------------------------------

interface TmdbCollectionTranslations {
  translations: { iso_639_1: string; iso_3166_1: string; data: { title?: string; name?: string; overview?: string } }[];
}

/** Slova, která TMDB přidává k názvu série („Vetřelec (kolekce)“, „Matrix Filmreihe“, „Colección Alien“). */
const COLLECTION_WORDS = "kolekce|filmová série|série|filmreihe|reihe|sammlung|kollektion|collection|colección|coleccion|saga de películas|колекція|кіноколекція|збірка|серія фільмів|фільмова серія";
const COLLECTION_SUFFIX = new RegExp(`[\\s\\-–—:,]+\\(?\\s*(?:${COLLECTION_WORDS})\\s*\\)?$`, "iu");
const COLLECTION_PREFIX = new RegExp(`^\\(?(?:${COLLECTION_WORDS})\\)?(?:\\s+(?:de|del|de la|z|aus))?[\\s:\\-–—]+`, "iu");

/** Název série bez „kolekce / Filmreihe / Colección“ a uvozovek. */
export function cleanCollectionName(name: string | null | undefined): string | null {
  let clean = (name ?? "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) clean = clean.replace(COLLECTION_SUFFIX, "").replace(COLLECTION_PREFIX, "").trim();
  clean = clean.replace(/^[«„“"']+|[»“”"']+$/g, "").trim();
  return clean.length >= 2 ? clean.slice(0, 80) : null;
}

/** Názvy (a popisy) série TMDB v jazycích aplikace – { cs: { name, overview } … }; prázdné vynechá. */
async function collectionTranslations(tmdbCollectionId: number) {
  const data = await tmdbGet<TmdbCollectionTranslations>(`/collection/${tmdbCollectionId}/translations`);
  const all = data?.translations ?? [];
  const result: Record<string, { name: string | null; overview: string | null }> = {};
  for (const [lang, regions] of Object.entries(TRANSLATION_REGIONS)) {
    const candidates = all
      .filter((t) => t.iso_639_1 === lang)
      .sort((a, b) => regionRank(regions, a.iso_3166_1) - regionRank(regions, b.iso_3166_1));
    const name = candidates.map((t) => cleanCollectionName(t.data?.title ?? t.data?.name)).find(Boolean) ?? null;
    const overview = candidates.map((t) => t.data?.overview?.trim()).find(Boolean) ?? null;
    if (name || overview) result[lang] = { name, overview };
  }
  return result;
}

/** Všechny řádky dotazu po stránkách (PostgREST vrací nejvýš 1 000 najednou). */
async function selectAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

/** Název pro porovnání (malá písmena, jen písmena a číslice). */
const plainName = (text: string | null | undefined) => (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Návrhy názvů kolekcí typu série v jazycích aplikace (V4.3.4, záložka Translations):
 *   • série TMDB (universes.tmdb_collection_id, jinak série, do které patří aspoň 2 filmy a aspoň
 *     polovina filmů kolekce – MCU tak nedostane název „Avengers“) → její přeložený název bez „kolekce“,
 *   • jinak (nebo když TMDB překlad nemá) název prvního filmu v daném jazyce – jen když se kolekce
 *     jmenuje stejně jako první film (Happy Death Day, Alien, Saw; ne MCU → Iron Man).
 * Vrací [{ universe_id, slug, tmdb_collection_id, names: { cs: { name, from: "series" | "film" } … } }].
 */
async function collectionNames(db: SupabaseClient, rawIds: unknown) {
  const onlyIds = new Set(Array.isArray(rawIds) ? rawIds.map(Number).filter(Number.isInteger) : []);
  const { data: universes, error } = await db.from("universes")
    .select("id, slug, name, kind, tmdb_collection_id")
    .eq("kind", "series");
  if (error) throw new Error(error.message);
  const series = (universes ?? []).filter((u) => onlyIds.size === 0 || onlyIds.has(u.id));
  if (series.length === 0) return [];
  const seriesIds = series.map((u) => u.id);

  type ItemRow = { universe_id: number; tmdb_id: number; release_order: number; is_optional: boolean; film: { title: string; tmdb_collection_id: number | null } | null };
  const items = await selectAll<ItemRow>((from, to) => db.from("universe_items")
    .select("universe_id, tmdb_id, release_order, is_optional, film:films(title, tmdb_collection_id)")
    .in("universe_id", seriesIds)
    .order("universe_id").order("release_order")
    .range(from, to) as unknown as PromiseLike<{ data: ItemRow[] | null; error: { message: string } | null }>);

  const byUniverse = new Map<number, ItemRow[]>();
  for (const item of items) {
    if (!byUniverse.has(item.universe_id)) byUniverse.set(item.universe_id, []);
    byUniverse.get(item.universe_id)!.push(item);
  }

  // První film kolekce (bez volitelných) – jen když se kolekce jmenuje podle něj
  const firstFilm = new Map<number, number>();
  for (const universe of series) {
    const rows = byUniverse.get(universe.id) ?? [];
    const first = rows.find((r) => !r.is_optional) ?? rows[0];
    const name = plainName(universe.name);
    if (first && name.length >= 2 && plainName(first.film?.title) === name) firstFilm.set(universe.id, first.tmdb_id);
  }
  type TitleRow = { tmdb_id: number; lang: string; title: string | null };
  const firstIds = [...new Set(firstFilm.values())];
  const titles = firstIds.length === 0 ? [] : await selectAll<TitleRow>((from, to) => db.from("film_translations")
    .select("tmdb_id, lang, title")
    .in("tmdb_id", firstIds)
    .range(from, to) as unknown as PromiseLike<{ data: TitleRow[] | null; error: { message: string } | null }>);
  const titleOf = new Map(titles.filter((t) => t.title).map((t) => [`${t.tmdb_id}:${t.lang}`, t.title as string]));

  return await mapLimited(series, 6, async (universe) => {
    const rows = byUniverse.get(universe.id) ?? [];
    let collectionId: number | null = universe.tmdb_collection_id ?? null;
    if (!collectionId) {
      const counts = new Map<number, number>();
      for (const row of rows) {
        const id = row.film?.tmdb_collection_id;
        if (id && id > 0) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2 && best[1] * 2 >= rows.length) collectionId = best[0];
    }

    let fromSeries: Record<string, { name: string | null; overview: string | null }> = {};
    if (collectionId) {
      try {
        fromSeries = await collectionTranslations(collectionId);
      } catch (error) {
        console.error(`collection ${collectionId}:`, error);
      }
    }

    const names: Record<string, { name: string; from: "series" | "film" }> = {};
    const first = firstFilm.get(universe.id);
    for (const lang of Object.keys(TRANSLATION_REGIONS)) {
      const seriesName = fromSeries[lang]?.name;
      const filmName = first ? titleOf.get(`${first}:${lang}`) : undefined;
      if (seriesName) names[lang] = { name: seriesName, from: "series" };
      else if (filmName) names[lang] = { name: filmName.slice(0, 80), from: "film" };
    }
    return { universe_id: universe.id, slug: universe.slug, tmdb_collection_id: collectionId, names };
  });
}

/**
 * Nová kolekce ze série TMDB dostane hned přeložený název a popis (V4.3.4) – jen do tabulky
 * universe_translations (source = 'tmdb'); chyba TMDB kolekci nezastaví.
 */
async function saveCollectionTranslations(db: SupabaseClient, universeId: number, tmdbCollectionId: number) {
  try {
    const translations = await collectionTranslations(tmdbCollectionId);
    const rows = Object.entries(translations).map(([lang, t]) => ({
      universe_id: universeId,
      lang,
      name: t.name,
      description: t.overview ? shortDescription(t.overview, 200) || null : null,
      source: "tmdb",
    })).filter((row) => row.name || row.description);
    if (rows.length > 0) {
      const { error } = await db.from("universe_translations").upsert(rows, { onConflict: "universe_id,lang" });
      if (error) console.error("universe_translations:", error.message);
    }
  } catch (error) {
    console.error(`collection translations ${tmdbCollectionId}:`, error);
  }
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
    release_date: r.release_date || null,      // zařazení podle premiéry v editoru (V4.3.1)
    poster_path: r.poster_path,
    overview: r.overview,
  }));
}

// ---------------------------------------------------------------------
// Stavitel kolekcí (V4.3.2) – kandidáti na kolekci z osoby, dvou osob, studia nebo
// klíčového slova TMDB. Vrací jen seznam filmů k zaškrtnutí; kolekci pak založí
// create-collection (stejně jako schválení požadavku).
// ---------------------------------------------------------------------

interface TmdbCredit {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  video?: boolean;
  adult?: boolean;
  character?: string;
  job?: string;
}

/** Kandidát pro web: film + role osob (a = první, b = druhá osoba). */
interface Candidate {
  tmdb_id: number;
  title: string;
  original_title: string;
  release_date: string | null;
  year: string | null;
  poster_path: string | null;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  roles: { a: string[]; b: string[] };
  in_catalog: boolean;
}

const candidateOf = (m: TmdbCredit): Candidate => ({
  tmdb_id: m.id,
  title: m.title,
  original_title: m.original_title,
  release_date: m.release_date || null,
  year: m.release_date ? m.release_date.slice(0, 4) : null,
  poster_path: m.poster_path,
  vote_count: m.vote_count ?? 0,
  popularity: m.popularity ?? 0,
  genre_ids: m.genre_ids ?? [],
  roles: { a: [], b: [] },
  in_catalog: false,
});

/** Doplní, které filmy už v MMD jsou (tabulka films). */
async function markInCatalog(db: SupabaseClient, films: Candidate[]) {
  const ids = films.map((f) => f.tmdb_id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from("films").select("tmdb_id").in("tmdb_id", ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    const known = new Set((data ?? []).map((r) => r.tmdb_id));
    for (const film of films) if (known.has(film.tmdb_id)) film.in_catalog = true;
  }
  return films;
}

/** Hledání osoby v TMDB (režisér, herec…). */
async function searchPeople(query: string) {
  if (!query?.trim()) return [];
  const data = await tmdbGet<{ results: { id: number; name: string; known_for_department: string; profile_path: string | null; known_for?: { title?: string; name?: string }[] }[] }>(
    "/search/person", { query: query.trim(), include_adult: "false", language: "en-US" });
  return data.results.slice(0, 10).map((p) => ({
    id: p.id,
    name: p.name,
    department: p.known_for_department,
    profile_path: p.profile_path,
    known_for: (p.known_for ?? []).map((k) => k.title ?? k.name).filter(Boolean).slice(0, 3),
  }));
}

/**
 * Filmografie jedné nebo dvou osob. Role: acting (herec), directing (režie), writing, crew (ostatní).
 * U dvou osob vrací všechny filmy obou – web z rolí pozná průnik (Together) i sólovky.
 * Bez videí a filmů pro dospělé; dokumenty, počet hlasů a roky filtruje web.
 */
async function personFilms(db: SupabaseClient, personId: number, secondId: number | null) {
  if (!Number.isInteger(personId) || personId <= 0) throw new HttpError(400, "Invalid person");
  const ids = secondId && Number.isInteger(secondId) && secondId > 0 && secondId !== personId ? [personId, secondId] : [personId];
  const people = await Promise.all(ids.map((id) => tmdbGet<{ id: number; name: string }>(`/person/${id}`, { language: "en-US" })));
  const credits = await Promise.all(ids.map((id) =>
    tmdbGet<{ cast: TmdbCredit[]; crew: TmdbCredit[] }>(`/person/${id}/movie_credits`, { language: "en-US" })));

  const films = new Map<number, Candidate>();
  credits.forEach((credit, index) => {
    const key = index === 0 ? "a" : "b";
    const add = (m: TmdbCredit, role: string) => {
      if (m.adult || m.video) return;
      const film = films.get(m.id) ?? candidateOf(m);
      if (!film.roles[key].includes(role)) film.roles[key].push(role);
      films.set(m.id, film);
    };
    for (const m of credit.cast ?? []) add(m, "acting");
    for (const m of credit.crew ?? []) {
      add(m, m.job === "Director" ? "directing" : ["Screenplay", "Writer", "Story"].includes(m.job ?? "") ? "writing" : "crew");
    }
  });

  const list = [...films.values()].sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"));
  return { people: people.map((p) => ({ id: p.id, name: p.name })), films: await markInCatalog(db, list) };
}

/** Hledání studia (produkční společnosti) nebo klíčového slova v TMDB. */
async function searchCompanyOrKeyword(kind: "company" | "keyword", query: string) {
  if (!query?.trim()) return [];
  const data = await tmdbGet<{ results: { id: number; name: string; origin_country?: string; logo_path?: string | null }[] }>(
    `/search/${kind}`, { query: query.trim() });
  return data.results.slice(0, 12).map((r) => ({ id: r.id, name: r.name, country: r.origin_country ?? null, logo_path: r.logo_path ?? null }));
}

/**
 * Filmy studia nebo klíčového slova (TMDB discover), seřazené podle popularity nebo roku.
 * pages = kolik stránek po 20 filmech (1–10).
 */
async function discoverFilms(db: SupabaseClient, body: Record<string, unknown>) {
  const companyId = Number(body.company_id);
  const keywordId = Number(body.keyword_id);
  const params: Record<string, string> = {
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: body.sort === "year" ? "primary_release_date.asc" : body.sort === "votes" ? "vote_count.desc" : "popularity.desc",
  };
  if (Number.isInteger(companyId) && companyId > 0) params.with_companies = String(companyId);
  else if (Number.isInteger(keywordId) && keywordId > 0) params.with_keywords = String(keywordId);
  else throw new HttpError(400, "Pick a studio or a keyword");
  // Řazení podle roku bez filmů bez data a bez úplně neznámých (jinak by začínalo prázdnými záznamy)
  if (body.sort === "year") params["vote_count.gte"] = "10";

  const pages = Math.min(Math.max(Number(body.pages) || 5, 1), 10);
  const results: TmdbCredit[] = [];
  let total = 0;
  for (let page = 1; page <= pages; page++) {
    const data = await tmdbGet<{ results: TmdbCredit[]; total_pages: number; total_results: number }>(
      "/discover/movie", { ...params, page: String(page) });
    results.push(...data.results);
    total = data.total_results;
    if (page >= data.total_pages) break;
  }
  const unique = [...new Map(results.map((m) => [m.id, m])).values()].map(candidateOf);
  return { total, films: await markInCatalog(db, unique) };
}

/** Stáhne detail filmu z TMDB a uloží ho do tabulky films. */
async function addFilm(db: SupabaseClient, tmdbId: number) {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, "Invalid tmdb_id");
  // Překlady (V4.2.2) přijdou ve stejné odpovědi
  const d = await tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, { language: "en-US", append_to_response: "translations,videos" });

  const film = {
    tmdb_id: d.id,
    title: d.title,
    original_title: d.original_title || null,
    release_date: d.release_date || null,
    runtime: d.runtime || null,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    overview: d.overview || null,
    original_language: d.original_language || null,            // V4.4.6 – původní název v jazyce filmu
    trailer_key: pickTrailer(d.videos),                         // V4.4.6 – detail filmu
    trailer_checked_at: new Date().toISOString(),
    tmdb_collection_id: d.belongs_to_collection?.id ?? 0,      // série TMDB (V3.5.2.3)
    translated_at: new Date().toISOString(),                    // V4.2.2
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("films").upsert(film, { onConflict: "tmdb_id" });
  if (error) throw new Error(error.message);
  const translations = pickTranslations(d.id, d.title, d.translations);
  if (translations.length > 0) {
    const { error: translationError } = await db.from("film_translations")
      .upsert(translations, { onConflict: "tmdb_id,lang" });
    if (translationError) throw new Error(translationError.message);
  }
  return { ...film, status: d.status, genres: (d.genres ?? []).map((g) => g.name) };
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
    { data: badges },
    { data: progress },
  ] = await Promise.all([
    db.from("profiles").select("*"),                          // od V4.4.6 i is_owner
    db.from("watches").select("user_id"),
    db.rpc("flagged_profile_ids"),
    db.from("user_badges").select("user_id, badge"),          // V4.4 – bez migrace chyba → bez odznaků
    db.from("user_progress").select("user_id, level"),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (watchError) throw new Error(watchError.message);
  if (flaggedError) throw new Error(flaggedError.message);
  const flaggedIds = new Set((flagged ?? []) as string[]);
  const badgesOf = new Map<string, string[]>();
  for (const b of (badges ?? []) as { user_id: string; badge: string }[]) {
    badgesOf.set(b.user_id, [...(badgesOf.get(b.user_id) ?? []), b.badge]);
  }
  const levelOf = new Map(((progress ?? []) as { user_id: string; level: number }[]).map((p) => [p.user_id, p.level]));

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
        is_owner: profile?.is_owner === true,                // V4.4.6 – vlastník webu
        is_public: profile?.is_public ?? false,
        flagged: flaggedIds.has(user.id),        // nick porušuje pravidla (V2.3)
        provider: (user.app_metadata?.provider as string | undefined) ?? "email",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
        watch_count: watchCount.get(user.id) ?? 0,
        badges: badgesOf.get(user.id) ?? [],                 // V4.4 – Elite
        level: levelOf.get(user.id) ?? null,                  // úroveň z databáze (null = ještě nespočítaná)
      };
    })
    .sort((a, b) => (a.username ?? "").localeCompare(b.username ?? ""));
}

async function setAdmin(db: SupabaseClient, actor: AdminActor, userId: string, isAdmin: boolean) {
  if (userId === actor.id) throw new HttpError(400, "You cannot change your own administrator role");
  // Roli správce uděluje a bere jen vlastník (V4.4.6)
  if (!actor.isOwner) throw new HttpError(403, "Only the owner can grant or remove the administrator role");
  const target = await targetProfile(db, userId);
  const problem = canManageUser(actor, target);
  if (problem) throw new HttpError(403, problem);
  const { error } = await db.from("profiles").update({ is_admin: isAdmin === true }).eq("id", userId);
  if (error) throw new Error(error.message);
  await logAction(db, actor, isAdmin ? "grant-admin" : "remove-admin", target?.username ?? userId);
  return { ok: true };
}

async function deleteUser(db: SupabaseClient, actor: AdminActor, userId: string) {
  if (userId === actor.id) throw new HttpError(400, "You cannot delete your own account here");
  const target = await targetProfile(db, userId);
  const problem = target ? canManageUser(actor, target) : null;     // účet bez profilu smí smazat kterýkoli správce
  if (problem) throw new HttpError(403, problem);
  // Smazání účtu smaže díky cizím klíčům (on delete cascade) i profil, zhlédnutí a watchlist
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  await logAction(db, actor, "delete-user", target?.username ?? userId);
  return { ok: true };
}

/**
 * Reset nicku (V2.3): automatický nick user_xxxxxxxx a skrytý veřejný profil.
 * Uživatel si při dalším otevření webu musí zvolit nový nick (web ho pošle do profilu).
 */
async function resetUsername(db: SupabaseClient, actor: AdminActor, userId: string) {
  if (userId === actor.id) throw new HttpError(400, "You cannot reset your own nickname here");
  const target = await targetProfile(db, userId);
  const problem = canManageUser(actor, target);
  if (problem) throw new HttpError(403, problem);
  const generated = "user_" + userId.replaceAll("-", "").slice(0, 8);
  const { error } = await db.from("profiles").update({ username: generated, is_public: false }).eq("id", userId);
  if (error) throw new Error(error.message);
  await logAction(db, actor, "reset-nickname", target?.username ?? userId, { new: generated });
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
  // credits = režisér filmu → kolekce režiséra stejného jména (V4.3.5)
  const details = await tmdbGet<TmdbMovieDetails & { credits?: { crew?: { job: string; name: string }[] } }>(
    `/movie/${tmdbId}`, { language: "en-US", append_to_response: "credits" });
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

  // Kolekce režiséra (V4.3.5): název kolekce = jméno režiséra filmu (bez ohledu na diakritiku a velikost)
  const plain = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const directors = (details.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name);
  for (const universe of universes) {
    if (universe.kind !== "director" || suggestions.has(universe.id)) continue;
    const director = directors.find((name) => plain(name) === plain(universe.name));
    if (director) {
      suggestions.set(universe.id, { universe_id: universe.id, slug: universe.slug, name: universe.name, kind: universe.kind, reason: `Director: ${director}` });
    }
  }

  const rank = (kind: string) => ["series", "director", "genre", "studio", "path"].indexOf(kind);
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
      .select("id, tmdb_id, title, release_date, poster_path, status, position, group_label, franchise, label, request:film_requests(id, note, created_at, user_id, kind, tmdb_collection_id, collection_name)")
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
    if (!series || series.inMmd || (r.request?.kind ?? "films") !== "films") continue;
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
      // pořadí a údaje navržené uživatelem v požadavku na kolekci (V4.3.1)
      position: r.position ?? null, group_label: r.group_label ?? null, franchise: r.franchise ?? null, label: r.label ?? null,
    });
    requests.set(r.request.id, request);
  }
  for (const request of requests.values()) {
    request.items.sort((a: { position: number | null; release_date: string | null }, b: { position: number | null; release_date: string | null }) =>
      (a.position ?? 999) - (b.position ?? 999) || (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999"));
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

/** Položka nové kolekce (V4.3.1): film a jeho údaje v kolekci. */
interface NewCollectionItem {
  tmdb_id: number;
  group_label?: string | null;
  franchise?: string | null;
  label?: string | null;
  story_order?: number | null;
  is_optional?: boolean;
}

const cleanText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** Položky z těla požadavku: platná TMDB ID, každý film jednou, texty zkrácené. */
function parseItems(raw: unknown): NewCollectionItem[] {
  const seen = new Set<number>();
  const items: NewCollectionItem[] = [];
  // deno-lint-ignore no-explicit-any
  for (const entry of (Array.isArray(raw) ? raw : []) as any[]) {
    const tmdbId = Number(entry?.tmdb_id);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || seen.has(tmdbId)) continue;
    seen.add(tmdbId);
    const story = Number(entry?.story_order);
    items.push({
      tmdb_id: tmdbId,
      group_label: cleanText(entry?.group_label, 60),
      franchise: cleanText(entry?.franchise, 60),
      label: cleanText(entry?.label, 60),
      story_order: Number.isInteger(story) && story >= 1 && story <= 999 ? story : null,
      is_optional: entry?.is_optional === true,
    });
  }
  return items;
}

/**
 * Nová oficiální kolekce (V3.5.2, obecně od V4.3.1): filmy do films (detail a překlady z TMDB),
 * kolekce na konec přehledu, filmy v daném pořadí s oddílem / sérií / popiskem, kategorie podle
 * žánrů filmů (nejvýš 2), čekající požadavky na tyto filmy → added. also = kolekce studií, kam
 * filmy přidat taky (V3.5.2.1). Vrací i blok do seedu – jen pro kontrolu (dopíše ho sync-seed).
 */
async function createCollection(db: SupabaseClient, options: {
  name: string;
  description: string | null;
  kind?: string;
  tmdbCollectionId: number | null;
  items: NewCollectionItem[];
  also: unknown;
}) {
  const { name, tmdbCollectionId, items } = options;
  if (items.length === 0) throw new HttpError(400, "No movies selected");
  if (items.length > 300) throw new HttpError(400, "Too many movies");

  const films = [];
  for (const item of items) films.push(await addFilm(db, item.tmdb_id));

  // Kategorie: nejčastější žánry filmů (nejvýš 2)
  const counts = new Map<string, number>();
  for (const film of films) {
    for (const slug of new Set(film.genres.map((genre) => GENRE_TO_CATEGORY[genre]).filter(Boolean))) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  const categorySlugs = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([slug]) => slug);

  // Volná adresa a pořadí na konci přehledu
  let slug = slugFrom(name);
  for (let n = 2; ; n++) {
    const { data: taken } = await db.from("universes").select("id").eq("slug", slug).maybeSingle();
    if (!taken) break;
    slug = `${slugFrom(name).slice(0, 36)}-${n}`;
  }
  const { data: last } = await db.from("universes").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const color = COLLECTION_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COLLECTION_COLORS.length];
  const description = shortDescription(options.description, 200) || `Every ${name} movie.`;
  const today = new Date().toISOString().slice(0, 10);
  const cover = films.find((film) => film.status === "Released" && film.poster_path) ?? films[0];

  const kind = ["series", "studio", "genre", "path", "director"].includes(options.kind ?? "") ? options.kind! : "series";
  const { data: universe, error } = await db.from("universes").insert({
    slug, name, description, color, kind,
    source: "app",              // nová kolekce z aplikace – sync-seed ji dopíše do seedu (V3.5.2.1)
    sort_order: (last?.[0]?.sort_order ?? 0) + 10,
    cover_tmdb_id: cover?.tmdb_id ?? null,
    tmdb_collection_id: tmdbCollectionId,     // hlídání nových dílů (V3.5.2.3); vlastní kolekce = null
  }).select("id, slug").single();
  if (error) throw new Error(error.message);

  // Přeložený název a popis série z TMDB (V4.3.4) – vlastní kolekce ho nemá, název je od správce
  if (tmdbCollectionId) await saveCollectionTranslations(db, universe.id, tmdbCollectionId);

  const { error: itemsError } = await db.from("universe_items").insert(films.map((film, index) => ({
    universe_id: universe.id,
    tmdb_id: film.tmdb_id,
    release_order: index + 1,
    group_label: items[index].group_label ?? null,
    franchise: items[index].franchise ?? null,
    label: items[index].label ?? null,
    story_order: items[index].story_order ?? null,
    is_optional: items[index].is_optional ?? false,
    is_upcoming: film.status !== "Released" || Boolean(film.release_date && film.release_date > today),
    source: "request",          // import ji nesmaže, sync-seed ji dopíše do seedu (V3.5.2)
  })));
  if (itemsError) throw new Error(itemsError.message);

  if (categorySlugs.length > 0) {
    const { data: cats } = await db.from("categories").select("id, slug").in("slug", categorySlugs);
    if (cats && cats.length > 0) {
      await db.from("universe_categories").insert(cats.map((c) => ({ universe_id: universe.id, category_id: c.id })));
    }
  }

  // Filmy i do kolekcí studií (V3.5.2.1) – např. Lethal Weapon → Warner Bros.
  const also = [...new Set(Array.isArray(options.also) ? options.also.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [])];
  const partIds = films.map((f) => f.tmdb_id);
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

  const { data: decided, error: decideError } = await db.from("film_request_items")
    .update({ status: "added", decided_at: new Date().toISOString(), universe_id: universe.id })
    .in("tmdb_id", partIds).eq("status", "pending")
    .select("id");
  if (decideError) throw new Error(decideError.message);

  // Blok do supabase/seed/universes.json (stejné formátování jako seed)
  const filmLines = films.map((film, index) => {
    const year = film.release_date ? Number(film.release_date.slice(0, 4)) : undefined;
    const item = items[index];
    const line: Record<string, unknown> = { title: film.title, year, tmdb: film.tmdb_id };
    if (item.group_label) line.group = item.group_label;
    if (item.franchise) line.franchise = item.franchise;
    if (item.label) line.label = item.label;
    if (item.story_order) line.story = item.story_order;
    if (item.is_optional) line.optional = true;
    return `        ${JSON.stringify(line).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/,"/g, ", \"").replace(/":/g, "\": ")}`;
  });
  const seed = [
    "    {",
    `      "slug": ${JSON.stringify(slug)},`,
    `      "name": ${JSON.stringify(name)},`,
    `      "kind": ${JSON.stringify(kind)},`,
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
 * Nová kolekce ze série TMDB (V3.5.2): díly v pořadí vydání (bez data na konci); u požadavku na
 * kolekci jen vybrané díly. Návrh „Suggested new collections“ – celá série.
 */
async function createCollectionFromSeries(db: SupabaseClient, tmdbCollectionId: number, rawName: unknown, onlyIds: unknown, alsoIds: unknown = []) {
  if (!Number.isInteger(tmdbCollectionId) || tmdbCollectionId <= 0) throw new HttpError(400, "Invalid collection");
  const collection = await tmdbGet<{ name: string; overview: string; parts: { id: number; release_date: string }[] }>(
    `/collection/${tmdbCollectionId}`, { language: "en-US" });
  const name = (typeof rawName === "string" && rawName.trim() ? rawName.trim() : collection.name.replace(/\s+Collection$/i, "")).slice(0, 80);

  const only = new Set(Array.isArray(onlyIds) ? onlyIds.map(Number).filter(Number.isInteger) : []);
  const parts = [...collection.parts]
    .filter((p) => only.size === 0 || only.has(p.id))
    .sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"));
  if (parts.length === 0) throw new HttpError(400, "No movies of this series selected");
  return await createCollection(db, {
    name, description: collection.overview, tmdbCollectionId,
    items: parts.map((p) => ({ tmdb_id: p.id })), also: alsoIds,
  });
}

/**
 * Nová kolekce z editoru (V4.3.1) – schválení požadavku na kolekci (série TMDB i vlastní).
 * Filmy v pořadí z editoru; reject_ids = položky požadavku, které správce do kolekce nevzal.
 */
async function createCollectionFromEditor(db: SupabaseClient, body: Record<string, unknown>) {
  const name = cleanText(body.name, 80);
  if (!name) throw new HttpError(400, "Enter a name");
  const items = parseItems(body.items);
  if (items.length < 2) throw new HttpError(400, "A collection needs at least 2 movies");
  const seriesId = Number(body.tmdb_collection_id);
  const tmdbCollectionId = Number.isInteger(seriesId) && seriesId > 0 ? seriesId : null;
  let description = cleanText(body.description, 400);
  if (!description && tmdbCollectionId) {
    description = (await tmdbGet<{ overview: string }>(`/collection/${tmdbCollectionId}`, { language: "en-US" })).overview || null;
  }
  const result = await createCollection(db, { name, description, kind: String(body.kind ?? "series"), tmdbCollectionId, items, also: body.also });

  const rejectIds = (Array.isArray(body.reject_ids) ? body.reject_ids : []).map(Number).filter(Number.isInteger);
  // Filmy, které správce do kolekce nevzal – jen v tomto požadavku, s důvodem „left_out“ (V4.3.3)
  if (rejectIds.length > 0) {
    await decideRequests(db, rejectIds.map((id) => ({ id, approve: false, only_this: true, reason: "left_out" })));
  }
  return result;
}

/**
 * Rozhodnutí o filmech z požadavků. Přijetí: film do films (detail z TMDB), případně na konec
 * kolekce; všechny čekající položky s tímto filmem → added. Zamítnutí: → rejected.
 * Vrací i řádky do seedu – jen pro kontrolu: položky mají source = 'request', import je nesmaže
 * a skript scripts/sync-seed.sh je do seedu dopíše sám (V3.5.2).
 */
/** Důvody zamítnutí (V4.3.3) – web je uživateli přeloží. */
const REJECT_REASONS = ["in_mmd", "similar", "not_released", "not_movie", "off_topic", "duplicate", "needs_changes", "left_out", "other"];

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
      // Důvod a poznámka pro uživatele (V4.3.3); u požadavku na kolekci jen tato položka
      const reason = REJECT_REASONS.includes(decision.reason) ? decision.reason : null;
      const note = typeof decision.note === "string" && decision.note.trim() ? decision.note.trim().slice(0, 300) : null;
      let rejectQuery = db.from("film_request_items")
        .update({ status: "rejected", decided_at: now, reject_reason: reason, reject_note: note })
        .eq("status", "pending");
      rejectQuery = decision.only_this === true ? rejectQuery.eq("id", item.id) : rejectQuery.eq("tmdb_id", item.tmdb_id);
      const { error: rejectError } = await rejectQuery;
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
    const actor = await requireAdmin(db, request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    switch (body.action) {
      case "search":
        return json(await search(String(body.query ?? "")));
      case "people-search":
        return json(await searchPeople(String(body.query ?? "")));
      case "person-films":
        return json(await personFilms(db, Number(body.person_id), body.second_person_id ? Number(body.second_person_id) : null));
      case "company-search":
        return json(await searchCompanyOrKeyword("company", String(body.query ?? "")));
      case "keyword-search":
        return json(await searchCompanyOrKeyword("keyword", String(body.query ?? "")));
      case "discover-films":
        return json(await discoverFilms(db, body));
      case "add-film":
        return json(await addFilm(db, Number(body.tmdb_id)));
      case "users":
        return json(await listUsers(db));
      case "set-admin":
        return json(await setAdmin(db, actor, String(body.user_id), body.is_admin === true));
      case "delete-user":
        return json(await deleteUser(db, actor, String(body.user_id)));
      case "reset-username":
        return json(await resetUsername(db, actor, String(body.user_id)));
      case "requests":
        return json(await listRequests(db));
      case "request-decide": {
        const decided = await decideRequests(db, body.items);
        const added = decided.results.filter((r) => r.status === "added");
        if (decided.results.length > 0) {
          await logAction(db, actor, "decide-requests", null, {
            added: added.map((r) => `${r.title}${r.universe ? ` → ${r.universe}` : ""}`).slice(0, 20),
            rejected: decided.results.length - added.length,
          });
        }
        return json(decided);
      }
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
        await logAction(db, actor, "add-film", film.title, { universe_id: universeId, tmdb_id: film.tmdb_id });
        return json({ ...film, added });
      }
      case "series-updates":       // kontrola sérií, jen když od poslední uběhl den (V3.5.2.3)
        return json(await seriesCheck(db, false));
      case "series-check":         // kontrola hned („Check now“)
        return json(await seriesCheck(db, true));
      case "series-decide": {
        const result = await decideSeriesUpdate(db, Number(body.id), body.add === true, body.also);
        await logAction(db, actor, body.add === true ? "series-add" : "series-dismiss", String(body.id), { status: result.status });
        return json(result);
      }
      case "series-dismiss-all":
        return json(await dismissAllSeriesUpdates(db));
      case "collection-names":
        return json(await collectionNames(db, body.universe_ids));
      case "request-create-collection": {
        const result = await createCollectionFromSeries(db, Number(body.tmdb_collection_id), body.name, body.tmdb_ids, body.also);
        await logAction(db, actor, "create-collection", result.slug, { films: result.films, from: "tmdb-series" });
        return json(result);
      }
      case "create-collection": {
        const result = await createCollectionFromEditor(db, body) as { slug?: string; films?: number };
        await logAction(db, actor, "create-collection", result.slug ?? String(body.name ?? ""), { films: result.films ?? null, kind: body.kind ?? "series" });
        return json(result);
      }
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

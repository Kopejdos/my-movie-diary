// =====================================================================
// My Movie Diary – Edge Function "tmdb"
//
// Akce (parametr ?action=…):
//   import  – POST, tělo = supabase/seed/universes.json
//             Dohledá filmy v TMDB, uloží je do tabulky films a vytvoří
//             univerza + jejich položky. Jen pro správce (hlavička x-admin-key).
//             Volitelně ?only=mcu – importuje jen jedno univerzum.
//             Filmy, které ještě nevyšly, se uloží s is_upcoming = true
//             (oddíl Coming soon, V3.3). Zrušené se jen vypíšou v reportu.
//             Hranici „do konce roku letos + 5“ počítá až web podle dnešního
//             data (V3.3.1) – posouvá se sama, import ji neřeší.
//             Položky změněné v aplikaci (universe_items.source = 'request'
//             / 'admin') import nemaže (V3.5.2, V3.5.2.1).
//   seed-sync – POST, tělo = text universes.json; vrátí ho doplněný o změny
//             z aplikace – požadavky i admin panel (scripts/sync-seed.sh).
//             Jen pro správce.
//
// Tajemství (Supabase → Edge Functions → Secrets):
//   TMDB_READ_TOKEN – TMDB API Read Access Token
//   MMD_ADMIN_KEY   – heslo pro správcovské akce (import)
//
// V nastavení funkce musí být vypnuté "Verify JWT" – funkce si ověřuje
// přístup sama (x-admin-key), publishable key není JWT.
// =====================================================================

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------

/** Film v seed souboru */
interface SeedFilm {
  title: string;
  year?: number;
  tmdb?: number;       // přesné TMDB ID, když hledání podle názvu nestačí
  group?: string;
  optional?: boolean;
  story?: number;      // pořadí v příběhu (fáze 4)
  note?: string;       // poznámka ke kroku cesty (fáze 16 – V1.8)
  franchise?: string;  // série uvnitř kolekce pro pohled Groups (V3.0.1)
  label?: string;      // krátký popisek filmu v kolekci – Episode IV, Part 2… (V3.0.1)
  cover?: boolean;     // tenhle film je obal karty kolekce (V3.1.4; jinak první povinný film)
}

/** Univerzum v seed souboru */
interface SeedUniverse {
  slug: string;
  name: string;
  color?: string;      // #rrggbb
  kind?: "series" | "studio" | "genre" | "path";
  categories?: string[];  // slugy kategorií (tabulka categories)
  description?: string;
  films: SeedFilm[];
}

/** Řádek tabulky films */
interface FilmRow {
  tmdb_id: number;
  title: string;
  original_title: string | null;
  release_date: string | null;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  updated_at: string;
}

/** Výsledek dohledání jednoho filmu */
type Resolved =
  | { status: "ok"; seed: SeedFilm; film: FilmRow; upcoming: boolean; warning?: string }
  | { status: "skipped"; seed: SeedFilm; title: string; releaseDate: string | null; reason: string }
  | { status: "not_found"; seed: SeedFilm; error: string };

// ---------------------------------------------------------------------
// Konfigurace
// ---------------------------------------------------------------------

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANGUAGE = "en-US";
const CONCURRENCY = 6; // kolik dotazů na TMDB běží najednou

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Vrátí tajemství, nebo vyhodí srozumitelnou chybu. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

/**
 * Klíč s plnými právy pro zápis do databáze.
 * Starší projekty mají SUPABASE_SERVICE_ROLE_KEY, novější SUPABASE_SECRET_KEYS (JSON).
 */
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

function createAdminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), getServiceKey(), {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Porovnání názvů bez ohledu na velikost písmen, diakritiku a interpunkci. */
function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

/** Spustí úlohy s omezeným počtem souběžných běhů, výsledky drží pořadí. */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------
// TMDB
// ---------------------------------------------------------------------

/** GET na TMDB API s tokenem; při překročení limitu (429) chvíli počká. */
async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${requireEnv("TMDB_READ_TOKEN")}`,
        Accept: "application/json",
      },
    });
    if (response.status === 429) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!response.ok) {
      throw new Error(`TMDB ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  }
  throw new Error(`TMDB rate limit for ${path}`);
}

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  popularity: number;
}

interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  status: string; // "Released", "Post Production", …
}

/**
 * Najde film podle názvu a roku. Zkouší postupně: rok premiéry, libovolné
 * vydání v daném roce, bez roku. Přednost má přesná shoda názvu.
 */
async function searchMovie(title: string, year?: number): Promise<TmdbSearchResult | null> {
  const attempts: Record<string, string>[] = [];
  if (year) {
    attempts.push({ primary_release_year: String(year) });
    attempts.push({ year: String(year) });
  }
  attempts.push({});

  const wanted = normalizeTitle(title);

  for (const extra of attempts) {
    const data = await tmdbGet<{ results: TmdbSearchResult[] }>("/search/movie", {
      query: title,
      include_adult: "false",
      language: TMDB_LANGUAGE,
      ...extra,
    });
    if (data.results.length === 0) continue;

    const exact = data.results.find(
      (r) => normalizeTitle(r.title) === wanted || normalizeTitle(r.original_title) === wanted,
    );
    return exact ?? data.results[0];
  }
  return null;
}

/** Dohledá jeden film ze seedu a připraví řádek pro tabulku films. */
async function resolveFilm(seed: SeedFilm): Promise<Resolved> {
  try {
    let tmdbId = seed.tmdb;
    let warning: string | undefined;

    if (!tmdbId) {
      const found = await searchMovie(seed.title, seed.year);
      if (!found) return { status: "not_found", seed, error: "No search results" };
      tmdbId = found.id;

      const foundYear = found.release_date ? Number(found.release_date.slice(0, 4)) : undefined;
      if (normalizeTitle(found.title) !== normalizeTitle(seed.title) &&
          normalizeTitle(found.original_title) !== normalizeTitle(seed.title)) {
        warning = `Title differs: matched "${found.title}" (${foundYear ?? "?"})`;
      } else if (seed.year && foundYear && foundYear !== seed.year) {
        warning = `Year differs: matched ${foundYear}`;
      }
    }

    const details = await tmdbGet<TmdbMovieDetails>(`/movie/${tmdbId}`, {
      language: TMDB_LANGUAGE,
    });

    // Zrušený film se neukládá (jen do reportu)
    if (details.status === "Canceled") {
      return { status: "skipped", seed, title: details.title, releaseDate: details.release_date || null, reason: "canceled" };
    }
    // Ještě nevyšlo → Coming soon (V3.3). Rozhoduje i datum (V3.3.2): TMDB občas hlásí
    // „Released“ dřív, než je premiéra. V den premiéry ho web i postup berou jako vydaný samy
    // podle release_date; další import jen obnoví údaje a srovná příznak.
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = details.status !== "Released" || Boolean(details.release_date && details.release_date > today);

    const film: FilmRow = {
      tmdb_id: details.id,
      title: details.title,
      original_title: details.original_title || null,
      release_date: details.release_date || null,
      runtime: details.runtime || null,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      overview: details.overview || null,
      updated_at: new Date().toISOString(),
    };
    return { status: "ok", seed, film, upcoming, warning };
  } catch (error) {
    return { status: "not_found", seed, error: String(error) };
  }
}

// ---------------------------------------------------------------------
// Import univerz
// ---------------------------------------------------------------------

/** Importuje jedno univerzum: filmy, univerzum, položky; smaže položky, které v seedu nejsou. */
async function importUniverse(db: SupabaseClient, universe: SeedUniverse, sortOrder: number) {
  const resolved = await mapLimited(universe.films, CONCURRENCY, resolveFilm);
  const ok = resolved.filter((r): r is Extract<Resolved, { status: "ok" }> => r.status === "ok");

  // 1. Filmy (stejný film může být v seedu víckrát – v různých univerzech)
  if (ok.length > 0) {
    const films = [...new Map(ok.map((r) => [r.film.tmdb_id, r.film])).values()];
    const { error } = await db.from("films").upsert(films, { onConflict: "tmdb_id" });
    if (error) throw new Error(`films upsert (${universe.slug}): ${error.message}`);
  }

  // 2. Univerzum (obal = film označený "cover": true, jinak první povinný film;
  //    chystaný film obalem není – často nemá ani plakát)
  const released = ok.filter((r) => !r.upcoming);
  const cover = released.find((r) => r.seed.cover) ?? released.find((r) => !r.seed.optional) ?? released[0];
  const { data: universeRow, error: universeError } = await db
    .from("universes")
    .upsert(
      {
        slug: universe.slug,
        name: universe.name,
        description: universe.description ?? null,
        color: universe.color ?? null,
        kind: universe.kind ?? "series",
        cover_tmdb_id: cover?.film.tmdb_id ?? null,
        sort_order: sortOrder,
        source: "seed",           // seed je teď aktuální → kolekce už není „upravená v aplikaci“ (V3.5.2.1)
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (universeError) throw new Error(`universe upsert (${universe.slug}): ${universeError.message}`);

  // 2b. Kategorie – když je seed uvádí, nahradí přiřazení kolekce
  if (universe.categories) {
    const { data: categoryRows, error: categoryError } = await db
      .from("categories")
      .select("id, slug")
      .in("slug", universe.categories);
    if (categoryError) throw new Error(`categories (${universe.slug}): ${categoryError.message}`);

    const missing = universe.categories.filter((slug) => !categoryRows?.some((c) => c.slug === slug));
    if (missing.length > 0) throw new Error(`Unknown categories (${universe.slug}): ${missing.join(", ")}`);

    const { error: clearError } = await db.from("universe_categories").delete().eq("universe_id", universeRow.id);
    if (clearError) throw new Error(`categories clear (${universe.slug}): ${clearError.message}`);
    if (categoryRows.length > 0) {
      const { error: linkError } = await db.from("universe_categories")
        .insert(categoryRows.map((c) => ({ universe_id: universeRow.id, category_id: c.id })));
      if (linkError) throw new Error(`categories link (${universe.slug}): ${linkError.message}`);
    }
  }

  // 3. Položky univerza v pořadí ze seedu (pořadí vydání)
  const items = ok.map((r, index) => ({
    universe_id: universeRow.id,
    tmdb_id: r.film.tmdb_id,
    release_order: index + 1,
    story_order: r.seed.story ?? null,
    group_label: r.seed.group ?? null,
    is_optional: r.seed.optional ?? false,
    note: r.seed.note ?? null,
    franchise: r.seed.franchise ?? null,
    label: r.seed.label ?? null,
    is_upcoming: r.upcoming,
    source: "seed",             // film už je v seedu → obyčejná položka (V3.5.2)
  }));
  const uniqueItems = [...new Map(items.map((i) => [i.tmdb_id, i])).values()];

  if (uniqueItems.length > 0) {
    const { error } = await db
      .from("universe_items")
      .upsert(uniqueItems, { onConflict: "universe_id,tmdb_id" });
    if (error) throw new Error(`items upsert (${universe.slug}): ${error.message}`);
  }

  // 4. Smazat položky, které už v seedu nejsou (seed je zdroj pravdy).
  //    Výjimka (V3.5.2): položky změněné v aplikaci (source = 'request' / 'admin') zůstávají –
  //    do seedu je dopíše scripts/sync-seed.sh; řadí se za filmy ze seedu.
  const keepIds = uniqueItems.map((i) => i.tmdb_id);
  let deleteQuery = db.from("universe_items").delete().eq("universe_id", universeRow.id).eq("source", "seed");
  if (keepIds.length > 0) deleteQuery = deleteQuery.not("tmdb_id", "in", `(${keepIds.join(",")})`);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(`items cleanup (${universe.slug}): ${deleteError.message}`);

  const { data: fromRequests, error: keptError } = await db
    .from("universe_items")
    .select("id, release_order")
    .eq("universe_id", universeRow.id)
    .neq("source", "seed")
    .order("release_order");
  if (keptError) throw new Error(`request items (${universe.slug}): ${keptError.message}`);
  for (const [index, item] of (fromRequests ?? []).entries()) {
    const { error } = await db.from("universe_items")
      .update({ release_order: uniqueItems.length + index + 1 }).eq("id", item.id);
    if (error) throw new Error(`request items order (${universe.slug}): ${error.message}`);
  }

  // 5. Záznamy o odebraných filmech jsou vyřízené – seed je aktuální (V3.5.2.1)
  const { error: removalError } = await db.from("seed_removals").delete().eq("universe_slug", universe.slug);
  if (removalError) throw new Error(`seed removals (${universe.slug}): ${removalError.message}`);

  // Report – jen to, co stojí za kontrolu
  return {
    slug: universe.slug,
    imported: uniqueItems.length,
    fromRequests: fromRequests?.length ?? 0,
    comingSoon: ok
      .filter((r) => r.upcoming)
      .map((r) => `${r.film.title} (${r.film.release_date ?? `${r.seed.year ?? "?"}, date TBA`})`),
    warnings: ok
      .filter((r) => r.warning)
      .map((r) => `${r.seed.title} (${r.seed.year}) → ${r.warning} [tmdb ${r.film.tmdb_id}]`),
    skipped: resolved
      .filter((r): r is Extract<Resolved, { status: "skipped" }> => r.status === "skipped")
      .map((r) => `${r.title} (${r.releaseDate ?? "date TBA"}): ${r.reason}`),
    notFound: resolved
      .filter((r): r is Extract<Resolved, { status: "not_found" }> => r.status === "not_found")
      .map((r) => `${r.seed.title} (${r.seed.year}): ${r.error}`),
  };
}

async function handleImport(request: Request, url: URL): Promise<Response> {
  if (request.headers.get("x-admin-key") !== requireEnv("MMD_ADMIN_KEY")) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  const body = (await request.json()) as { universes?: SeedUniverse[] };
  if (!Array.isArray(body.universes)) return json({ error: "Body must contain 'universes'" }, 400);

  const only = url.searchParams.get("only");
  const db = createAdminClient();
  const report = [];

  for (let index = 0; index < body.universes.length; index++) {
    const universe = body.universes[index];
    if (only && universe.slug !== only) continue;
    report.push(await importUniverse(db, universe, (index + 1) * 10));
  }

  // Plný import: záznamy o kolekcích, které v seedu nejsou (smazané), už nejsou potřeba
  if (!only) {
    const slugs = body.universes.map((u) => u.slug).filter((slug) => /^[a-z0-9-]+$/.test(slug));
    let cleanup = db.from("seed_removals").delete();
    cleanup = slugs.length > 0 ? cleanup.not("universe_slug", "in", `(${slugs.join(",")})`) : cleanup.neq("id", 0);
    const { error } = await cleanup;
    if (error) throw new Error(`seed removals cleanup: ${error.message}`);
  }

  return json({
    ok: true,
    totalImported: report.reduce((sum, r) => sum + r.imported, 0),
    universes: report,
  });
}

// ---------------------------------------------------------------------
// Synchronizace seedu (V3.5.2, rozšířeno ve V3.5.2.1): změny z aplikace → universes.json
//
// POST ?action=seed-sync, tělo = text supabase/seed/universes.json (jak je na disku).
// Do seedu se propíše vše, co se změnilo v aplikaci:
//   • filmy přijaté z požadavků a kolekce vytvořené ze série TMDB,
//   • úpravy v admin panelu – přidání, úprava, přesun a odebrání filmu, úprava kolekce
//     (název, popis, barva, typ, kategorie, obal), nová a smazaná kolekce.
// Mění se jen bloky dotčených kolekcí; řádky filmů, které se nezměnily, zůstanou
// do písmene stejné (diff v gitu ukáže jen skutečné změny). Pořadí filmů = pořadí
// v databázi (nové filmy se tam řadí podle data premiéry).
// Vrací upravený text souboru (text/plain) a v hlavičkách:
//   X-Seed-Changed / X-Seed-Added / X-Seed-Removed – počet změněných / nových / smazaných kolekcí,
//   X-Seed-Slugs – jejich adresy (slugy) oddělené čárkou.
// Volá ho scripts/sync-seed.sh (a ten i scripts/import.sh před importem).
// ---------------------------------------------------------------------

/** Položka kolekce z databáze. */
export interface SyncItem {
  tmdb_id: number;
  title: string;
  original_title: string | null;
  release_date: string | null;
  release_order: number;
  story_order: number | null;
  group_label: string | null;
  is_optional: boolean;
  is_upcoming: boolean;
  franchise: string | null;
  label: string | null;
  note: string | null;
  source: string;           // seed | request | admin
}

/** Kolekce z databáze, kterou je potřeba do seedu propsat. */
export interface SyncUniverse {
  slug: string;
  name: string;
  kind: string;
  color: string | null;
  description: string | null;
  categories: string[];
  cover_tmdb_id: number | null;
  source: string;           // seed | app
  items: SyncItem[];
}

/** Odebraný film (podle záznamu v seed_removals) – údaje pro nalezení řádku v seedu. */
export interface SyncRemoval {
  tmdb_id: number;
  title: string | null;
  original_title: string | null;
  release_date: string | null;
}

export interface SyncPlan {
  universes: SyncUniverse[];                 // dotčené kolekce (v seedu i nové)
  removals: Map<string, SyncRemoval[]>;      // slug → odebrané filmy
  removedUniverses: string[];                // smazané kolekce (slugy)
}

const yearOf = (date: string | null) => (date ? Number(date.slice(0, 4)) : undefined);

/** Objekt → řádek ve stylu seedu: { "title": "X", "year": 2024 } */
function formatSeedObject(obj: Record<string, unknown>): string {
  return `{ ${Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`;
}

/** Hodnota hlavičky kolekce ve stylu seedu (kategorie jako ["a", "b"]). */
function formatSeedValue(value: unknown): string {
  return Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(", ")}]` : JSON.stringify(value);
}

/**
 * Film ze seedu (nebo nový) doplněný o údaje z databáze. Klíče, které v řádku už jsou,
 * zůstanou na svém místě (nezměněný řádek vyjde do písmene stejně), nové přibudou na konec.
 * cover: true / false = nastavit / odebrat "cover"; null = nechat, jak je.
 */
function mergeSeedFilm(original: Record<string, unknown> | null, item: SyncItem, cover: boolean | null): Record<string, unknown> {
  const out: Record<string, unknown> = original ? { ...original } : { title: item.title };
  if (!original) {
    const year = yearOf(item.release_date);
    if (year) out.year = year;
    out.tmdb = item.tmdb_id;
  }
  const fields: [string, unknown][] = [
    ["group", item.group_label],
    ["story", item.story_order],
    ["optional", item.is_optional ? true : null],
    ["franchise", item.franchise],
    ["label", item.label],
    ["note", item.note],
  ];
  for (const [key, value] of fields) {
    if (value === null || value === undefined || value === "") delete out[key];
    else out[key] = value;
  }
  if (cover === true) out.cover = true;
  if (cover === false) delete out.cover;
  return out;
}

/** Řádek nového filmu (kolekce ze série, film z požadavku). */
export function seedFilmLine(item: SyncItem, indent: string): string {
  return indent + formatSeedObject(mergeSeedFilm(null, item, null));
}

const sameTitle = (a: unknown, b: string | null | undefined) =>
  typeof a === "string" && !!b && normalizeTitle(a) === normalizeTitle(b);

/** Odpovídá řádek seedu filmu? (TMDB ID, nebo název / původní název a rok) */
function seedMatches(obj: Record<string, unknown> | null, film: { tmdb_id: number; title: string | null; original_title: string | null; release_date: string | null }): boolean {
  if (!obj) return false;
  if (typeof obj.tmdb === "number") return obj.tmdb === film.tmdb_id;
  const year = yearOf(film.release_date);
  return (sameTitle(obj.title, film.title) || sameTitle(obj.title, film.original_title)) &&
    (obj.year === undefined || year === undefined || obj.year === year);
}

/** Kde v řádcích leží blok kolekce: { start: "{", end: "}" / "}," }. */
function findBlock(lines: string[], slug: string): { start: number; end: number } | null {
  const slugPattern = new RegExp(`^\\s*"slug":\\s*${JSON.stringify(slug).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,?\\s*$`);
  const slugLine = lines.findIndex((line) => slugPattern.test(line));
  if (slugLine < 0) return null;
  let start = slugLine - 1;
  while (start >= 0 && !/^\s*\{\s*$/.test(lines[start])) start--;
  if (start < 0) return null;
  const indent = lines[start].match(/^\s*/)![0];
  let end = slugLine + 1;
  while (end < lines.length && !new RegExp(`^${indent}\\},?\\s*$`).test(lines[end])) end++;
  return end < lines.length ? { start, end } : null;
}

/** Nový text bloku kolekce, která v seedu je (hlavička + filmy podle databáze). */
function rebuildBlock(block: string[], universe: SyncUniverse, removals: SyncRemoval[]): string[] {
  const filmsLine = block.findIndex((line) => /^\s*"films":\s*\[/.test(line));
  if (filmsLine < 0) return block;
  const keyIndent = block[filmsLine].match(/^\s*/)![0];

  // Pole "films" (i prázdné na jednom řádku)
  let closeLine: number;
  let filmTexts: string[];
  let closeText: string;
  if (/\[\s*\]/.test(block[filmsLine])) {
    closeLine = filmsLine;
    filmTexts = [];
    closeText = `${keyIndent}]${block[filmsLine].replace(/^.*\[\s*\]/, "")}`;
  } else {
    closeLine = block.findIndex((line, i) => i > filmsLine && /^\s*\],?\s*$/.test(line));
    if (closeLine < 0) return block;
    filmTexts = block.slice(filmsLine + 1, closeLine).filter((line) => line.trim() !== "");
    closeText = block[closeLine];
  }
  const filmIndent = filmTexts[0]?.match(/^\s*/)![0] ?? `${keyIndent}  `;

  // --- hlavička (jen u kolekce upravené v aplikaci) ---
  let header = block.slice(1, filmsLine);
  if (universe.source === "app") {
    const values: Record<string, unknown> = {
      name: universe.name,
      kind: universe.kind || "series",
      categories: universe.categories,
      color: universe.color,
      description: universe.description,
    };
    const seen = new Set<string>();
    header = header.flatMap((line) => {
      const match = line.match(/^(\s*)"([^"]+)":/);
      if (!match || !(match[2] in values)) return [line];
      seen.add(match[2]);
      const value = values[match[2]];
      if (value === null || value === undefined || value === "") return [];
      return [`${match[1]}${JSON.stringify(match[2])}: ${formatSeedValue(value)},`];
    });
    for (const key of ["name", "kind", "categories", "color", "description"]) {
      const value = values[key];
      if (seen.has(key) || value === null || value === undefined || value === "") continue;
      if (key === "categories" && (value as string[]).length === 0) continue;
      header.push(`${keyIndent}${JSON.stringify(key)}: ${formatSeedValue(value)},`);
    }
  }

  // --- filmy: párování řádků seedu s položkami v databázi ---
  const seed = filmTexts.map((text) => {
    const body = text.trim().replace(/,\s*$/, "");
    let obj: Record<string, unknown> | null = null;
    try { obj = JSON.parse(body); } catch { obj = null; }
    return { body, obj };
  });
  const items = [...universe.items].sort((a, b) => a.release_order - b.release_order);
  const seedToItem = new Array<number>(seed.length).fill(-1);
  const itemToSeed = new Map<number, number>();
  const pair = (s: number, i: number) => { seedToItem[s] = i; itemToSeed.set(i, s); };

  // 1. přesné TMDB ID, 2. název + rok, 3. zbylé položky ze seedu podle roku (název v TMDB se liší)
  items.forEach((item, i) => {
    const s = seed.findIndex((line, k) => seedToItem[k] < 0 && typeof line.obj?.tmdb === "number" && line.obj.tmdb === item.tmdb_id);
    if (s >= 0) pair(s, i);
  });
  items.forEach((item, i) => {
    if (itemToSeed.has(i)) return;
    const s = seed.findIndex((line, k) => seedToItem[k] < 0 && seedMatches(line.obj, item));
    if (s >= 0) pair(s, i);
  });
  items.forEach((item, i) => {
    if (itemToSeed.has(i) || item.source !== "seed") return;
    const year = yearOf(item.release_date);
    const candidates = seed.map((line, k) => ({ line, k }))
      .filter(({ line, k }) => seedToItem[k] < 0 && line.obj && typeof line.obj.tmdb !== "number" && line.obj.year === year);
    if (candidates.length === 1) pair(candidates[0].k, i);
  });

  // Obal: jen u kolekce upravené v aplikaci, a jen když se liší od výchozího (první povinný vydaný film)
  let coverFor: (item: SyncItem, obj: Record<string, unknown> | null) => boolean | null = () => null;
  if (universe.source === "app" && universe.cover_tmdb_id !== null) {
    const defaultCover = (items.find((i) => !i.is_optional && !i.is_upcoming) ?? items.find((i) => !i.is_upcoming))?.tmdb_id ?? null;
    const custom = universe.cover_tmdb_id !== null && universe.cover_tmdb_id !== defaultCover;
    coverFor = (item, obj) => item.tmdb_id === universe.cover_tmdb_id ? (custom || obj?.cover === true) : false;
  }

  const removed = (k: number) => seedToItem[k] < 0 && removals.some((r) => seedMatches(seed[k].obj, r));
  const out: string[] = [];
  let cursor = 0;
  const flushUntil = (limit: number) => {
    for (; cursor < limit; cursor++) {
      if (seedToItem[cursor] < 0 && !removed(cursor)) out.push(seed[cursor].body);   // film bez položky (ještě neimportovaný, nenalezený…)
    }
  };
  items.forEach((item, i) => {
    const s = itemToSeed.get(i);
    if (s !== undefined) {
      flushUntil(s);
      cursor = Math.max(cursor, s + 1);
      const line = seed[s];
      const cover = coverFor(item, line.obj);
      const unchanged = !line.obj || (item.source === "seed" && (cover === null || cover === (line.obj.cover === true)));
      out.push(unchanged ? line.body : formatSeedObject(mergeSeedFilm(line.obj, item, cover)));
    } else if (item.source !== "seed") {
      out.push(formatSeedObject(mergeSeedFilm(null, item, coverFor(item, null))));
    }
  });
  flushUntil(seed.length);

  const films = out.map((body, i) => `${filmIndent}${body}${i < out.length - 1 ? "," : ""}`);
  const filmsOpen = closeLine === filmsLine ? block[filmsLine].replace(/\[\s*\].*$/, "[") : block[filmsLine];
  return [block[0], ...header, filmsOpen, ...films, closeText, ...block.slice(closeLine + 1)];
}

/** Blok nové kolekce (vytvořené v aplikaci). */
function newBlock(universe: SyncUniverse, last: boolean): string[] {
  const items = [...universe.items].sort((a, b) => a.release_order - b.release_order);
  const defaultCover = (items.find((i) => !i.is_optional && !i.is_upcoming) ?? items.find((i) => !i.is_upcoming))?.tmdb_id ?? null;
  const custom = universe.cover_tmdb_id !== null && universe.cover_tmdb_id !== defaultCover;
  return [
    "    {",
    `      "slug": ${JSON.stringify(universe.slug)},`,
    `      "name": ${JSON.stringify(universe.name)},`,
    `      "kind": ${JSON.stringify(universe.kind || "series")},`,
    ...(universe.categories.length > 0 ? [`      "categories": ${formatSeedValue(universe.categories)},`] : []),
    ...(universe.color ? [`      "color": ${JSON.stringify(universe.color)},`] : []),
    ...(universe.description ? [`      "description": ${JSON.stringify(universe.description)},`] : []),
    `      "films": [`,
    ...items.map((item, i) => `        ${formatSeedObject(mergeSeedFilm(null, item, custom && item.tmdb_id === universe.cover_tmdb_id ? true : null))}${i < items.length - 1 ? "," : ""}`),
    "      ]",
    last ? "    }" : "    },",
  ];
}

/**
 * Propíše změny z aplikace do textu seedu. Čistá funkce – testuje se bez databáze.
 * Vrací nový text a slugy změněných / nových / smazaných kolekcí.
 */
export function patchSeed(text: string, plan: SyncPlan): { text: string; changed: string[]; added: string[]; removed: string[] } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let lines = text.replace(/\r\n/g, "\n").split("\n");
  const seed = JSON.parse(text) as { universes: SeedUniverse[] };
  const inSeed = new Set(seed.universes.map((u) => u.slug));
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // 1. Smazané kolekce – celý blok pryč (a čárka za předchozím, pokud byl poslední)
  for (const slug of plan.removedUniverses) {
    const block = findBlock(lines, slug);
    if (!block) continue;
    const wasLast = !/,\s*$/.test(lines[block.end]);
    lines.splice(block.start, block.end - block.start + 1);
    if (wasLast) {
      let previous = block.start - 1;
      while (previous >= 0 && lines[previous].trim() === "") previous--;
      if (previous >= 0 && /^\s*\},\s*$/.test(lines[previous])) lines[previous] = lines[previous].replace(/,\s*$/, "");
    }
    removed.push(slug);
  }

  // 2. Upravené kolekce, které v seedu jsou
  for (const universe of plan.universes) {
    if (!inSeed.has(universe.slug)) continue;
    const block = findBlock(lines, universe.slug);
    if (!block) continue;
    const before = lines.slice(block.start, block.end + 1);
    const after = rebuildBlock(before, universe, plan.removals.get(universe.slug) ?? []);
    if (after.join("\n") !== before.join("\n")) {
      lines = [...lines.slice(0, block.start), ...after, ...lines.slice(block.end + 1)];
      changed.push(universe.slug);
    }
  }

  // 3. Nové kolekce → na konec pole "universes" (před "  ]" a závěrečnou "}")
  const fresh = plan.universes.filter((u) => !inSeed.has(u.slug) && u.items.length > 0);
  if (fresh.length > 0) {
    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim() === "") end--;              // závěrečná "}"
    let close = end - 1;
    while (close >= 0 && lines[close].trim() === "") close--;        // "  ]" pole universes
    if (end >= 0 && lines[end].trim() === "}" && close >= 0 && /^\s*\]\s*$/.test(lines[close])) {
      let last = close - 1;
      while (last >= 0 && lines[last].trim() === "") last--;
      if (last >= 0 && /\}\s*$/.test(lines[last])) lines[last] = lines[last].replace(/\s*$/, ",");
      const blocks = fresh.flatMap((u, i) => newBlock(u, i === fresh.length - 1));
      lines.splice(close, 0, ...blocks);
      added.push(...fresh.map((u) => u.slug));
    }
  }

  const result = lines.join("\n");
  JSON.parse(result);              // pojistka: upravený seed musí být platný JSON
  return { text: result.replace(/\n/g, eol), changed, added, removed };
}

async function handleSeedSync(request: Request): Promise<Response> {
  if (request.headers.get("x-admin-key") !== requireEnv("MMD_ADMIN_KEY")) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const text = await request.text();
  let seed: { universes: SeedUniverse[] };
  try {
    seed = JSON.parse(text);
    if (!Array.isArray(seed.universes)) throw new Error();
  } catch {
    return json({ error: "Body must be valid supabase/seed/universes.json (check commas and brackets)" }, 400);
  }
  const inSeed = new Set(seed.universes.map((u) => u.slug));
  const db = createAdminClient();

  // Co se v aplikaci změnilo: upravené kolekce, položky mimo seed, odebrané filmy / kolekce
  const [appUniverses, appItems, removalRows] = await Promise.all([
    db.from("universes").select("id, slug").eq("source", "app"),
    db.from("universe_items").select("universe_id").neq("source", "seed"),
    db.from("seed_removals").select("universe_slug, tmdb_id"),
  ]);
  for (const r of [appUniverses, appItems, removalRows]) if (r.error) throw new Error(r.error.message);

  const removalSlugs = [...new Set((removalRows.data ?? []).map((r) => r.universe_slug))];
  const { data: removalUniverses, error: ruError } = removalSlugs.length
    ? await db.from("universes").select("id, slug").in("slug", removalSlugs)
    : { data: [], error: null };
  if (ruError) throw new Error(ruError.message);
  const existingSlugs = new Set((removalUniverses ?? []).map((u) => u.slug));

  const ids = [...new Set([
    ...(appUniverses.data ?? []).map((u) => u.id),
    ...(appItems.data ?? []).map((i) => i.universe_id),
    ...(removalUniverses ?? []).map((u) => u.id),
  ])];

  const universes: SyncUniverse[] = [];
  if (ids.length > 0) {
    const { data, error } = await db
      .from("universes")
      .select("id, slug, name, kind, color, description, cover_tmdb_id, source, " +
        "categories:universe_categories(category:categories(slug)), " +
        "items:universe_items(tmdb_id, release_order, story_order, group_label, is_optional, is_upcoming, franchise, label, note, source, " +
        "film:films(title, original_title, release_date))")
      .in("id", ids);
    if (error) throw new Error(`universes: ${error.message}`);
    // deno-lint-ignore no-explicit-any
    for (const u of (data ?? []) as any[]) {
      universes.push({
        slug: u.slug, name: u.name, kind: u.kind, color: u.color, description: u.description,
        cover_tmdb_id: u.cover_tmdb_id, source: u.source,
        // deno-lint-ignore no-explicit-any
        categories: (u.categories ?? []).map((c: any) => c.category?.slug).filter(Boolean).sort(),
        // deno-lint-ignore no-explicit-any
        items: (u.items ?? []).map((i: any) => ({
          tmdb_id: i.tmdb_id, title: i.film?.title ?? `TMDB ${i.tmdb_id}`, original_title: i.film?.original_title ?? null,
          release_date: i.film?.release_date ?? null, release_order: i.release_order, story_order: i.story_order,
          group_label: i.group_label, is_optional: i.is_optional, is_upcoming: i.is_upcoming, franchise: i.franchise,
          label: i.label, note: i.note, source: i.source,
        })),
      });
    }
  }
  // Pořadí kategorií ze seedu nechat (jsou-li stejné), ať se řádek zbytečně nemění
  for (const u of universes) {
    const own = seed.universes.find((s) => s.slug === u.slug)?.categories;
    if (own && [...own].sort().join() === u.categories.join()) u.categories = [...own];
  }

  // Odebrané filmy – údaje z tabulky films, podle kterých se najde řádek v seedu
  const removedIds = [...new Set((removalRows.data ?? []).map((r) => r.tmdb_id).filter((id): id is number => id !== null))];
  const { data: removedFilms, error: rfError } = removedIds.length
    ? await db.from("films").select("tmdb_id, title, original_title, release_date").in("tmdb_id", removedIds)
    : { data: [], error: null };
  if (rfError) throw new Error(rfError.message);
  const filmById = new Map((removedFilms ?? []).map((f) => [f.tmdb_id, f]));
  const removals = new Map<string, SyncRemoval[]>();
  for (const r of removalRows.data ?? []) {
    if (r.tmdb_id === null) continue;
    const film = filmById.get(r.tmdb_id);
    const list = removals.get(r.universe_slug) ?? [];
    list.push({ tmdb_id: r.tmdb_id, title: film?.title ?? null, original_title: film?.original_title ?? null, release_date: film?.release_date ?? null });
    removals.set(r.universe_slug, list);
  }
  const removedUniverses = [...new Set((removalRows.data ?? [])
    .filter((r) => r.tmdb_id === null && !existingSlugs.has(r.universe_slug) && inSeed.has(r.universe_slug))
    .map((r) => r.universe_slug))];

  // Nové kolekce bez filmů a staré kolekce mimo seed beze změn se nepropisují
  const plan: SyncPlan = {
    universes: universes.filter((u) => inSeed.has(u.slug) || u.source === "app" || u.items.some((i) => i.source !== "seed")),
    removals,
    removedUniverses,
  };
  const result = patchSeed(text, plan);
  return new Response(result.text, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Seed-Changed": String(result.changed.length),
      "X-Seed-Added": String(result.added.length),
      "X-Seed-Removed": String(result.removed.length),
      "X-Seed-Slugs": [...result.changed, ...result.added.map((s) => `+${s}`), ...result.removed.map((s) => `-${s}`)].join(", "),
    },
  });
}

// ---------------------------------------------------------------------
// Vstupní bod
// ---------------------------------------------------------------------

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    switch (action) {
      case "import":
        return await handleImport(request, url);
      case "seed-sync":
        return await handleSeedSync(request);
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

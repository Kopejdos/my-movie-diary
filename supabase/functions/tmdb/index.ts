// =====================================================================
// My Movie Diary – Edge Function "tmdb"
//
// Akce (parametr ?action=…):
//   import  – POST, tělo = supabase/seed/universes.json
//             Dohledá filmy v TMDB, uloží je do tabulky films a vytvoří
//             univerza + jejich položky. Jen pro správce (hlavička x-admin-key).
//             Volitelně ?only=mcu – importuje jen jedno univerzum.
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
  | { status: "ok"; seed: SeedFilm; film: FilmRow; warning?: string }
  | { status: "upcoming"; seed: SeedFilm; title: string; releaseDate: string | null }
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

    if (details.status !== "Released") {
      return {
        status: "upcoming",
        seed,
        title: details.title,
        releaseDate: details.release_date || null,
      };
    }

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
    return { status: "ok", seed, film, warning };
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

  // 2. Univerzum (obal = první povinný film)
  const cover = ok.find((r) => !r.seed.optional) ?? ok[0];
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
  }));
  const uniqueItems = [...new Map(items.map((i) => [i.tmdb_id, i])).values()];

  if (uniqueItems.length > 0) {
    const { error } = await db
      .from("universe_items")
      .upsert(uniqueItems, { onConflict: "universe_id,tmdb_id" });
    if (error) throw new Error(`items upsert (${universe.slug}): ${error.message}`);
  }

  // 4. Smazat položky, které už v seedu nejsou (seed je zdroj pravdy)
  const keepIds = uniqueItems.map((i) => i.tmdb_id);
  let deleteQuery = db.from("universe_items").delete().eq("universe_id", universeRow.id);
  if (keepIds.length > 0) deleteQuery = deleteQuery.not("tmdb_id", "in", `(${keepIds.join(",")})`);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw new Error(`items cleanup (${universe.slug}): ${deleteError.message}`);

  // Report – jen to, co stojí za kontrolu
  return {
    slug: universe.slug,
    imported: uniqueItems.length,
    warnings: ok
      .filter((r) => r.warning)
      .map((r) => `${r.seed.title} (${r.seed.year}) → ${r.warning} [tmdb ${r.film.tmdb_id}]`),
    upcoming: resolved
      .filter((r): r is Extract<Resolved, { status: "upcoming" }> => r.status === "upcoming")
      .map((r) => `${r.title} (${r.releaseDate ?? "date TBA"})`),
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

  return json({
    ok: true,
    totalImported: report.reduce((sum, r) => sum + r.imported, 0),
    universes: report,
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
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error(error);
    return json({ error: String(error) }, 500);
  }
});

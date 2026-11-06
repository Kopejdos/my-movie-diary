# Datový model

Návrh tabulek v Supabase (PostgreSQL). Skutečná struktura vzniká migracemi
v `supabase/migrations/` (fáze 1); tento dokument popisuje záměr a pravidla.

## Přehled

```
auth.users (Supabase)
    │ 1:1
    ▼
profiles ─────────────┐
    │ 1:N             │ 1:N
    ▼                 ▼
watches            watchlist
    │ N:1             │ N:1
    ▼                 ▼
films ◄──── universe_items ────► universes
        N:1                  N:1
```

- **Sdílená data** (univerza, filmy, jejich pořadí) jsou stejná pro všechny uživatele.
- **Osobní data** (zhlédnutí, watchlist, profil) patří vždy jednomu uživateli.

## Tabulky

### `profiles` – profil uživatele
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `uuid` PK | = `auth.users.id`, vzniká automaticky při registraci (trigger) |
| `username` | `text` unique | nickname, 3–24 znaků: písmena, číslice, `_`, `-`; unikátní i bez ohledu na velikost písmen |
| `is_admin` | `boolean` | správce (nastavuje se jen v SQL, uživatel si ho změnit nemůže) |
| `is_public` | `boolean` | veřejný profil (od V2.0); výchozí `false` = soukromý, mění ho jen uživatel sám |
| `created_at` | `timestamptz` | |

### `films` – cache údajů z TMDB
| Sloupec | Typ | Poznámka |
|---|---|---|
| `tmdb_id` | `integer` PK | ID filmu v TMDB |
| `title` | `text` | anglický název |
| `original_title` | `text` | původní název (Ghibli, Asterix…) |
| `release_date` | `date` | |
| `runtime` | `integer` | délka v minutách (pro statistiky) |
| `poster_path` | `text` | cesta k plakátu na CDN TMDB (`/abc.jpg`) |
| `backdrop_path` | `text` | širokoúhlý záběr z filmu – banner v detailu univerza |
| `overview` | `text` | krátký popis |
| `updated_at` | `timestamptz` | kdy se naposledy obnovilo z TMDB |

Zapisuje do ní jen Edge Function `tmdb` (service role), web ji jen čte.

### `universes` – univerza
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `bigint` PK | |
| `slug` | `text` unique | adresa v aplikaci, např. `mcu` → `#/universe/mcu` |
| `name` | `text` | „Marvel Cinematic Universe“ |
| `description` | `text` | |
| `color` | `text` | barva univerza `#rrggbb` (záře, karty, tlačítka) |
| `kind` | `text` | typ kolekce: `series` / `studio` / `genre` (žánrový výběr) / `path` (cesta, od V1.8) |
| `cover_tmdb_id` | `integer` FK → `films` | film, jehož plakát je na kartičce |
| `sort_order` | `integer` | pořadí na hlavní obrazovce |
| `owner_id` | `uuid` FK → `profiles`, null | `null` = oficiální univerzum; vyplněné = vlastní univerzum uživatele (později) |

### `categories` – kategorie (sekce přehledu)
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `bigint` PK | |
| `slug` | `text` unique | `superhero`, `horror`… |
| `name` | `text` | „Sci-fi“, „Crime & Thriller“ (od V3.1.5: Superhero, Sci-fi, Fantasy, Animation, Family, Action & Adventure, Comedy, Drama, Crime & Thriller, War, Horror) |
| `color` | `text` | barva filtru `#rrggbb` |
| `sort_order` | `integer` | pořadí ve filtru |

### `universe_categories` – kolekce v kategoriích (M:N)
| Sloupec | Typ | Poznámka |
|---|---|---|
| `universe_id` | `bigint` FK → `universes` | PK spolu s `category_id` |
| `category_id` | `bigint` FK → `categories` | |

### `universe_items` – filmy v univerzu
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `bigint` PK | |
| `universe_id` | `bigint` FK → `universes` | |
| `tmdb_id` | `integer` FK → `films` | |
| `release_order` | `integer` | pořadí podle vydání |
| `story_order` | `integer`, null | chronologické pořadí příběhu; `null` = stejné jako vydání |
| `group_label` | `text`, null | oddíl v pořadí vydání (nadpis v pohledu Release), např. „Phase 1“, „Golden Age“ |
| `franchise` | `text`, null | série uvnitř kolekce pro pohled **By series**, např. „Iron Man“, „Toy Story“; `null` = film bez série (skupina *Standalone* na konci); max. 60 znaků (od V3.0.1) |
| `label` | `text`, null | krátký popisek u názvu, např. „Episode IV – A New Hope“, „Part 2“; max. 60 znaků (od V3.0.1) |
| `is_optional` | `boolean` | vedlejší film (crossover, spin-off) – nepočítá se do postupu |
| `note` | `text`, null | poznámka ke kroku cesty – proč film vidět (max. 300 znaků, od V1.8) |

Unikátní dvojice (`universe_id`, `tmdb_id`) – jeden film je v univerzu nejvýš jednou,
ale může být ve více univerzech.

### `watches` – zhlédnutí
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `bigint` PK | |
| `user_id` | `uuid` FK → `profiles` | |
| `tmdb_id` | `integer` FK → `films` | |
| `watched_on` | `date` | výchozí dnešek |
| `rating` | `smallint`, null | 1–10 (později) |
| `note` | `text`, null | (později) |
| `created_at` | `timestamptz` | |

- **+1** = nový řádek, **−1** = smazání nejnovějšího řádku daného filmu.
- Počet zhlédnutí = `count(*)` pro dvojici (`user_id`, `tmdb_id`).

### `watchlist` – chci vidět
| Sloupec | Typ | Poznámka |
|---|---|---|
| `user_id` | `uuid` FK → `profiles` | PK spolu s `tmdb_id` |
| `tmdb_id` | `integer` FK → `films` | |
| `added_at` | `timestamptz` | |

### `ratings` – hodnocení filmů (V3.2)
| Sloupec | Typ | Poznámka |
|---|---|---|
| `user_id` | `uuid` FK → `profiles` | PK spolu s `tmdb_id`; výchozí `auth.uid()` |
| `tmdb_id` | `integer` FK → `films` | |
| `score` | `smallint` | 1–10 = **hvězdičky × 2** (0,5–5 ★ po půlkách) |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` hlídá trigger `ratings_touch` |

- RLS: každý vidí a mění **jen svoje** hodnocení. Smazání účtu smaže i hodnocení (cascade).
- **`film_rating_stats(p_ids integer[])`** (security definer, i pro nepřihlášené) vrací pro seznam filmů jen
  `average` (0,5–5, zaokrouhleno na desetiny) a `votes` – nikdy, kdo jak hodnotil. Nejvýš 1000 filmů na volání.

### `blocked_words` – zakázaná slova v nickách (V2.3)

| Sloupec | Typ | Popis |
|---|---|---|
| `id` | `bigint` | identifikátor |
| `word` | `text` | slovo – malá písmena a číslice, 2–30 znaků |
| `match_mode` | `text` | `contains` = kdekoli v nicku, `exact` = celý nick (pro slova, která by blokovala nevinné nicky) |
| `created_at` | `timestamptz` | kdy bylo přidáno |

### `heartbeat` – keep-alive
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `bigint` PK | |
| `pinged_at` | `timestamptz` | |

Zapisuje do ní jen GitHub Action přes databázovou funkci `ping()`; drží se jen posledních pár řádků.

## Pohledy a funkce

- **`universe_progress`** (pohled) – pro přihlášeného uživatele u každého univerza: počet filmů (bez volitelných), počet viděných, procento.
- **`my_film_counts`** (pohled) – počet zhlédnutí a datum posledního zhlédnutí pro každý film uživatele.
- **`ping()`** (funkce) – zapíše řádek do `heartbeat` a smaže staré.
- **`remove_latest_watch(tmdb_id)`** – −1: smaže nejnovější zhlédnutí a vrátí nový počet.
- **`is_username_available(username)`** – je nickname volný? (smí i nepřihlášený, vrací jen ano / ne)
- **`email_for_username(username)`** – e-mail k nicku pro přihlášení nickem; smí ji volat **jen `service_role`** (Edge Function `login`).
- **`remove_watched_from_watchlist()`** (trigger na `watches`) – po zhlédnutí film zmizí z watchlistu.
- **`is_admin()`** – je přihlášený uživatel správce? (používají ji pravidla RLS admin panelu)
- **`public_profile(username)`** (V2.0) – veřejný profil jako JSON `{ username, member_since, watches: [{ tmdb_id, watched_on, created_at, film }] }`,
  nebo `null`, když profil neexistuje **nebo je soukromý** (navenek se neliší). Smí i nepřihlášený. Nevrací e-mail, id,
  admin, watchlist ani hodnocení a poznámky ke zhlédnutí.
- **`search_public_profiles(query)`** (V2.0) – veřejné profily, jejichž nick obsahuje dotaz (od 2 znaků, max. 10,
  začínající dotazem první). Vrací jen `username` a `member_since`.
- **`handle_new_user()`** (trigger na `auth.users`) – založí profil s nickem z registrace, u Google `user_xxxxxxxx`.

Výpočty běží v databázi, ne v prohlížeči – web dostane hotová čísla jedním dotazem.

**Moderace nicků (V2.3):**
- **`normalize_username(text)`** – malá písmena, `0→o 1→i 3→e 4→a 5→s 7→t 8→b @→a $→s`, bez ostatních znaků,
  sloučená opakovaná písmena (`F_u-u-uck` → `fuck`, `k0k0t` → `kokot`).
- **`is_username_allowed(username)`** – neobsahuje nick zakázané slovo? (smí i nepřihlášený; automatický nick
  `user_xxxxxxxx` je vždy povolený).
- **Trigger `profiles_username_allowed`** – při každém vložení nebo změně nicku; zakázaný nick skončí chybou
  `username_not_allowed`.
- **`handle_new_user()`** – při registraci se zakázaným, neplatným nebo obsazeným nickem dostane účet automatický
  nick (uživatel si pak zvolí jiný).
- **`flagged_profile_ids()`** – účty (mimo správce), jejichž nick porušuje pravidla; jen `service_role`
  (Edge Function `admin`).

## Pravidla přístupu (Row Level Security)

| Tabulka | Čtení | Zápis |
|---|---|---|
| `films` | kdokoli (i nepřihlášený – náhled univerz) | jen Edge Functions (`tmdb`, `admin`) |
| `universes`, `universe_items`, `categories`, `universe_categories` | kdokoli (i nepřihlášený – náhled kolekcí) | správce (`is_admin()`), Edge Function `tmdb` |
| `profiles` | jen vlastní řádek; veřejné profily ostatních jen přes funkce `public_profile` / `search_public_profiles` | jen vlastní řádek, jen sloupce `username` a `is_public` |
| `watches` | jen vlastní řádky; zhlédnutí veřejných profilů (film + datum) jen přes `public_profile` | jen vlastní řádky |
| `watchlist` | jen vlastní řádky (vždy soukromý) | jen vlastní řádky |
| `blocked_words` | jen správce | jen správce |
| `heartbeat` | nikdo | jen funkce `ping()` |

Vlastní univerza uživatelů (později) se přidají jako další pravidlo: řádky s `owner_id` vidí a mění jen jejich vlastník.

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
| `cover_tmdb_id` | `integer` FK → `films` | film, jehož plakát je na kartičce |
| `sort_order` | `integer` | pořadí na hlavní obrazovce |
| `owner_id` | `uuid` FK → `profiles`, null | `null` = oficiální univerzum; vyplněné = vlastní univerzum uživatele (později) |

### `universe_items` – filmy v univerzu
| Sloupec | Typ | Poznámka |
|---|---|---|
| `id` | `bigint` PK | |
| `universe_id` | `bigint` FK → `universes` | |
| `tmdb_id` | `integer` FK → `films` | |
| `release_order` | `integer` | pořadí podle vydání |
| `story_order` | `integer`, null | chronologické pořadí příběhu; `null` = stejné jako vydání |
| `group_label` | `text`, null | skupina, např. „Phase 1“, „Animated“, „Sony's Spider-Man Universe“ |
| `is_optional` | `boolean` | vedlejší film (crossover, spin-off) – nepočítá se do postupu |

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
- **`handle_new_user()`** (trigger na `auth.users`) – založí profil s nickem z registrace, u Google `user_xxxxxxxx`.

Výpočty běží v databázi, ne v prohlížeči – web dostane hotová čísla jedním dotazem.

## Pravidla přístupu (Row Level Security)

| Tabulka | Čtení | Zápis |
|---|---|---|
| `films` | kdokoli (i nepřihlášený – náhled univerz) | jen Edge Functions (`tmdb`, `admin`) |
| `universes`, `universe_items` | kdokoli (i nepřihlášený – náhled univerz) | správce (`is_admin()`), Edge Function `tmdb` |
| `profiles` | jen vlastní řádek (sdílení postupu později) | jen vlastní řádek, jen sloupec `username` |
| `watches`, `watchlist` | jen vlastní řádky | jen vlastní řádky |
| `heartbeat` | nikdo | jen funkce `ping()` |

Vlastní univerza uživatelů (později) se přidají jako další pravidlo: řádky s `owner_id` vidí a mění jen jejich vlastník.

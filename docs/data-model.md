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

### Vlastní seznamy (V3.5.3)
- **`lists`** – `id`, `user_id` (FK → `profiles`, cascade, výchozí `auth.uid()`), `title` (1–80 znaků), `description`
  (≤ 500), `visibility` (`private` / `friends` / `public`), `view_count`, `created_at`, `updated_at`.
  Zapisovat jde jen `title`, `description`, `visibility` (počítadlo mění jen `register_list_view`).
- **`list_items`** – `list_id` (cascade), `tmdb_id` (FK → `films`), `position` (bez pozice = na konec),
  `note` (≤ 300), `added_at`; PK `(list_id, tmdb_id)`.
- **`list_categories`** – `list_id`, `category_id`; nejvýš 3 na seznam (trigger).
- **`list_views`** – `list_id`, `viewer_key` (`u:<uuid>` / `a:<id prohlížeče>`), `viewed_on` (přihlášený pevné
  datum = jednou navždy, nepřihlášený dnešek = jednou za den); RLS bez pravidel.
- Viditelnost hlídá `can_view_list(owner, visibility)` (veřejný, vlastní, přítel u `friends`, správce).
- Funkce pro web: `list_info(id)` (údaje + přezdívka autora + kategorie), `user_lists(username)` (seznamy,
  které smím vidět, s počtem filmů a 4 plakáty), `my_lists_for_film(tmdb_id)`, `register_list_view(id, anon_id)`.
- Triggery: zakázaná slova v názvu / popisu / poznámce (`is_text_allowed`), limity 50 seznamů / 300 filmů /
  3 kategorie, čas úpravy.

### Komunita (V3.5.4)
- **`lists.hidden`** – skrytý správcem; vidí ho jen autor a správce (`can_view_list_row(owner, visibility,
  hidden)` – používají ho pravidla RLS i funkce pro web). Autor ho změnit nemůže (nemá právo na sloupec).
- **`list_reports`** – `list_id` (cascade), `reporter_id` (výchozí `auth.uid()`), `reason` (`offensive` / `spam` /
  `spoilers` / `other`), `note` (≤ 300), `status` (`open` / `dismissed` / `hidden`), `created_at`; unikátní
  `(list_id, reporter_id)`. Nahlásit jde jen cizí seznam, který uživatel vidí.
- `community_lists(limit)` – veřejné, neskryté seznamy s aspoň 3 filmy od nejvíc zobrazených (autor,
  4 plakáty, id kategorií); `admin_reported_lists()` a `admin_moderate_list(id, hide)` jen pro správce.

### Hlídání nových dílů sérií (V3.5.2.3)
- **`films.tmdb_collection_id`** – série TMDB, do které film patří (`belongs_to_collection`); `0` = žádná,
  `null` = ještě nezjištěno. Plní ho import (`tmdb`), přidání filmu v adminu a postupně i kontrola sérií.
- **`universes.tmdb_collection_id`** – série TMDB, ze které kolekce vznikla (kolekce ze série).
- **`series_updates`** – nalezené chybějící díly: `universe_id` (FK, cascade), `tmdb_collection_id`, `tmdb_id`,
  `title`, `release_date`, `poster_path`, `status` (`pending` / `added` / `dismissed`), `found_at`,
  `decided_at`; unikátní `(universe_id, tmdb_id)` – zahozený díl se znovu nenabídne.
- **`admin_state`** – `key` → `value` (jsonb): `series_check` = čas a výsledek poslední kontroly.
- Obě tabulky mají RLS bez pravidel – pracuje s nimi jen Edge Function `admin`.

### Synchronizace se seedem (V3.5.2.1)
- **`universes.source`** – `seed` (podle seedu) / `app` (kolekce vytvořená nebo upravená v aplikaci – název,
  popis, barva, typ, kategorie, obal). Import ji vrátí na `seed`.
- **`seed_removals`** – filmy odebrané z kolekcí a smazané kolekce v admin panelu: `universe_slug`, `tmdb_id`
  (null = celá kolekce), `removed_at`. RLS bez pravidel (jen Edge Functions). `seed-sync` podle nich vyškrtne
  řádky ze seedu, import záznamy dané kolekce smaže.
- Triggery `mark_app_change`, `mark_universe_categories_change` a `log_seed_removal` reagují jen na zápis
  přihlášeného uživatele (admin panel; zapisovat do kolekcí smí jen správce) – Edge Functions (service role)
  si značku nastavují samy.

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
| `is_upcoming` | `boolean` | film ještě nevyšel (V3.3) – oddíl **Coming soon**, nepočítá se do počtu filmů ani postupu; nastavuje import. Od V3.3.2 rozhoduje hlavně datum: se známým `films.release_date` je film chystaný, dokud premiéra nebyla (v den premiéry se počítá jako vydaný, i když import neproběhl, a naopak budoucí premiéra je chystaná, i když TMDB hlásí „Released“); bez data rozhodne tento příznak. Hranici „do konce roku letos + 5“ počítá web |
| `note` | `text`, null | poznámka ke kroku cesty – proč film vidět (max. 300 znaků, od V1.8) |
| `source` | `text` | `seed` (výchozí – položka ze seedu; import ji smaže, když v seedu chybí) / `request` (z požadavku nebo kolekce ze série, V3.5.2) / `admin` (přidaná nebo upravená v admin panelu – nastaví trigger, V3.5.2.1). Ne-`seed` položky import **nesmaže** a `scripts/sync-seed.sh` je propíše do seedu; dalším importem se z nich stane `seed` |

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

### `friendships` – přátelé (V3.4.1)
| Sloupec | Typ | Poznámka |
|---|---|---|
| `requester_id` | `uuid` FK → `profiles` | kdo žádost poslal; PK spolu s `addressee_id` |
| `addressee_id` | `uuid` FK → `profiles` | komu |
| `status` | `text` | `pending` (čeká na odpověď) / `accepted` (přátelé) |
| `created_at` | `timestamptz` | kdy byla žádost odeslána |
| `responded_at` | `timestamptz`, null | kdy byla přijata |

- Jedna dvojice jen jednou (unikátní index na `least/greatest` obou ID), sám sebe požádat nejde.
- RLS: číst jde **jen vlastní** řádky; **zápis přímo do tabulky nejde** – jen přes funkce níže (pracují s nickem,
  ID účtů web nedostane). Smazání účtu smaže i přátelství (cascade).
- Ochrana proti spamu: nejvýš 50 nevyřízených odeslaných žádostí a 500 přátel.

### Požadavky na filmy (V3.5.1)
**`film_requests`** – jeden požadavek: `id`, `user_id` (FK → `profiles`, cascade), `note` (≤ 300 znaků, vidí jen
autor a správce), `created_at`. Od V3.5.2 i **`kind`** (`films` = libovolné filmy / `collection` = díly jedné série
TMDB), **`tmdb_collection_id`** (série u požadavku na kolekci – vyplněná právě tehdy, když `kind = 'collection'`,
omezení `film_requests_series_check`) a **`collection_name`** (název série z TMDB, ≤ 120 znaků).

**`film_request_items`** – filmy v požadavku: `id`, `request_id` (FK, cascade), `tmdb_id`, `title`,
`release_date`, `poster_path` (údaje z TMDB v okamžiku požadavku – film ještě není v `films`), `status`
(`pending` / `added` / `rejected`), `universe_id` (kam správce film zařadil, null = bez kolekce), `decided_at`.
Unikátní `(request_id, tmdb_id)`.

**`film_request_votes`** – +1: `(tmdb_id, user_id)` PK, `created_at`.

- RLS: požadavky a jejich filmy vidí **jen autor a správce**; autor smí **zrušit** požadavek, o kterém se ještě
  nerozhodlo. **Zakládat požadavky jde jen přes Edge Function `requests`** (údaje o filmech bere z TMDB sama,
  limity: ≤ 20 filmů v požadavku, ≤ 5 nevyřízených požadavků). Hlasy: vlastní, jen u filmu, který čeká
  (`film_request_pending()`), zrušit vlastní.
- Rozhodnutí (Edge Function `admin`, akce `request-decide`) platí pro film ve **všech** čekajících požadavcích.
- Požadavek na kolekci (V3.5.2): funkce `requests` ověří podle TMDB, že všechny filmy patří do jedné série
  (jinak chyba `not_same_series`), aspoň 2 filmy, série ještě nemá kolekci v MMD ani čekající požadavek.
  Správce z něj vytvoří kolekci akcí `request-create-collection` funkce `admin`.
- **`wanted_films(query, status)`** – jeden řádek na požadovaný film pro všechny přihlášené: `title`,
  `release_date`, `poster_path`, `status` (čeká-li aspoň jeden → `pending`), `wants` (žadatelé + hlasy),
  `i_want`, `requested_by_me`, `first_requested`. Jména žadatelů neprozrazuje.
- **`other_films`** (pohled) – filmy v `films`, které nejsou v žádné kolekci (schválené požadavky, filmy přidané
  adminem). Čte se v hledání; na profilu a ve statistikách jsou jako *Other movies*.

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

- **`universe_progress`** (pohled) – pro přihlášeného uživatele u každého univerza: počet filmů (bez volitelných a chystaných – V3.3; chystaný film se v den premiéry počítá sám – V3.3.1), počet viděných, procento.
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
  **Od V3.4.1:** plná data vrací i **příteli** (i u soukromého profilu) a navíc `is_public` a `friendship`
  (`none` / `friend` / `incoming` / `outgoing` / `self`). Cizí soukromý profil vrací přihlášenému jen
  `{ username, private: true, friendship }` – žádná další data; nepřihlášenému dál `null`.
  **Od V3.4.2:** příteli navíc `ratings: [{ tmdb_id, score }]` (porovnání); ostatním `ratings = null`.
- **`search_public_profiles(query)`** (V2.0) – veřejné profily, jejichž nick obsahuje dotaz (od 2 znaků, max. 10,
  začínající dotazem první). Vrací jen `username` a `member_since`. Od V3.4.1 ji web nepoužívá (nahradila ji `search_people`).
- **`search_people(query)`** (V3.4.1) – veřejné profily a přátelé podle části nicku, soukromý účet jen podle
  **přesného** nicku (a jen pro přihlášené). Vrací `username`, `member_since` (jen u profilů, které smím vidět),
  `visible`, `friendship`.
- **Přátelé (V3.4.1, jen přihlášený):** `send_friend_request(username)` (když mi ten druhý už žádost poslal, rovnou se
  přijme; vrací `sent` / `accepted` / `already_friends` / `already_sent` / `not_found` / `self` / `limit`),
  `respond_friend_request(username, accept)`, `remove_friend(username)` (odebrání přítele, zrušení i odmítnutí
  žádosti), `my_friends()` → `username`, `state` (`friend` / `incoming` / `outgoing`), `since`.
  Pomocné `are_friends()` a `friendship_state()` web volat nesmí.
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
| `profiles` | jen vlastní řádek; profily ostatních jen přes funkce `public_profile` / `search_people` (veřejné a přátelé) | jen vlastní řádek, jen sloupce `username` a `is_public` |
| `watches` | jen vlastní řádky; zhlédnutí veřejných profilů a přátel (film + datum) jen přes `public_profile` | jen vlastní řádky |
| `friendships` | jen vlastní řádky (kde jsem jedna ze stran) | nikdo přímo – jen funkce přátel (V3.4.1) |
| `film_requests`, `film_request_items` | autor a správce; souhrn pro všechny přihlášené přes `wanted_films` | založit jen Edge Function `requests`; autor smí zrušit nerozhodnutý požadavek; rozhodnutí jen funkce `admin` (V3.5.1) |
| `film_request_votes` | jen vlastní | vlastní +1 u čekajícího filmu (V3.5.1) |
| `watchlist` | jen vlastní řádky (vždy soukromý) | jen vlastní řádky |
| `blocked_words` | jen správce | jen správce |
| `heartbeat` | nikdo | jen funkce `ping()` |

Vlastní univerza uživatelů (později) se přidají jako další pravidlo: řádky s `owner_id` vidí a mění jen jejich vlastník.

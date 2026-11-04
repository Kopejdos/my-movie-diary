# Projektová rozhodnutí

Přehled rozhodnutí, která padla během vývoje, a důvody, proč padla.
Aktualizuje se na konci každé fáze.

## Základ projektu

| Co | Rozhodnutí |
|---|---|
| Název | **My Movie Diary** (zkráceně **MMD**) |
| Repozitář | `github.com/Kopejdos/my-movie-diary` (veřejný), větev `main`, každá dokončená fáze má tag `faze-N` |
| Web | `https://kopejdos.github.io/my-movie-diary/` |
| Typ aplikace | webová stránka jako **PWA** – na telefonu jde přidat na plochu a chová se jako aplikace |
| Frontend | HTML, CSS, čistý JavaScript (ES moduly), **bez build kroku** |
| Hosting | **GitHub Pages**, nasazuje GitHub Actions ze složky `web/` |
| Databáze a přihlašování | **Supabase** (PostgreSQL), bezplatný plán, region West EU (Irsko) |
| Data o filmech | **TMDB API** přes Supabase Edge Function |
| Jazyk | aplikace, kód a data **anglicky**; README anglicky (veřejný repozitář); dokumentace v `docs/` česky |
| Licence | MIT |

## Proč právě takhle

### Zavržené varianty
- **Lokální aplikace** (každý si ji spouští sám) – žádná synchronizace mezi mobilem a PC, každý uživatel by si musel udržovat vlastní seznamy filmů.
- **Školní server (PHP + MySQL)** – přihlašování, hesla a zabezpečení by se psaly ručně; navíc dočasné řešení a nejasná pravidla pro provoz služby pro jiné lidi.
- **Hukot.net** – placený webhosting se stejnou nevýhodou jako školní server.
- **MongoDB (Atlas)** – jen databáze bez přihlašování a API (potřeboval by vlastní backend); NoSQL se nehodí na relační data (uživatel → zhlédnutí → film → univerzum).
- **Firebase** – dobrá služba bez uspávání, ale NoSQL a silná vazba na Google. Záložní varianta.

### Proč Supabase
- Normální SQL (PostgreSQL) – data jsou relační.
- Přihlašování hotové (e-mail + heslo, Google), žádný vlastní backend.
- Přístupová práva se nastavují v databázi (**Row Level Security**) – frontend komunikuje s databází přímo.
- Open source: kdyby jednou vznikl vlastní server, data se přestěhují dumpem databáze a aplikace se skoro nezmění.
- **Omezení bezplatného plánu:** projekt bez aktivity v databázi se po 7 dnech uspí. Řeší se GitHub Action, která do databáze pravidelně zapíše (viz Keep-alive).

### Proč GitHub Pages a bez build kroku
- Zdarma, nasazení po každém `git push`, žádný server.
- Bez npm a bundleru: soubory ve `web/` se nasazují přesně tak, jak jsou. Knihovna `supabase-js` se načítá jako ES modul z CDN (jsDelivr).
- Navigace v aplikaci přes **hash router** (`#/universe/mcu`) – GitHub Pages neumí přesměrovat neznámé adresy na `index.html`, s hashem to není potřeba.
- Pages z privátního repozitáře je placená funkce, proto je repozitář veřejný – nesmí v něm být žádné tajné klíče (viz Bezpečnost).

### Proč TMDB přes Edge Function
- Názvy, plakáty, roky a délky filmů se nepíšou ručně – bere je TMDB.
- TMDB token by byl v prohlížeči vidět každému, proto ho drží jen **Edge Function** na serveru Supabase (tajemství `TMDB_READ_TOKEN`). Web volá funkci, funkce volá TMDB.
- Údaje o filmech se **ukládají do tabulky `films`** (cache) – web je pak nezávislý na rychlosti TMDB a nevolá TMDB při každém zobrazení.
- Podmínka TMDB: v aplikaci i v README musí být uvedeno „This product uses the TMDB API but is not endorsed or certified by TMDB.“ a logo TMDB.

### Proč „zhlédnutí“ místo zaškrtávátka
- Místo zaškrtávátka je **counter +1 / −1**, ale v databázi se neukládá číslo – ukládá se **každé zhlédnutí jako záznam** (datum, později hodnocení a poznámka).
- Počet zhlédnutí se jen spočítá. Navíc tak zůstane historie: kdy naposledy, co letos, kolik hodin celkem.
- Film je „viděný“, když má aspoň jedno zhlédnutí. Z toho se počítá postup v univerzu.
- **−1 smaže nejnovější zhlédnutí** daného filmu.

## Bezpečnost – co kam patří

| Údaj | Kde je | Veřejné? |
|---|---|---|
| Project URL Supabase | `web/js/config.js` v repozitáři | ano |
| Publishable key Supabase (`sb_publishable_…`) | `web/js/config.js` v repozitáři | ano – bezpečnost zajišťuje RLS |
| TMDB Read Access Token | Supabase → Edge Functions → Secrets (`TMDB_READ_TOKEN`) | **ne** |
| Heslo k databázi | jen ve správci hesel | **ne** |
| Secret key Supabase | nikde – kód ho nepotřebuje | **ne** |

Nastavení projektu Supabase: Data API zapnuté, automatické zpřístupnění nových tabulek **vypnuté**, automatické RLS **zapnuté**. Každá tabulka tak začíná zamčená a přístup se jí povoluje výslovně v migraci.

## Architektura

```
Prohlížeč (web/ na GitHub Pages)
   │  supabase-js + publishable key
   ▼
Supabase
   ├── Auth            přihlášení (e-mail + heslo, Google)
   ├── PostgreSQL      tabulky + Row Level Security
   └── Edge Function   tmdb – dotahuje data z TMDB do tabulky films
                          │  TMDB_READ_TOKEN
                          ▼
                       TMDB API
```

### Struktura repozitáře

```
my-movie-diary/
├── .github/workflows/
│   ├── deploy-pages.yml      nasazení web/ na GitHub Pages
│   └── keep-alive.yml        pravidelný zápis do databáze
├── docs/
│   ├── decisions.md          tento dokument
│   ├── data-model.md         tabulky a pravidla přístupu
│   └── setup.md              jak projekt zprovoznit od nuly
├── supabase/
│   ├── migrations/           SQL skripty (struktura databáze, verzovaná v Gitu)
│   ├── seed/                 seznamy univerz a filmů
│   └── functions/tmdb/       Edge Function pro TMDB
└── web/
    ├── index.html
    ├── css/
    ├── js/                   config.js, router, obrazovky, práce s daty
    └── manifest.webmanifest  PWA (fáze 6)
```

Pravidla:
- **Logika odděleně od vykreslování:** práce s daty (dotazy do Supabase, výpočet postupu) je v samostatných modulech, obrazovky jen zobrazují.
- **Změny databáze jen přes migrace** v `supabase/migrations/` – nikdy ručním klikáním v Table Editoru (kromě testování dat).
- **Žádné texty natvrdo rozházené po kódu** – texty rozhraní v jednom souboru (příprava na případný další jazyk).

## Univerza (obsah první verze)

| Univerzum | Obsah |
|---|---|
| Marvel Cinematic Universe | jen filmy, skupiny podle fází (Infinity Saga, Multiverse Saga) |
| X-Men | filmy Foxu: hlavní série, Wolverine, Deadpool 1–2, Logan, The New Mutants |
| Spider-Man | skupiny: Raimi, Webb, Spider-Verse, Sony's Spider-Man Universe |
| DC Extended Universe | Man of Steel až Aquaman and the Lost Kingdom |
| DC Universe | od Superman (2025) |
| Batman | Nolanova trilogie, The Batman |
| Alien | Alien 1–4, Prometheus, Covenant, Romulus; skupina AvP jako crossover |
| Studio Ghibli | celá filmografie |
| Pirates of the Caribbean | všech 5 filmů |
| Asterix & Obelix | skupiny: animované a hrané filmy |
| Wizarding World | Harry Potter + Fantastic Beasts |
| Star Wars | hlavní sága a samostatné filmy |
| Middle-earth | Pán prstenů, Hobit (a další filmy ze Středozemě) |
| Jurassic Park | Jurassic Park + Jurassic World |
| Fast & Furious | celá série vč. Hobbs & Shaw |
| Shrek | Shrek 1–4, Puss in Boots |

- **Jeden film může být ve více univerzech** (Deadpool & Wolverine je v MCU i v X-Men). Zhlédnutí se počítá k filmu, takže se ukáže v obou.
- Přesné seznamy filmů se dohledají a ověří ve fázi 1 (od roku 2024 vyšla spousta nových filmů).
- Seriály se nesledují – na to slouží jiná služba.

## Pravidla plánu fází
- Každá fáze je **malá** (zhruba jeden až dva večery) a končí **funkční, nasazenou** verzí webu.
- Fáze, která se ukáže jako příliš velká, se rozdělí na „a“ a „b“.

## Plán fází

| # | Fáze | Co přibude | Co si vyzkoušíš |
|---|---|---|---|
| 0 | Infrastruktura ✅ | repozitář, GitHub Pages s testovací stránkou, Supabase projekt, TMDB token v Secrets | web běží na vlastní adrese |
| 1a | Struktura databáze ✅ | migrace (tabulky, RLS, pohledy, funkce), keep-alive | v Table Editoru jsou tabulky, keep-alive zapisuje |
| 1b | Data o filmech ✅ | Edge Function `tmdb`, seznam 16 univerz (202 filmů), import z TMDB | v tabulkách jsou univerza a filmy s plakáty |
| 2 | Kostra webu a přihlášení | rozvržení, router, registrace (e-mail, heslo, nickname), přihlášení, odhlášení | přihlásíš se na webu |
| 2b | Přihlášení přes Google | Google OAuth v Supabase a tlačítko na webu | přihlášení jedním klepnutím |
| 3 | Univerza a zhlédnutí | přehled univerz s postupem, detail univerza, counter +1 / −1 | odškrtáš si první filmy |
| 4 | Řazení a „co dál“ | pořadí vydání / příběhu, skupiny, filtr neviděných, Up next | víš, co si pustit příště |
| 5 | Watchlist | „chci vidět“ napříč univerzy | seznam na víkend |
| 6 | PWA a vzhled | manifest, ikona, instalace na plochu, doladění na mobilu | MMD jako aplikace v telefonu |

Později podle chuti: hodnocení a poznámky ke zhlédnutí, historie a statistiky, vlastní univerza, export / import, sdílení postupu s přáteli, české názvy filmů.

## Historie fází

### Fáze 0 – infrastruktura ✅ (4. 11. 2026)
- Repozitář `my-movie-diary` (veřejný, MIT), Git nastavený na `Adam Kopecký` a no-reply e-mail GitHubu (soukromý e-mail se nezobrazí v historii).
- GitHub Pages přes GitHub Actions (`deploy-pages.yml`) – nasazuje se jen složka `web/`, workflow běží jen při změně webu.
- Supabase projekt `my-movie-diary` (Free, West EU – Irsko).
- TMDB účet s Developer klíčem (osobní nekomerční použití), Read Access Token uložený v Supabase Secrets jako `TMDB_READ_TOKEN`.

#### Rozhodnutí ve fázi 0
- **Web ve složce `web/`, dokumentace v `docs/`** – GitHub Pages umí nasazovat i ze složky `docs/`, proto je web oddělený a nasazuje se přes Actions; dokumentace se tak na web nedostane.
- **Propojení Supabase s GitHubem** (automatické nasazování migrací) se při zakládání neuložilo. *Změněno ve fázi 1a – nezapíná se, migrace se spouštějí ručně.*

### Fáze 1a – struktura databáze ✅ (4. 11. 2026)
- Migrace `20261104230000_initial_schema.sql`: tabulky `profiles`, `films`, `universes`, `universe_items`, `watches`, `watchlist`, `heartbeat`, pravidla RLS, oprávnění pro Data API.
- Automatický profil při registraci (trigger na `auth.users`): nickname z registračního formuláře, u přihlášení bez nicku (Google) `user_xxxxxxxx`.
- Pohledy `universe_progress` (postup v univerzech) a `my_film_counts` (počet a poslední zhlédnutí filmu); funkce `remove_latest_watch` (−1) a `ping` (keep-alive).
- GitHub Action `keep-alive.yml` volá `ping()` každé 3 dny (ručně: Actions → Keep Supabase awake → Run workflow).
- Migrace otestovaná předem na lokálním PostgreSQL 16 s napodobeným prostředím Supabase (role, `auth.uid()`).

#### Rozhodnutí ve fázi 1a
- **Migrace se spouštějí ručně v SQL Editoru**, v repozitáři jsou kvůli historii a zprovoznění od nuly. Automatické nasazování z GitHubu se nezapíná – migrace spuštěná ručně by se zkusila spustit znovu a skončila by chybou.
- **Názvy migrací ve formátu Supabase CLI** (`RRRRMMDDHHMMSS_popis.sql`) – kdyby se později přešlo na CLI, soubory se nemusí přejmenovávat.
- **Nepřihlášený uživatel smí číst `watches`** (oprávnění GRANT), ale RLS mu neukáže žádný řádek – pohled `universe_progress` tak funguje i bez přihlášení (0 zhlédnutí).
- **Funkce běží s `set search_path = ''`** a plně kvalifikovanými názvy (`public.watches`) – ochrana proti podvržení tabulek, doporučení Supabase.

### Fáze 1b – data o filmech ✅ (5. 11. 2026)
- Edge Function `tmdb` (akce `import`): pro každý film ze seedu najde film v TMDB podle názvu a roku, stáhne detail (název, původní název, datum, délka, plakát, popis), uloží ho do `films` a sestaví univerza a jejich položky.
- Seed `supabase/seed/universes.json`: 16 univerz, 202 filmů. Import uložil 201 (Avengers: Doomsday ještě nevyšel), import trvá ~20 s.
- Migrace `20261105000000_service_role_grants.sql`: oprávnění pro `service_role`.
- Report importu ukáže varování (jiný název / rok v TMDB), nevydané a nenalezené filmy – všech 5 varování při prvním importu byly správné shody.

#### Rozhodnutí ve fázi 1b
- **Seed podle názvu a roku, ne podle TMDB ID** – ID se nemusí dohledávat ručně. Když hledání nestačí, doplní se do seedu `"tmdb": <id>`.
- **Seed je zdroj pravdy:** import je opakovatelný (upsert) a z univerza smaže položky, které v seedu nejsou. Úprava univerza = úprava JSON a nový import (lze i jen jedno univerzum přes `&only=<slug>`).
- **Nevydané filmy se přeskočí** (TMDB status jiný než „Released“) – po premiéře stačí import pustit znovu.
- **Import chrání správcovský klíč** `MMD_ADMIN_KEY` (Supabase Secrets, hlavička `x-admin-key`); ověřování JWT je u funkce vypnuté, protože publishable key není JWT.
- **`service_role` potřebuje oprávnění GRANT** – RLS obchází, ale při vypnutém automatickém zpřístupnění tabulek nemá k tabulkám přístup. Výchozí oprávnění (`alter default privileges`) platí i pro budoucí tabulky.
- **Hlavní obal univerza** = plakát prvního povinného filmu.
- **Spider-Man obsahuje i filmy z MCU** (Tom Holland) – film může být ve více univerzech. Sony's Spider-Man Universe (Venom…) je volitelné, stejně jako AvP u Alienu, Hobbs & Shaw, Zack Snyder's Justice League, Nausicaä a The Red Turtle.

## Drobnosti k dořešení
- GitHub vypne plánované workflow (keep-alive) ve veřejném repozitáři po 60 dnech bez aktivity v repozitáři – přijde e-mail, zapne se jedním kliknutím.

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
| Správcovský klíč pro import | Supabase → Edge Functions → Secrets (`MMD_ADMIN_KEY`) + správce hesel | **ne** |
| Google Client ID | Google Cloud + Supabase → Authentication → Google | ano (je vidět při přihlášení) |
| Google Client secret | jen Supabase → Authentication → Google | **ne** |
| Heslo admin účtu | jen správce hesel | **ne** |
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
   ├── Edge Function   login – přihlášení nickem (k nicku dohledá e-mail na serveru)
   ├── Edge Function   admin – hledání v TMDB, přidání filmu, správa uživatelů (jen správce)
   └── Edge Function   tmdb  – dotahuje data z TMDB do tabulky films
                          │  TMDB_READ_TOKEN
                          ▼
                       TMDB API

Google (OAuth) ──► Supabase Auth ──► zpět na web (?code=… → relace)
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
│   └── functions/
│       ├── tmdb/             import filmů z TMDB (ze seedu)
│       ├── login/            přihlášení nickem
│       └── admin/            akce admin panelu (TMDB, uživatelé)
└── web/
    ├── index.html            jediná stránka aplikace
    ├── privacy.html          zásady ochrany osobních údajů (podmínka Googlu)
    ├── manifest.webmanifest  PWA – název, ikony, režim na celou obrazovku
    ├── sw.js                 service worker – aktualizace a spuštění bez internetu
    ├── icons/                ikony aplikace (filmová klapka „MMD“)
    ├── css/style.css
    └── js/
        ├── app.js            start, hlavička, reakce na přihlášení
        ├── config.js         veřejné adresy a klíče, pravidla registrace
        ├── supabase.js       klient Supabase (z CDN)
        ├── router.js         navigace přes #/…
        ├── texts.js          všechny texty rozhraní
        ├── dom.js            pomocné funkce pro vykreslování
        ├── theme.js          světlý / tmavý režim, barva univerza
        ├── prefs.js          drobné volby v prohlížeči (pořadí, filtr)
        ├── pwa.js            service worker a instalace na plochu
        ├── auth.js           logika přihlášení (bez vykreslování)
        ├── data.js           logika dat – univerza, zhlédnutí (bez vykreslování)
        ├── admin.js          logika admin panelu (bez vykreslování)
        └── views/            obrazovky: universes, universe, login, register, profile,
                              watchlist, admin (univerza, uživatelé), admin-universe, not-found
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
| The Maze Runner | trilogie Labyrint (Útěk, Zkouška ohněm, Lék na smrt) |

- **Jeden film může být ve více univerzech** (Deadpool & Wolverine je v MCU i v X-Men). Zhlédnutí se počítá k filmu, takže se ukáže v obou.
- Seznamy filmů jsou v `supabase/seed/universes.json` (17 univerz, 205 filmů); ověřené ve fázi 1b včetně filmů z let 2025–2026.
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
| 2 | Kostra webu a přihlášení ✅ | rozvržení, router, registrace (e-mail, heslo, nickname), přihlášení, odhlášení | přihlásíš se na webu |
| 2b | Přihlášení přes Google ✅ | Google OAuth, Privacy Policy, aplikace zveřejněná pro všechny | přihlášení jedním klepnutím |
| 2c | Účty ✅ | přihlášení nickem nebo e-mailem, profil se změnou nicku, admin účet, Labyrint | přihlásíš se nickem |
| 3 | Univerza a zhlédnutí ✅ | přehled univerz s postupem, detail univerza, counter +1 / −1 | odškrtáš si první filmy |
| 4 | Redesign ✅ | styl podle RimWorld prezentace + prvky z rozvrhu kamaráda: písmo Chakra Petch, tečkované pozadí, barvy univerz, banner s backdropem, Up next / Continue watching, světlý a tmavý režim | web vypadá jako hotová aplikace |
| 5 | Admin panel ✅ | univerza (vytvořit, upravit, smazat), filmy přes hledání v TMDB, uživatelé (seznam, správce, smazání) | spravuješ obsah bez SQL a curl |
| 6 | Řazení a filtr ✅ | pořadí vydání / příběhu, filtr neviděných | sleduješ univerzum chronologicky |
| 7 | Watchlist ✅ | „chci vidět“ napříč univerzy | seznam na víkend |
| 8 | PWA ✅ | manifest, ikona, instalace na plochu | MMD jako aplikace v telefonu |

Všechny plánované fáze jsou hotové. Později podle chuti: hodnocení a poznámky ke zhlédnutí, historie a statistiky, vlastní univerza, export / import, sdílení postupu s přáteli, české názvy filmů.

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

### Fáze 2 – kostra webu a přihlášení ✅ (5. 11. 2026)
- Web v `web/`: jedna stránka `index.html`, ES moduly bez build kroku, `supabase-js` z CDN jsDelivr.
- Hash router (`#/`, `#/universe/<slug>`, `#/login`, `#/register`, `#/profile`), stránka 404.
- Registrace (nickname, e-mail, heslo), přihlášení, odhlášení; nickname v hlavičce.
- Migrace `20261105010000_username_check.sql`: unikátní nickname bez ohledu na velikost písmen a funkce `is_username_available` (registrace se ptá dřív, než účet založí).
- Před nasazením otestováno v Chromiu (Playwright) proti napodobenému Supabase – registrace, přihlášení, counter, odhlášení, 404.

#### Rozhodnutí ve fázi 2
- **Čistý JavaScript bez frameworku**, prvky se skládají funkcí `h()` přes `textContent` – nikdy `innerHTML`, názvy filmů ani nicky nemůžou do stránky podstrčit kód.
- **Logika (`auth.js`, `data.js`) oddělená od obrazovek (`views/`)**, texty rozhraní v `texts.js`.
- **Potvrzování e-mailu je vypnuté** (Supabase → Authentication → Email → Confirm email). Bezplatná e-mailová služba Supabase posílá jen členům projektu a jen pár e-mailů za hodinu – kamarádi by se nezaregistrovali. Kdyby bylo potřeba, napojí se vlastní SMTP (např. Resend).
- **Site URL a Redirect URLs** v Supabase = adresa webu – jinak odkazy z e-mailů a návrat z Google vedou na `localhost:3000`.

### Fáze 2b – přihlášení přes Google ✅ (5. 11. 2026)
- Tlačítko „Continue with Google“ na přihlášení i registraci.
- Google Cloud projekt „My Movie Diary“: OAuth klient (Web application), origin `https://kopejdos.github.io`, redirect `https://<projekt>.supabase.co/auth/v1/callback`; aplikace zveřejněná (In production) – přihlásit se může kdokoli.
- Stránka `web/privacy.html` (zásady ochrany osobních údajů) – Google ji vyžaduje pro zveřejnění; odkaz v patičce.

#### Rozhodnutí ve fázi 2b
- **PKCE** (`flowType: "pkce"`): výsledek přihlášení se vrací jako `?code=…`, ne v `#…` – hash patří routeru.
- **Google uživatel dostane nickname `user_xxxxxxxx`** a web ho po prvním přihlášení pošle na profil zvolit si vlastní.
- **Bez loga aplikace v Google Cloud** – logo by vyžadovalo ruční ověření aplikace Googlem (několik dní).
- **Kontakt pro smazání účtu v Privacy Policy = GitHub Issues**, ne osobní e-mail (stránka je veřejná).

### Fáze 2c – účty ✅ (5. 11. 2026)
- Přihlášení **nickem nebo e-mailem** v jednom poli (s `@` = e-mail).
- Edge Function `login` + migrace `20261105030000_login_by_username.sql`: funkce `email_for_username`, kterou smí volat jen `service_role`.
- Profil (`#/profile`): změna nicku; štítek Administrator.
- Migrace `20261105020000_profiles_admin.sql`: sloupec `profiles.is_admin`; uživatel smí ve svém profilu měnit jen `username`.
- Admin účet (`admin`, e-mail `adiskop987+admin@gmail.com`) založený ručně v Authentication → Users, `is_admin` nastavený v SQL.
- Nové univerzum **The Maze Runner** (Labyrint), import jen jednoho univerza přes `&only=maze-runner`.

#### Rozhodnutí ve fázi 2c
- **Přihlášení nickem přes Edge Function**, ne přes veřejnou databázovou funkci – jinak by šlo z nicku zjistit cizí e-mail. Funkce vrací stejnou chybu pro neexistující nick i špatné heslo.
- **Oprávnění na sloupec** (`grant update (username)`) – pravidlo RLS omezí řádek na vlastní profil, oprávnění omezí sloupce; `is_admin` si nikdo nenastaví sám.
- **Heslo admin účtu není v repozitáři ani v migracích**, účet se zakládá ručně.

### Fáze 3 – univerza a zhlédnutí ✅ (5. 11. 2026)
- Přehled univerz: kartičky s plakátem prvního filmu a ukazatelem postupu (nepřihlášený vidí počet filmů).
- Detail univerza: filmy v pořadí vydání, nadpisy skupin, rok, délka, stav („Watched 2× · Last: 5 Nov 2026“), counter − / +, ukazatel postupu; volitelné filmy čárkovaně a mimo postup.

#### Rozhodnutí ve fázi 3
- **Optimistický counter:** číslo i postup se změní hned po kliknutí, dotaz běží na pozadí; při chybě se změna vrátí a ukáže se hláška.
- **Datum zhlédnutí posílá web podle hodin uživatele** – databáze běží v UTC a po půlnoci by zapsala včerejšek.
- **Po −1 se počty načtou znovu** – může se změnit datum posledního zhlédnutí.

### Fáze 4 – redesign ✅ (5. 11. 2026)
- **Kombinace dvou vzorů:** základ z vlastní RimWorld prezentace (teplé tmavé barvy, mosazný akcent, nadpisy **Chakra Petch**, fotka přecházející do pozadí) + prvky z rozvrhu spolužáka (tečkovaná mřížka, barevné záře v rozích, lesklé karty, pilulková tlačítka, šrafování). Kód rozvrhu se nepřebíral, jen styl.
- **Barva každého univerza** (`universes.color`, v seedu `"color"`): záře pozadí, proužek a záře karty, tlačítka, ukazatel postupu, nadpisy skupin.
- **Banner v detailu univerza:** širokoúhlý záběr z filmu (TMDB backdrop, `films.backdrop_path`) přes celou šířku, ztmavený a v dolní části zprůhledněný do tečkovaného pozadí.
- **Up next** v detailu (další neviděný povinný film, tlačítko „+ Mark as watched“; po dokončení 🏆) a **Continue watching** na přehledu (další film z univerza, které uživatel sledoval naposledy).
- **Světlý a tmavý režim** s přepínačem ☀ / ☾ v hlavičce; bez volby podle systému, volba se pamatuje v prohlížeči.
- Migrace `20261105040000_universe_color_backdrop.sql`, nová verze funkce `tmdb` (ukládá backdrop a barvu) a nový import všech univerz.

#### Rozhodnutí ve fázi 4
- **Vlastní písmo z prezentace, ne písmo spolužáka** – web má vlastní rukopis; text zůstává v Inter (čitelnost).
- **Barva univerza jako proměnná CSS `--u`** na celé stránce (nastavuje `theme.js`), barva textu na ní (`--u-ink`) se dopočítá podle jasu – na žluté je černý text, na modré bílý.
- **Backdrop místo plakátu pro banner** – plakát je na výšku a v širokém banneru by se ořízl.
- **Banner jako samostatná vrstva s maskou** (`mask-image`) – dole zprůhlední, takže mezi bannerem a tečkovaným pozadím není předěl.
- **Režim se nastaví malým skriptem v `<head>` ještě před vykreslením** – jinak by stránka při načtení problikla tmavým režimem.
- **Tematické barvy univerz** (MCU červená, Ghibli mátová…) místo náhodné palety; admin je později může změnit.

### Fáze 5 – admin panel ✅ (5. 11. 2026)
- Odkaz **Admin** v hlavičce (jen pro správce), záložky **Universes** a **Users**.
- **Univerza:** seznam s barvou, adresou a počtem filmů; posun nahoru / dolů (pořadí na přehledu); nové univerzum (název, adresa se doplní z názvu, popis, barva); smazání s potvrzením.
- **Editor univerza** (`#/admin/universe/<slug>`): název, popis, barva (náhled hned při výběru); filmy – skupina, číslo v příběhu, volitelný, „Use as cover“, posun, odebrání; **přidání filmu hledáním v TMDB** přímo z webu.
- **Uživatelé:** nick, e-mail, způsob přihlášení (Email / Google), počet zhlédnutí, datum registrace; udělit / odebrat správce; smazat účet (i se všemi zhlédnutími). Sám sebe správce měnit ani smazat nemůže.
- Migrace `20261105050000_admin_panel.sql`: funkce `is_admin()` a pravidla RLS – univerza a jejich položky smí zakládat, měnit a mazat jen správce.
- Edge Function `admin`: `search`, `add-film`, `users`, `set-admin`, `delete-user`.

#### Rozhodnutí ve fázi 5
- **Univerza a položky upravuje web přímo přes Supabase** – pravidla RLS s `is_admin()` pustí jen správce, není potřeba serverový kód.
- **TMDB a uživatelé přes Edge Function `admin`** – TMDB token a serverový klíč (seznam účtů, mazání) nesmí do prohlížeče. Funkce si sama ověří přístupový token a příznak správce.
- **Úpravy filmu se ukládají hned po opuštění pole** (událost `change`) – bez tlačítka Uložit u každého řádku.
- **Potvrzení mazání přes `window.confirm`** – jednoduché a funguje na telefonu.
- **Seed vs. admin panel:** import ze seedu je dál zdroj pravdy pro univerza v `universes.json` – **přepíše změny z admin panelu a smaže filmy, které v seedu nejsou**. Univerza založená v admin panelu (nejsou v seedu) import nechá být. Po zavedení admin panelu se plný import nespouští; nová univerza a filmy se přidávají přes panel.

### Fáze 6 – řazení a filtr ✅ (5. 11. 2026)
- V detailu univerza přepínač **Release order / Story order** (jen u univerz, kde má aspoň jeden film číslo v příběhu) a přepínač **Unwatched only**.
- V pořadí příběhu se neukazují nadpisy skupin (rozházely by se); **Up next** se řídí zvoleným pořadím.
- Pořadí příběhu v seedu (`"story"`) pro MCU, Star Wars, X-Men a Alien; ostatní univerza mají příběh shodný s vydáním. Dá se upravit i v admin panelu (Story #).

#### Rozhodnutí ve fázi 6
- **Film bez čísla v příběhu jde v pořadí příběhu na konec** (podle vydání) – univerzum nemusí být očíslované celé.
- **Volby se pamatují v prohlížeči** (`prefs.js`, localStorage) společně pro všechna univerza.
- **Pořadí příběhu je přibližné** – chronologie MCU a X-Men se mezi zdroji liší; slouží jako vodítko, ne jako oficiální timeline.

### Fáze 7 – watchlist ✅ (5. 11. 2026)
- **Hvězdička ☆ / ★** u každého filmu v detailu univerza – přidá film do watchlistu nebo ho odebere.
- Stránka **Watchlist** (`#/watchlist`, odkaz ★ v hlavičce): filmy od naposledy přidaného, s rokem, délkou, datem přidání a barevnými odkazy na univerza, ve kterých film je; tlačítka „+ Mark as watched“ a „Remove from watchlist“.
- Migrace `20261105060000_watchlist.sql`: trigger – **film označený jako viděný sám zmizí z watchlistu**, ať se zhlédnutí zapíše odkudkoli (detail, Up next, Continue watching, watchlist).
- Na úzkém telefonu se v hlavičce schová odkaz „Universes“ (na přehled vede logo) a „Sign out“ (odhlášení je na stránce profilu); u odkazu Watchlist zůstane jen ★.
- Správné jednotné číslo („1 movie“).

#### Rozhodnutí ve fázi 7
- **Odebrání z watchlistu po zhlédnutí řeší databáze (trigger)**, ne web – platí pro všechna místa, kde jde film označit jako viděný, i pro budoucí.
- **Watchlist napříč univerzy**, ne zvlášť pro každé univerzum – jeden seznam „na víkend“; univerzum filmu je vidět u každé položky.
- **Hvězdička jde i u viděného filmu** – „chci znovu vidět“; po dalším zhlédnutí z watchlistu opět zmizí.

### Fáze 8 – PWA ✅ (5. 11. 2026)
- **Instalace na plochu:** `manifest.webmanifest` (název, krátký název „MMD“, barvy, režim `standalone`), ikony 192 / 512 px, maskovatelná ikona pro Android a ikona pro iPhone.
- **Ikona:** filmová klapka v mosazné barvě s nápisem „MMD“ v písmu Chakra Petch, tmavé pozadí s tečkovanou mřížkou (vygenerovaná skriptem, stejný styl jako web).
- **Tlačítko „⤓ Install“** v hlavičce (Chrome, Edge, Android – jen když jde aplikace nainstalovat) a karta **Install the app** na profilu: tlačítko, návod pro iPhone (Sdílet → Přidat na plochu), nebo potvrzení, že aplikace běží nainstalovaná.
- **Service worker** (`sw.js`): soubory webu vždy ověří u serveru (síť první, bez mezipaměti prohlížeče) – **nová verze je po nasazení vidět hned, bez Ctrl+F5**; bez internetu se aplikace otevře z uložené verze. Knihovna Supabase a písma z mezipaměti.
- Hlášky „You are offline“ / „Back online“.
- Otestováno v Chromiu: registrace, uložení 29 souborů, otevření a navigace bez internetu.

#### Rozhodnutí ve fázi 8
- **Síť první pro soubory webu** místo „mezipaměť první“ – u často nasazovaného webu je důležitější aktuálnost; offline je jen záloha. Řeší i problém, kdy prohlížeč držel starý JavaScript.
- **Data ze Supabase se offline neukládají** – zhlédnutí bez připojení by se musela synchronizovat (složité, zatím zbytečné); offline aplikace jen upozorní.
- **Obrázky z TMDB service worker neukládá** – načítají se bez CORS a Chrome by si je v mezipaměti počítal po megabajtech; obstará je běžná mezipaměť prohlížeče.
- **Vlastní tlačítko Install** místo automatické lišty prohlížeče – nabídne se až na vhodném místě (hlavička, profil), ne hned po otevření.
- **Verze mezipaměti v `sw.js` (`VERSION`)** – při velké změně struktury se zvýší a staré mezipaměti se smažou.

## Drobnosti k dořešení
- Nausicaä se v TMDB může zobrazovat pod starým americkým názvem *Warriors of the Wind* – případně doplnit možnost přepsat zobrazovaný název (admin panel).
- Správcovský klíč `MMD_ADMIN_KEY` byl vidět na screenshotu – po dokončení importů vygenerovat nový.
- GitHub vypne plánované workflow (keep-alive) ve veřejném repozitáři po 60 dnech bez aktivity v repozitáři – přijde e-mail, zapne se jedním kliknutím.

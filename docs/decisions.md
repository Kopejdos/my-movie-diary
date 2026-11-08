# Projektová rozhodnutí

Přehled rozhodnutí, která padla během vývoje, a důvody, proč padla.
Aktualizuje se na konci každé fáze.

## Základ projektu

| Co | Rozhodnutí |
|---|---|
| Název | **My Movie Diary** (zkráceně **MMD**) |
| Repozitář | `github.com/Kopejdos/my-movie-diary` (veřejný), větev `main`, každá dokončená fáze má tag verze (`faze-N` do V1.0, od V1.1 `vX.Y`) |
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
- Bez npm a bundleru: soubory ve `web/` se nasazují přesně tak, jak jsou. Knihovna `supabase-js` je uložená v projektu jako jeden předpřipravený soubor (`web/vendor/`, od V1.4.1; dřív z CDN jsDelivr).
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

**Veřejné profily (V2.0):** pravidla RLS u `profiles` a `watches` zůstala „jen vlastní řádky“. Data cizích uživatelů vrací
jen funkce `public_profile` a `search_public_profiles` (`security definer`, `search_path = ''`) a jen u profilů, které
uživatel sám zveřejnil. Ven jde nick, měsíc registrace a zhlédnutí (film + datum) – nikdy e-mail, id účtu, admin,
watchlist, hodnocení ani poznámky.

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
├── scripts/
│   └── import.sh             import kolekcí ze seedu (reporty do import-reports/)
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
    ├── fonts/                písma Inter a Chakra Petch (woff2, latinka + latin-ext)
    ├── vendor/               knihovna supabase-js jako jeden soubor (verze v názvu)
    ├── css/style.css
    └── js/
        ├── app.js            start, hlavička, reakce na přihlášení
        ├── config.js         veřejné adresy a klíče, pravidla registrace
        ├── supabase.js       klient Supabase (z vendor/)
        ├── router.js         navigace přes #/… (i s ?parametry)
        ├── texts.js          všechny texty rozhraní
        ├── dom.js            pomocné funkce pro vykreslování
        ├── theme.js          světlý / tmavý režim, barva univerza
        ├── prefs.js          drobné volby v prohlížeči (pořadí, filtr)
        ├── pwa.js            service worker a instalace na plochu
        ├── auth.js           logika přihlášení (bez vykreslování)
        ├── data.js           logika dat – univerza, zhlédnutí (bez vykreslování)
        ├── admin.js          logika admin panelu (bez vykreslování)
        ├── achievements.js   výpočet achievementů ze zhlédnutí (bez vykreslování)
        ├── search.js         vyhledávání – normalizace textu a pořadí výsledků (bez vykreslování)
        ├── stats.js          statistiky profilu ze zhlédnutí (bez vykreslování)
        ├── social.js         veřejné profily, hledání lidí, sdílení odkazu (bez vykreslování)
        ├── cache.js          mezipaměť katalogu v paměti (V2.1)
        ├── captcha.js        CAPTCHA Cloudflare Turnstile (V2.6)
        ├── ratings.js        hodnocení filmů – data (V3.2)
        ├── today.js          „Co dneska?“ – výběr tří tipů (V3.3, bez vykreslování)
        ├── compare.js        porovnání s kamarádem (V3.4.2, bez vykreslování)
        ├── requests.js       požadavky na filmy – data (V3.5.1)
        └── views/            obrazovky: universes, universe, search, upcoming (Coming soon), friends, compare, requests, admin-requests, stats, public-profile, login,
                              register, profile, watchlist, achievements, admin (univerza, uživatelé), admin-universe, not-found;
                              části: rating (hvězdičky), today (panel Co dneska?), coming-soon (oddíl Coming soon)
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
| Mad Max | 5 filmů, pořadí příběhu (Furiosa před Fury Road) – V1.1 |
| Avatar | 3 filmy, další po premiéře – V1.1 |
| Disney Animation | 65 animovaných filmů Walt Disney Animation Studios ve skupinách podle období + 20 hraných remaků (volitelné) – V1.1 |
| Pixar | 31 celovečerních filmů ve skupinách podle desetiletí – V1.1 |
| DreamWorks Animation | 49 animovaných filmů + 2 hrané / hybridní (volitelné) – V1.1 |

- **Jeden film může být ve více univerzech** (Deadpool & Wolverine je v MCU i v X-Men). Zhlédnutí se počítá k filmu, takže se ukáže v obou.
- Seznamy filmů jsou v `supabase/seed/universes.json` (22 univerz, 380 položek); ověřené ve fázích 1b a 9 včetně filmů z let 2025–2026.
- Seriály se nesledují – na to slouží jiná služba.

## Pravidla plánu fází
- Každá fáze je **malá** (zhruba jeden až dva večery) a končí **funkční, nasazenou** verzí webu.
- Fáze, která se ukáže jako příliš velká, se rozdělí na „a“ a „b“.
- **Každá dokončená fáze = nová verze aplikace** (viz Verzování).

## Verzování

Formát **V<hlavní>.<vedlejší>.<oprava>** (např. V1.2.1):

| Část | Kdy se zvyšuje | Příklad |
|---|---|---|
| hlavní | velký milník – aplikace je „hotová“ v nové podobě | V0.7 → **V1.0** (fáze 8, PWA) |
| vedlejší | dokončená fáze (nové funkce) | V1.0 → **V1.1** (fáze 9) |
| oprava | oprava chyby nebo drobnost bez nové funkce | V1.1 → **V1.1.1** |

- **Výjimka V3.0:** velká fáze organizace kolekcí je rozdělená na **V3.0.1** a **V3.0.2** (třetí číslo tu
  znamená část fáze, ne opravu). Případné opravy pak dostanou další číslo (V3.0.3…).
- Verze a **měsíc poslední aktualizace** jsou v patičce webu (např. „V1.1 · November 2026“). Obojí je v `web/js/config.js` (`APP_VERSION`, `APP_UPDATED`) – při vydání nové verze se změní tam.
- Při vydání: úprava `config.js`, záznam do `CHANGELOG.md`, commit a **tag verze** (`git tag v1.1`, `git push --tags`). Tagy `faze-N` z verzí V0.x zůstávají, od V1.1 se používají jen tagy `vX.Y`.

### Pořadí kroků při vydání (důležité!)
Web se po pushi nasadí do minuty, takže databáze a funkce musí být připravené **dřív**:
1. **migrace** v SQL Editoru (nové tabulky, sloupce),
2. **Edge Functions** – nasadit nové verze,
3. **import** nových kolekcí (`./scripts/import.sh …`),
4. teprve pak **commit, push a tag** (nasazení webu).

Opačné pořadí ve V1.2 způsobilo chybu „Could not find the table 'public.categories'“ (web byl napřed před databází) a import se starou funkcí, který neuložil kategorie.
- Zpětné přiřazení verzí:

| Verze | Fáze | Tag |
|---|---|---|
| V0.0 | 0 – infrastruktura | `faze-0` |
| V0.1 | 1a, 1b – databáze a data | `faze-1`, `faze-1a` |
| V0.2 | 2, 2b, 2c – web, přihlášení, Google, účty | `faze-2` |
| V0.3 | 3 – univerza a zhlédnutí | `faze-3` |
| V0.4 | 4 – redesign | `faze-4` |
| V0.5 | 5 – admin panel | `faze-5` |
| V0.6 | 6 – řazení a filtr | `faze-6` |
| V0.7 | 7 – watchlist | `faze-7` |
| **V1.0** | 8 – PWA | `faze-8` (+ doplnit `v1.0`) |

## Plán fází

### Verze 0.x a 1.0 (hotovo)

| # | Verze | Fáze | Co přibylo |
|---|---|---|---|
| 0 | V0.0 | Infrastruktura ✅ | repozitář, GitHub Pages, Supabase, TMDB token |
| 1a, 1b | V0.1 | Databáze a data ✅ | tabulky, RLS, keep-alive, Edge Function `tmdb`, 16 univerz z TMDB |
| 2, 2b, 2c | V0.2 | Web a přihlášení ✅ | registrace, přihlášení e-mailem / nickem / Googlem, profil, admin účet, Labyrint |
| 3 | V0.3 | Univerza a zhlédnutí ✅ | přehled s postupem, detail se skupinami, counter +1 / −1 |
| 4 | V0.4 | Redesign ✅ | Chakra Petch, barvy univerz, banner, Up next, Continue watching, světlý / tmavý režim |
| 5 | V0.5 | Admin panel ✅ | univerza, filmy přes hledání v TMDB, uživatelé |
| 6 | V0.6 | Řazení a filtr ✅ | pořadí vydání / příběhu, Unwatched only |
| 7 | V0.7 | Watchlist ✅ | hvězdička ☆, stránka Watchlist |
| 8 | **V1.0** | PWA ✅ | instalace na plochu, ikona, service worker, offline |

### Verze 1.x

| # | Verze | Fáze | Co přibude |
|---|---|---|---|
| 9 | V1.1 | Nová univerza + verze v patičce ✅ | Mad Max, Avatar, Disney, Pixar, DreamWorks; verze v patičce; `CHANGELOG.md` |
| 9.1 | V1.1.1 | Přejmenování ✅ | Universes → **Collections** v celé aplikaci |
| 10 | V1.2 | Kategorie + horory, vlna 1 ✅ | kategorie na přehledu, hororové série, prvních 7 hororových žánrů |
| 11 | V1.3 | Achievementy ✅ | odznaky za filmy, čas, maratony, dokončené kolekce a kategorie |
| 12 | V1.4 | Úrovně a XP ✅ | level a filmový titul z XP (filmy, opakování, kolekce, achievementy), odznak v hlavičce, Level up; Insidious: Out of the Further |
| 13 | V1.5 | Horory, vlna 2 ✅ | dalších 7 žánrů |
| 14 | V1.6 | Vyhledávání ✅ | stránka hledání – filmy a kolekce, i bez diakritiky a podle roku; klávesa / |
| 15 | V1.7 | Horory, vlna 3 ✅ | posledních 7 žánrů + J-Horror |
| 16 | V1.8 | Cesty (paths) ✅ | 6 kurátorských tras krok za krokem s poznámkami, achievement Pathfinder, správa v adminu |
| 17 | V1.9 | Statistiky profilu ✅ | stránka Stats – souhrn, aktivita, nejčastěji viděné, dekády, kategorie, skoro hotové kolekce, zajímavosti |
| 18 | **V2.0** | Sdílení profilu ✅ | veřejný profil (level, achievementy, statistiky), odkaz ke sdílení, hledání lidí – z osobního deníku sociální aplikace |

Hororové vlny se střídají s funkcemi, aby každá verze přinesla něco nového. Později podle chuti: hodnocení a poznámky ke zhlédnutí, vlastní kolekce uživatelů, export / import, české názvy filmů.

### Kapitola V2.x – optimalizace a bezpečnost

| # | Verze | Fáze | Co přibude |
|---|---|---|---|
| 19 | V2.1 | Optimalizace ✅ | plakáty a banner ve správné velikosti, mezipaměť katalogu, detail kolekce jedním dotazem, přednačtení po najetí na kartu |
| 20 | V2.2 | O aplikaci a pravidla ✅ | stránka **About** (co je MMD, kdo ho dělá, TMDB, verze), **kontakt**, nová **patička** (About · Terms · Privacy · Contact · GitHub), **Terms of Service** a **pravidla komunity** (nicky, minimální věk 15 let, právo smazat / přejmenovat účet), souhlas při registraci, aktualizace zásad ochrany soukromí (co se ukládá, admin vidí e-mail, propojení účtů) |
| 21 | V2.3 | Nicky a moderace ✅ | **filtr nicků v databázi** (zakázaná slova česky i anglicky, obcházení typu `f4gg0t` a podtržítek, rezervovaná jména admin / support / moderator), seznam zakázaných slov spravovaný v adminu, **Reset nickname** v adminu, **Delete my account** pro uživatele (Edge Function, právo na výmaz) |
| 22 | V2.4 | E-mail ✅ | **vlastní SMTP** (samostatný Gmail + heslo aplikace), **vlastní vzhled mailů** v designu MMD (potvrzení, obnova hesla, změna e-mailu), po potvrzení hláška a přesměrování na přihlášení, „Please confirm your email“ i u přihlášení nickem, **Resend confirmation** |
| 23 | V2.5 | Hesla ✅ | **Forgot password** (stránka pro nové heslo), **změna hesla v profilu**, přísnější pravidla hesla (délka, povinné znaky) i v Supabase |
| 24 | V2.6 | CAPTCHA ✅ | Cloudflare Turnstile – registrace, přihlášení (i nickem přes funkci `login`), obnova hesla, Resend confirmation, změna hesla; zmínka v zásadách (zpracovává Cloudflare); předvyplnění e-mailu u Forgot password a rámeček s účtem u nového hesla |
| 25 | V2.7 | Optimalizace 2 ✅ | odlehčená knihovna Supabase (−40 %), minifikace JS a CSS při nasazení, písmo Inter bez přednačtení – poslední verze kapitoly |

### Kapitola V3.x – kolekce a nové funkce (plán 6. 11. 2026)

Nejdřív se uklidí a rozšíří to, co už na webu je (V3.0), a teprve podle nového standardu přibydou nové kolekce
(V3.1). Pak funkce jedna po druhé.

| # | Verze | Fáze | Co přibude |
|---|---|---|---|
| 26 | V3.0.1 | Organizace kolekcí 1 – zobrazení ✅ | **tři pohledy na kolekci** (Release / Story / Groups), nové údaje u filmu v kolekci (**skupina** a **popisek**), import + admin panel, hledání najde i skupinu (*Pixar › Cars*), cesty na přehledu níž; ukázková data (MCU podle hrdinů, Star Wars s čísly epizod) |
| 27 | V3.0.2 | Organizace kolekcí 2 – obsah ✅ | Pixar, DreamWorks, Disney, MCU a další série přeskupené podle sérií, popisky (Episode IV, Part 2…), **zrušení kolekce Shrek**, **cesty přepsané na skutečně doporučené pořadí** |
| 28 | V3.1.1 | Kontrola kolekcí ✅ | projít **všechny existující kolekce** a doplnit chybějící filmy (jen filmy, ne seriály), sjednotit série a popisky podle standardu V3.0 |
| 29 | V3.1.2 | Dvouvrstvý filtr ✅ | přehled: 1. **druh** (All / Series / Studios / Genre picks / Paths), 2. **žánr**; Sci-fi & Fantasy rozdělené, nové kategorie Comedy a Crime & Thriller |
| 30 | V3.1.3 | Velká studia ✅ | **Marvel** (všechny filmy podle Marvelu: MCU, X-Men, Sony, před MCU), **DC** (DCEU, DCU, Batman, staří Supermani, Joker…), **Lucasfilm** (Star Wars, Indiana Jones, Willow), **Illumination**, **Laika**, **Aardman** a další – série jako skupiny v By series |
| 31 | V3.1.4 | Žánrové výběry mimo horory ✅ | 8 tematických výběrů po 12–15 filmech (sci-fi, akce, vánoční…), ne obecné „Action“ |
| 32 | V3.1.5 | Nové série ✅ | James Bond, Mission: Impossible, John Wick, Indiana Jones… – podle standardu V3.0 |
| 33 | V3.2 | Hodnocení ✅ | **0,5–5 ★** (po půlhvězdách) u každého filmu, vlastní hodnocení + průměr uživatelů MMD, nejlépe hodnocené ve statistikách |
| 34 | V3.3 | Co dneska? + Coming soon ✅ | panel **What to watch today?** se třemi tipy (watchlist / další v rozkoukané kolekci / něco nového podle oblíbených žánrů) + Shuffle; **Coming soon** – oznámené filmy dole v kolekci (do 5 let dopředu), nepočítají se do postupu |
| 34b | V3.3.1–2 | Stránka Coming soon ✅ | záložka **Coming soon** v menu – všechny chystané filmy po čtvrtletích; hranice 5 let a přepnutí v den premiéry automaticky; chystaný podle data, ne stavu v TMDB (V3.3.2) |
| 35 | V3.4.1 | Přátelé ✅ | vzájemné přátelství (žádost → přijetí), přidání podle nicku, odznak žádostí v hlavičce, záložka **Friends** u profilu; přítel vidí i soukromý profil |
| 36 | V3.4.2 | Porovnání s kamarádem ✅ | společně viděné filmy, co viděl jen jeden z vás, shoda v % a v hodnocení (hodnocení jen u přátel), kolekce vedle sebe, doporučení |
| 37 | V3.5.1 | Požadavky na filmy ✅ | záložka **Requests**: požadavek s více filmy z TMDB, +1 u existujícího požadavku, **My requests** se stavem; admin inbox (přijmout celý / výběr, návrh kolekce podle TMDB); schválené filmy bez kolekce v hledání a na profilu jako *Other movies*; série **Wrong Turn** a **Texas Chainsaw Massacre** |
| 38 | V3.5.2 | Vlastní seznamy | neoficiální kolekce uživatelů **jen z filmů v databázi**: název, popis, 1–3 kategorie, vlastní pořadí, viditelnost soukromá / přátelé / veřejná, na profilu, počítadlo zobrazení |
| 39 | V3.5.3 | Komunita | veřejné seznamy v hledání; sekce **Community** dole na přehledu (top 7 podle zobrazení, řídí se filtry, záložka *Community*); nahlášení a skrytí adminem |
| 40 | V3.6.1 | Přepracování postupu | strmější křivka úrovní (100 filmů ≈ úroveň 5, 500 ≈ 10, *Legend* ≈ 3 000+), XP za kolekci podle velikosti (10 XP za film místo pevných 100), vyšší úrovně achievementů (Collector 500/1 000, Screen Time 500/1 000 h, Completionist 50), zápis **„Seen before“ bez data** (počítá se do kolekcí a filmů, ne do Marathonu, sérií dní ani Wrapped) |
| 41 | V3.6.2 | Optimalizace a úklid | sdílené kousky kódu místo kopií (hvězdička watchlistu, pilulka kolekce, `check()`), úklid `style.css`, testy do repozitáře (`tests/`), Lighthouse, indexy v databázi, přístupnost – **jako poslední krok před V4.0** |

#### Kapitola V3.5 – podrobnosti (plán 8. 11. 2026)

**Požadavky (V3.5.1)**
- Katalog zůstává **kurátorský**: film se do databáze dostane jen přes **schválený požadavek** (nebo import / admin),
  ne tím, že ho někdo zapíše jako viděný.
- Požadavek = **jeden nebo víc filmů** (vybrané hledáním v TMDB přímo ve formuláři) + nepovinná poznámka. Jen na
  **filmy**, ne na celé kolekce (kolekce si uživatel udělá sám jako vlastní seznam).
- Stránka **Requests** v menu (pro přihlášené): hledání v požadavcích; když už film někdo chce, místo nového
  požadavku **+1**; **My requests** se stavem *Pending* / *Added* / *Rejected* – u částečně přijatého po filmech.
- **Admin** přijme celý požadavek nebo jen vybrané filmy; u každého filmu vidí **návrh kolekce** podle série
  a studia v TMDB a zařadí ho jedním klikem (původní nápad „návrhy do kolekcí“ je tak součástí přijímání).
- Schválený film bez kolekce: najde se v hledání, jde zapsat jako viděný / do watchlistu / ohodnotit,
  na profilu a ve statistikách jako **Other movies**; do postupu kolekcí se nepočítá.
- Proti spamu: nejvýš ~5 nevyřízených požadavků na uživatele a 20 filmů v jednom.
- V hledání odkaz „Can't find a movie? Request it“.

**Vlastní seznamy (V3.5.2)**
- Jen z filmů, které už jsou v databázi (tlačítko *+ Add to list* u filmu v kolekci, hledání, watchlistu).
- Název, popis, **1–3 kategorie** z našich (kvůli filtru v komunitě), vlastní pořadí.
- Viditelnost **soukromá / přátelé / veřejná**; kdo seznam otevře, vidí v něm **svůj** postup.
- **Počítadlo zobrazení**: jedno na uživatele (nepřihlášený jednou za den), aby si ho autor nenahnal obnovováním.
- Název a popis projdou filtrem zakázaných slov (jako nicky).

**Komunita (V3.5.3)**
- Na hlavní stránce **ne** – veřejné seznamy se najdou přes **hledání**.
- Výjimka: sekce **Community** úplně dole pod Paths – **jedna řada 7 nejoblíbenějších** podle zobrazení.
  Řídí se filtry nahoře: nová záložka **Community** mezi Series / Studios / Genre picks / Paths a žánrové
  kategorie; při *All + All* top 7 celkově.
- Nahlášení nevhodného seznamu, admin ho může skrýt.

#### Kapitola V4.x – přizpůsobení (plán 7. 11. 2026, upraveno 8. 11.)
| Fáze | Verze | Název | Obsah |
|---|---|---|---|
| 42 | V4.0 | Nastavení ⚙ | tlačítko ⚙ místo ☾ v hlavičce s panelem: **režim** Light / Dark / System, **styl** Modern / Paper classic, **barva** Collection colors (dnešní) nebo pevná (mosazná, růžová, modrá, zelená, fialová), drobnosti (výchozí pořadí, hustota seznamu, méně animací); rozdělení **Profil** (achievementy, statistiky, přátelé) × **Nastavení** (účet, heslo, veřejný profil, instalace, smazání účtu, **Sign out** + vzhled) |
| 43 | V4.1 | Mobil a drobná vylepšení | sbalitelné achievementy a statistiky (zapamatuje si stav), **spodní lišta** na telefonu (Collections · Search · Coming soon · Watchlist · Profil), větší plochy pro klepnutí, kontrola všech obrazovek na 320–390 px |
| 44 | V4.2 | Jazyky | **angličtina, čeština, němčina, španělština, ukrajinština** (ruština ne); texty webu, názvy filmů z TMDB v daném jazyce (ukládá import), popisy kolekcí; češtinu kontroluje Adam, ostatní ideálně rodilý mluvčí |
| 45 | V4.3 | Wrapped | rok v kostce – **poprvé za rok 2027** (prosinec 2027): nováček si na začátku doplní stovky filmů, první celý rok dat bude 2027; filmy „Seen before“ se nepočítají |

**Kapitola V5.x – seriály** (jen seriály): TMDB má seriály, řady i epizody se stejným klíčem; sledování po epizodách,
řady jako skupiny, běžící seriály „čeká na novou řadu“.

**Později / nápady:** export / import; nastavení uložené k účtu (stejný vzhled na všech zařízeních).

#### Rozhodnutí k plánu (7. a 8. 11. 2026)
- **Wrapped z V3.6 do kapitoly 4** – teď by nic důležitého neřešil; V3.6 místo něj úklid kódu.
- **Nová kapitola V4 = přizpůsobení** (nastavení, mobil, jazyky, Wrapped), **kapitola V5 = jen seriály**.
- **V3.5 = obsah od uživatelů** ve třech krocích, které na sebe navazují: bez požadavků nepřibudou filmy, bez
  seznamů není co ukazovat v komunitě.
- **Katalog kurátorský** (film jen přes schválený požadavek) a **seznamy jen z filmů v databázi** – kvalita
  zůstává pod kontrolou, admin schvaluje jedním klikem.
- **Levelování bylo moc snadné** (100 filmů ≈ úroveň 7: mírná křivka, malé kolekce za plných 100 XP, doplňování
  starých filmů nafukuje Marathon a Screen Time) – přepracování ve V3.6.1. XP se počítají ze zhlédnutí, takže
  nová pravidla platí zpětně pro všechny (úrovně po změně klesnou).
- **Optimalizace až jako poslední verze kapitoly 3 (V3.6.2)** – uklidí i kód z přepracování postupu a před V4.0
  bude kód v nejlepším stavu (prohozeno 8. 11.).
- **Plán a dokumentace se dál nevydávají zvlášť** – změny plánu jdou s nejbližší verzí.

#### Pravidla řazení kolekcí (od V3.0)
- **Release** (rok vydání) má **každá** kolekce a je **výchozí všude** – série, studia, žánry. Pokud má kolekce
  oddíly v čase (MCU Phase 1–6, Disney Golden Age / Renaissance…), ukazují se v tomto pohledu jako nadpisy.
- **Story** (pořadí v příběhu) jen tam, kde ho filmy mají vyplněné (Star Wars, MCU, X-Men…).
- **Groups** (po sériích) jen tam, kde mají filmy skupinu – např. MCU: Iron Man → Hulk → Captain America → Thor…;
  Pixar: Toy Story → Cars → The Incredibles…; uvnitř skupiny podle roku. Skupiny jdou v pořadí prvního filmu,
  filmy bez skupiny na konec (*Standalone / Originals*).
- Přepínač ukazuje jen pohledy, které daná kolekce má (Avatar = jen Release). Zvolený pohled si web pamatuje;
  když ho další kolekce nemá, ukáže Release.
- **Cesty (paths)** mají dál jen svoje pevné pořadí kroků – to je jejich smysl.

#### Rozhodnutí pro V3.x
- **Film může být ve více kolekcích** a zhlédnutí se počítá všude → studio se skupinami nevylučuje samostatnou
  sérii. Samostatná kolekce má smysl tam, kde série přesahuje jedno studio nebo je opravdu velká (MCU, Star Wars).
- **Shrek jako samostatná kolekce se ruší** – nahradí ho skupina *Shrek* v DreamWorks. Zhlédnutí zůstanou
  (patří k filmu, ne ke kolekci); počet dokončených kolekcí se může o jednu snížit.
- **Disney** zůstává v pohledu Release po érách a navíc dostane Groups podle sérií (Frozen, Zootopia, Moana, Wreck-It Ralph…).
- ~~Studio Marvel se nedělá~~ → **změna 6. 11.:** studio **Marvel** ano, ale jako *všechny filmy podle Marvelu*
  (MCU, X-Men, Spider-Man od Sony, filmy před MCU) – tím není kopií MCU a dostane domov i Marvel mimo MCU.
  Stejně tak DC, Lucasfilm a další (V3.1.3).
- **Kolekce Spider-Man zůstává** (návrh 6. 11. přesunout Spider-Verse pod MCU zamítnut) – Raimiho, Amazing,
  Spider-Verse ani Venom nejsou MCU (jsou od Sony), MCU je neobsahuje. Shrek se ruší jen proto, že DreamWorks
  obsahuje všechny jeho filmy. Spider-Man má místo toho pohled By series (Raimi / Amazing / MCU / Spider-Verse / Sony).
- **Jen filmy, ne seriály** – She-Hulk, Loki, WandaVision… jsou seriály Disney+, do MMD nepatří. Hulk má v MCU
  opravdu jen jeden vlastní film (The Incredible Hulk); jinak se objevuje v Avengers a dalších.
- **V3.1 rozdělena na dvě vlny** (stejně jako V3.0): nejdřív kontrola a doplnění existujících kolekcí, pak nové.
- **Kolekce od uživatelů zatím ne** – hrozí nesmyslné kolekce (Spider-Man + Shrek + Indiana Jones); případně později
  jako oddělené *neoficiální* kolekce.
- **Hodnocení jen od uživatelů MMD**, žádné přebírání z ČSFD / IMDb.
- Podnět žáka (6. 11.): samotné názvy z TMDB nestačí (u Star Wars je první film jen „Star Wars“) → **popisek**
  u filmu v kolekci (Episode IV, Part 2…).
- Cesty z V1.8 jsou ze 4 ze 6 seřazené jen podle roku vydání (MCU Essentials, Superhero Hall of Fame, Animation
  Essentials, Horror 101) – kód pořadí drží, chyba je v obsahu → přepsat ve V3.0.2.

**Test 5. 11. 2026:** po zapnutí *Confirm email* s výchozí službou Supabase přišel potvrzovací mail i na soukromou adresu
kamaráda (mimo tým projektu) – v rozporu s dokumentací. Nedá se na to spoléhat a limit 2 maily / hod platí dál, proto
vlastní SMTP ve V2.4.

**E-maily (zjištěno 5. 11. 2026, podklad pro V2.4):** výchozí e-mailová služba Supabase od září 2024 posílá **jen na adresy
členů organizace projektu** (ostatní dostanou `email_address_not_authorized`) a nejvýš **2 maily za hodinu** – platí pro
všechny plány, placený Supabase to neřeší. Kontrola člena týmu ignoruje část za `+` (`adiskop987+test@gmail.com` = tým).
Pro skutečné uživatele je nutné **vlastní SMTP**. Bez domény: **samostatný Gmail účet** pro aplikaci + dvoufázové ověření +
**heslo aplikace** (`smtp.gmail.com`, port 465, odesílatel = ten Gmail, limit 500 mailů / den). S doménou později Resend
(3 000 / měsíc). Heslo aplikace patří jen do Supabase a správce hesel. Pozor: hodně nedoručitelných mailů (vymyšlené
adresy) může Gmail účet dočasně zablokovat → CAPTCHA (V2.6) a limit 20–30 mailů za hodinu.

### Fáze 10 – kategorie a horory, vlna 1 (V1.2)
**Kategorie** – sekce / filtr na přehledu; kolekce může být ve více kategoriích (Alien = Sci-fi i Horror), přiřazení v admin panelu:
Superhero · Sci-fi & Fantasy · Animation · Action & Adventure · Horror (+ další podle potřeby).

**Dva typy kolekcí:**
- **série** (MCU, Saw…) – uzavřený seznam filmů,
- **žánrové výběry** (Slasher, Haunted House…) – kurátorský výběr zhruba 15–20 klíčových filmů žánru, aby šel dokončit; film může být v sérii i ve výběru (Scream je v „Scream“ i ve „Slasher“).

**Hororové série:** The Conjuring Universe, Saw, Scream, Halloween, Final Destination, Insidious, A Nightmare on Elm Street, Friday the 13th.

**Hororové žánry – podle návrhu kamaráda, ve třech vlnách po sedmi:**

| Vlna | Verze | Žánry |
|---|---|---|
| 1 | V1.2 | Slasher · Supernatural & Paranormal · Haunted House · Demonic & Exorcism · Psychological · Found Footage · Zombie |
| 2 | V1.5 | Body Horror · Creature Feature · Vampire · Werewolf · Sci-fi Horror · Folk Horror · Horror Comedy |
| 3 | V1.7 | Gore & Splatter · Extreme & Torture · Cosmic Horror · Gothic Horror · Giallo · Eco-horror · Elevated Horror + bonus **J-Horror** |

- **J-Horror** (japonský horor, nápad kamaráda) přibyl jako bonus ve vlně 3 – hororů je tak 8 sérií a 22 žánrových výběrů.
- Výběry filmů sestavuje a spravuje jen správce (Adam); návrhy od ostatních vítány, admin práva ne.

### Fáze 11 – achievementy (V1.3)
Odznaky se počítají ze zhlédnutí, která už jsou v databázi – odemknou se i zpětně.

| Achievement | Úrovně |
|---|---|
| První krok | první zhlédnutý film |
| Sběratel | 10 / 50 / 100 / 200 filmů |
| Čas u filmů | 24 / 100 / 200 hodin |
| Maraton | 3 / 5 / 8 filmů za jeden den |
| Rewatcher | jeden film viděný 3× |
| Completionist | dokončená kolekce – zvlášť pro každou (název podle kolekce, např. „Avenger“ za MCU) |
| Pathfinder (V1.8) | 1 / 3 / 5 dokončených cest |
| Fanoušek kategorie | dokončené kolekce v kategorii (např. „Horror fan“) |

- Úrovně jdou **škálovat** – další stupně se jen připíšou do seznamu.
- Na profilu: odemčené barevně, zamčené šedě s postupem. Při odemčení oznámení.
- „Patha“ od kamaráda → vyřešeno: **obojí** – úrovně a XP (V1.4) i cesty (V1.8).

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

### Fáze 8 – PWA ✅ (5. 11. 2026) – **V1.0**
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

### Fáze 9 – nová univerza ✅ (5. 11. 2026) – **V1.1**
- Univerza **Mad Max**, **Avatar**, **Disney Animation**, **Pixar**, **DreamWorks Animation** v seedu, import po jednom (`&only=<slug>`).
- Disney ve skupinách podle období (Golden Age, Wartime Era, Silver Age, Bronze Age, Disney Renaissance, Post-Renaissance, Revival) + skupina **Live-action remakes** (volitelné); Pixar a DreamWorks ve skupinách podle desetiletí.
- Verze a měsíc aktualizace v patičce (`APP_VERSION`, `APP_UPDATED` v `config.js`), `CHANGELOG.md`.

#### Rozhodnutí ve fázi 9
- **Disney = Walt Disney Animation Studios** (oficiální řada animovaných filmů), ne vše od Disneyho – Pixar má vlastní univerzum.
- **Hrané remaky a hrané / hybridní filmy DreamWorks jsou volitelné** – patří k tématu, ale nepočítají se do postupu.
- **Koprodukce DreamWorks s Aardmanem** (Chicken Run, Wallace & Gromit, Flushed Away) jsou v řadě, protože je DreamWorks Animation oficiálně vede ve své filmografii.
- **Nevydané filmy** (Hexed – listopad 2026, Avatar 4 a 5) import přeskočí; po premiéře stačí import daného univerza pustit znovu.
- **Žádné krátkometrážní filmy.**

### V1.1.1 – přejmenování na Collections ✅ (5. 11. 2026)
- „Universes“ → **„Collections“** ve všech textech (přehled, detail, watchlist, admin panel, popis webu a aplikace).
- Adresy `#/collection/<slug>` a `#/admin/collection/<slug>`; staré `#/universe/…` se přesměrují (bez záznamu v historii, Zpět necyklí).

#### Rozhodnutí ve V1.1.1
- **„Collection“ sedí na všechno** – série (MCU), studia (Pixar) i žánrové výběry (Slasher); „universe“ sedělo jen na série.
- **Interní název zůstává „universe“** – tabulky `universes`, `universe_items`, pohled `universe_progress`, názvy souborů a funkcí v kódu. Přejmenování databáze by znamenalo migraci a úpravy všech funkcí bez viditelného přínosu. V dokumentaci a kódu tedy „universe“ = kolekce.

### Fáze 10 – kategorie a horory, vlna 1 ✅ (5. 11. 2026) – **V1.2**
- **Kategorie** (tabulky `categories`, `universe_categories`): Superhero, Sci-fi & Fantasy, Animation, Action & Adventure, Horror. Na přehledu **filtr** (pilulky, posouvatelné do strany na telefonu, volba se pamatuje) s počtem kolekcí.
- **Typ kolekce** (`universes.kind`): série / studio / žánrový výběr. Přehled se seskupí do sekcí **Series / Studios / Genre picks** (nadpisy jen když je typů víc).
- V detailu kolekce pilulky s kategoriemi a štítek „Genre pick“.
- Admin panel: v editoru kolekce **typ** a **kategorie** (zaškrtávací pole); v seznamu štítek Studio / Genre pick.
- **8 hororových sérií** (Conjuring – s pořadím příběhu, Saw – Saw X mezi Saw a Saw II, Scream, Halloween – skupiny podle časových linií, Final Destination – pětka jako prequel, Insidious, A Nightmare on Elm Street, Friday the 13th; remaky a crossover Freddy vs. Jason volitelné).
- **7 žánrových výběrů, vlna 1** (13–17 filmů): Slasher, Supernatural & Paranormal, Haunted House, Demonic & Exorcism, Psychological Horror, Found Footage, Zombie.
- Migrace `20261105070000_categories.sql` (vytvoří kategorie a přiřadí stávající kolekce), nová verze funkce `tmdb` (typ a kategorie ze seedu).

#### Rozhodnutí ve fázi 10
- **Kategorie jako vazba M:N** – kolekce může být ve více kategoriích (Alien = Sci-fi i Horror, Jurassic Park = Sci-fi i Action).
- **Stávající kolekce přiřazuje migrace**, ne import – plný import by přepsal úpravy z admin panelu. Import (s `&only=`) nastaví typ a kategorie jen u importované kolekce.
- **Žánrové výběry jsou kurátorské** (zhruba 15 klíčových filmů) – žánr má stovky filmů a kolekce musí jít dokončit. Film může být v sérii i ve výběru (Scream, The Conjuring…).
- **Žánrové výběry řazené podle roku vydání**, bez skupin a bez pořadí příběhu.
- **Bez Saw XI** (stažen z plánu Lionsgate) a **Insidious 6** (zatím bez názvu a data) – přidají se po premiéře.

### V1.2.1 – úklid ✅ (5. 11. 2026)
- Skript **`scripts/import.sh`** místo dlouhého `curl`: `./scripts/import.sh saw scream`, klíč se zadá skrytě, krátké shrnutí ke každé kolekci; `--all` jen s potvrzením (přepíše úpravy z admin panelu).
- Reporty importu ve složce **`import-reports/`** (Git ji ignoruje) – hlavní složka zůstává čistá.
- Pravidlo **pořadí kroků při vydání** (migrace → funkce → import → push).
- Opraveno „1 collections“ → „1 collection“.

### Fáze 11 – achievementy ✅ (5. 11. 2026) – **V1.3**
- Na profilu sekce **Achievements**: First Steps, Collector (10 / 50 / 100 / 200 filmů), Screen Time (24 / 100 / 200 h), Marathon (3 / 5 / 8 za den), Rewatcher (3×), Completionist (1 / 5 / 10 / 20 kolekcí) a **Fan** za každou kategorii (1 / 3 / 5 dokončených kolekcí).
- Úrovně Bronze → Silver → Gold → Platinum (→ Diamond → Legend pro budoucí rozšíření), u každé datum odemčení; zamčené šedě s postupem k další úrovni.
- Sekce **Completed collections** – odznaky dokončených kolekcí v jejich barvě, s datem dokončení.
- **Oznámení** „🏆 Achievement unlocked: …“ a „🏆 Collection complete: …“ po zhlédnutí, odkudkoli (detail, Up next, Continue watching, watchlist).
- Bez migrace – vše se počítá ze zhlédnutí, která už v databázi jsou.

#### Rozhodnutí ve fázi 11
- **Achievementy se počítají, neukládají** – odemknou se i zpětně, nemůžou se rozejít s daty a nepotřebují tabulku ani trigger. Datum odemčení se dopočítá z data zhlédnutí.
- **Hodiny = délka filmu × počet zhlédnutí** (i opakovaná zhlédnutí); „filmy“ u Collectora = různé filmy.
- **Úrovně se škálují v jednom místě** (`ACHIEVEMENTS` v `achievements.js`) – další stupeň = další číslo v seznamu.
- **Fanoušek kategorie** má úrovně jen do počtu kolekcí v kategorii; menší kategorie má jako nejvyšší úroveň „dokonči všechny“.
- **Oznámení se hlídají v prohlížeči** (localStorage, klíč podle uživatele). Při prvním přihlášení v prohlížeči se jen uloží výchozí stav, aby nepřišla lavina oznámení za všechno dřívější; každé další odemčení se oznámí. Kontrola běží s malým zpožděním po změně zhlédnutí (víc kliknutí = jedna kontrola).
- **Zhlédnutí se načítají po částech po 1000** (limit Supabase), aby výpočet fungoval i pro velké deníky.
- **„Patha“ od kamaráda** – rozhodnuto později: obojí, úrovně / XP (V1.4) a cesty (V1.8).

### Fáze 12 – úrovně a XP ✅ (5. 11. 2026) – **V1.4**
- **XP:** +10 za nový film, +3 za opakované zhlédnutí, +100 za dokončenou kolekci, za úroveň achievementu +25 (Bronze) / +50 (Silver) / +100 (Gold) / +200 (Platinum a výš).
- **Úroveň:** potřeba XP roste (2 → 100, 3 → 300, 4 → 600, 5 → 1000, 10 → 4500, 25 → 30 000); bez stropu.
- **Filmové tituly:** Extra (1) → Stand-in (3) → Stunt Double (5) → Supporting Actor (7) → Lead Actor (10) → Director (13) → Producer (16) → Studio Head (20) → Legend (25+).
- Na profilu **karta úrovně** (číslo, titul, XP do další úrovně, rozpad podle zdroje); v hlavičce **odznak úrovně** u nicku; oznámení **„⬆️ Level up!“**.
- Na obrazovce nejvýš 4 oznámení najednou.
- Do kolekce Insidious doplněn **Insidious: Out of the Further** (2026) – tip od kamaráda.

#### Rozhodnutí ve fázi 12
- **XP se počítají, neukládají** – stejně jako achievementy (zpětně, bez tabulky); pravidla a tituly na jednom místě (`XP_RULES`, `LEVEL_TITLES` v `achievements.js`).
- **Úroveň roste kvadraticky** – první úrovně rychle, vyšší pomaleji; běžný deník (stovky filmů, desítky kolekcí) se pohybuje kolem úrovně 10 (Lead Actor), Legend je pro opravdové nadšence.
- **Opakované zhlédnutí dává méně XP** než nový film – motivace objevovat nové filmy.
- **Výpočet úrovně a achievementů jedním dotazem** po přihlášení a po každé změně zhlédnutí; hlavička jen zobrazí uložený výsledek.

### V1.4.1 – rychlost načítání ✅ (5. 11. 2026)
- **Knihovna Supabase v projektu** (`web/vendor/supabase-js-2.119.0.min.js`, jeden minifikovaný soubor ~225 kB, po kompresi ~60 kB) místo řetězu desítek souborů z CDN.
- **Písma v projektu** (`web/fonts/`) místo Google Fonts – bez blokování prvního vykreslení a bez spojení na dva další servery; latinka se přednačítá.
- **`modulepreload`** všech modulů v `index.html` – prohlížeč je stáhne najednou, ne postupně podle importů.
- **Nový service worker** (`mmd-v2`): soubory webu okamžitě z mezipaměti a ověření na pozadí; při nové verzi na serveru oznámení **„A new version is available · Reload“**; stránky síť první s limitem 3 s; soubory s verzí v názvu (vendor, písma) jen z mezipaměti.
- **Přehled:** kolekce a kategorie se načítají souběžně, mřížka se vykreslí hned a „Continue watching“ se doplní do hero karty, až bude hotové; plakáty první řady přednostně.
- **Achievementy a level** se po startu počítají až po prvním vykreslení (nezdržují dotazy na data).
- Měření (Chromium, 100 ms latence): opakované otevření ~180 ms, 27 z 28 souborů z mezipaměti.

#### Rozhodnutí ve V1.4.1
- **Knihovna jako soubor v repozitáři, ne z CDN** – jeden požadavek, žádná závislost na cizím serveru, funguje offline; aktualizace ručně (postup v `setup.md`). Verze v názvu souboru = service worker ho nemusí ověřovat.
- **„Stale-while-revalidate“ + tlačítko Reload** místo „síť první“ pro soubory webu – rychlost při každém otevření; nová verze se nabídne hned po nasazení (porovnání ETag / Last-Modified z GitHub Pages).
- **Písma s `unicode-range`** – latin-ext (čeština v nickách) se stáhne, jen když je potřeba.

### Fáze 13 – horory, vlna 2 ✅ (5. 11. 2026) – **V1.5**
- 7 žánrových výběrů (14–15 filmů): **Body Horror**, **Creature Feature**, **Vampire**, **Werewolf**, **Sci-fi Horror** (i v kategorii Sci-fi & Fantasy), **Folk Horror**, **Horror Comedy**.
- Včetně novinek 2024–2025: The Substance, Together, Nosferatu (2024), Sinners, Wolf Man, Alien: Romulus, Companion, Beetlejuice Beetlejuice.
- Jen obsah (seed) – web, databáze ani funkce se nemění.

#### Rozhodnutí ve fázi 13
- **Překryvy jsou v pořádku** – Alien je ve své sérii i v Sci-fi Horror, Shaun of the Dead v Zombie i Horror Comedy, Jaws v Creature Feature (a později možná i Eco-horror); zhlédnutí se počítá všude.
- **Remaky se stejným názvem odliší rok** (Nosferatu 1922 / 2024, Dracula 1931 / 1958).
- **Krátké a obecné názvy připnout TMDB id rovnou v seedu** – import u Society našel *Dead Poets Society*
  a u Raw dokument *Raw Footage*. Opraveno ve **V1.5.1** (`"tmdb": 22244` a `393519`). Ostatní varování
  (The Cabin in the Woods 2012, Splice 2010, Blood on Satan's Claw bez „The“) byla správná.

### Fáze 14 – vyhledávání ✅ (5. 11. 2026) – **V1.6**
- Nová stránka **`#/search?q=…`** – vstup přes lupu v hlavičce, lištu „Search movies and collections…“ na přehledu
  a klávesu **/** odkudkoli (mimo textová pole).
- Hledá **filmy** (název i původní název) a **kolekce** (název, zkratka v adrese, slabší shoda podle popisu).
- U filmu: rok, délka, **všechny kolekce, ve kterých je** (odkazy), počet zhlédnutí, ☆ watchlist a +1 / −1.
- Filtr **All / Unwatched / Watched** (pamatuje se), nejvýš 60 filmů a 6 kolekcí – víc chce upřesnit dotaz.
- Klikací příklady v prázdném hledání, Esc smaže pole, Enter na telefonu schová klávesnici.
- Nové soubory: `web/js/search.js` (logika), `web/js/views/search.js` (obrazovka); router umí `?parametry`.

#### Rozhodnutí ve fázi 14
- **Hledá se v prohlížeči, ne v databázi** – ~650 filmů je pár desítek kB; jedno načtení (drží se 5 minut
  v paměti) a pak výsledky při každém úhozu bez čekání na síť. Databáze ani funkce se nemění. Při tisících
  filmů by se přešlo na fulltext v Postgresu.
- **Načítání po stránkách po 1000 řádcích** (`fetchAllRows`) – Supabase vrací nejvýš 1000 řádků na dotaz
  a s vlnou 3 hororů by se k limitu blížilo.
- **Normalizace textu** – malá písmena, bez diakritiky (NFKD, takže i „Alien³“ → „alien3“), bez interpunkce
  a apostrofů; navíc „slepená“ podoba bez mezer, takže „spiderman“ najde „Spider-Man“.
- **Pořadí výsledků** – přesná shoda → slepená shoda → název tak začíná → všechna slova sedí na začátky slov
  → shoda uvnitř slova; při shodě starší film dřív (série jdou přirozeně za sebou).
- **Rok v dotazu se porovná s rokem filmu** – „alien 1979“ najde jen původní Vetřelec, „2024“ všechny filmy roku.
- **Psaní nepřidává záznamy do historie** (`history.replaceState`) – tlačítko Zpět vede zpět na předchozí stránku,
  ale adresa s `?q=` se dá poslat nebo uložit.
- **Hledá se jen v kolekcích aplikace**, ne v celé TMDB – přidávání filmů zůstává na adminovi.

### Fáze 15 – horory, vlna 3 ✅ (5. 11. 2026) – **V1.7**
- 8 žánrových výběrů (14–15 filmů): **Gore & Splatter**, **Extreme & Torture**, **Cosmic Horror**, **Gothic Horror**,
  **Giallo**, **Eco-horror**, **Elevated Horror** a bonus **J-Horror**. Hororová kategorie je tím kompletní.
- Novinky: Terrifier 3, Frankenstein (2025, del Toro), Longlegs, Weapons.
- Jen obsah (seed) – web, databáze ani funkce se nemění.

#### Rozhodnutí ve fázi 15
- **TMDB id připnuté předem** u krátkých názvů (X, Us, Pearl, House, Opera) podle pravidla z V1.5.1 – i v kolekcích
  Slasher a Psychological Horror, kde už X, Us a Pearl byly, aby šlo o tentýž film.
- **V1.7.1:** import i tak minul **Audition** (našel *Auditions from Beyond*) a **Hostel** (našel *Dr. Rage*) – TMDB je
  vede s rokem premiéry 2000 a 2006, hledání s rokem 1999 / 2005 je nenašlo. Připnuto (`11075`, `1690`).
  Ostatní varování (jiný rok premiéry, Tenebrae = Tenebre) byla správná.
- **Extreme & Torture bez nejkontroverznějších titulů** (např. A Serbian Film) – výběr drží známé a kriticky
  probírané filmy žánru; popis kolekce upozorňuje, že není pro slabé povahy.
- **Giallo má žlutou barvu** – „giallo“ je italsky žlutá (podle žlutých obálek detektivek).

### Fáze 16 – cesty / paths ✅ (5. 11. 2026) – **V1.8**
Nápad kamaráda („dal bych nějakou pathu a achievementy“ → „a co obojí?“).
- **Cesta = nový typ kolekce** (`kind = 'path'`): kurátorská trasa krok za krokem, pořadí = `release_order`,
  u každého kroku krátká poznámka, proč film vidět (`universe_items.note`).
- **6 cest** (jen z filmů, které už v aplikaci jsou):
  - *MCU Essentials* (12) – v rámci jedné kolekce,
  - *Star Wars: First Watch* (10) – pořadí pro první zhlédnutí (Rogue One před sequely),
  - *Superhero Hall of Fame* (14) – napříč Marvel, DC, X-Men, Spider-Man,
  - *Fantasy Starter* (11) – Harry Potter → Ghibli → Pán prstenů → Avatar,
  - *Animation Essentials* (15) – od Sněhurky (1937) po The Boy and the Heron,
  - *Horror 101* (16) – od Nosferatu po Hereditary.
- **Přehled:** sekce **Paths** jako první, karta se štítkem „🧭 Path“ a počtem kroků.
- **Detail cesty:** očíslované kroky spojené čarou (viděný krok = ✓), poznámky, karta **Next step** se „Step 4 of 12“
  a poznámkou; bez přepínače pořadí; na konci „Path complete“.
- **Achievement Pathfinder** 🧭 – 1 / 3 / 5 dokončených cest. Dokončená cesta je zároveň dokončená kolekce
  (+100 XP, odznak, započítá se i do Completionist a fanouška kategorie).
- **Admin panel:** typ *Path* a u kroků cesty pole **Step note**.
- Migrace `20261105080000_paths.sql`, nová verze funkce `tmdb` (předává `note` ze seedu).
- Oprava seedu: *Talk to Me* sjednoceno na rok 2023 s připnutým id `1008042` (Supernatural i Elevated),
  *Saint Maud* na 2020.

#### Rozhodnutí ve fázi 16
- **Cesta je kolekce, ne nová tabulka** – postup (`universe_progress`), dokončení, XP, hledání, watchlist i admin
  fungují bez dalšího kódu; nový je jen typ a sloupec `note`.
- **Cesty první na přehledu** – jsou to vstupní body pro nováčky („nevím, kde začít“).
- **Poznámky bez spoilerů**, jedna věta, anglicky jako zbytek obsahu.
- **Pořadí cesty je pevné** – žádné „story order“; o pořadí rozhoduje kurátor (Star Wars: First Watch záměrně
  není chronologicky).
- **Úrovně Pathfinderu se přizpůsobí počtu cest** (stejná funkce `scaledTiers` jako u fanoušků kategorií).

### Fáze 17 – statistiky profilu ✅ (5. 11. 2026) – **V1.9**
- Nová stránka **`#/stats`**; na profilu i ve statistikách přepínač **Achievements | Stats** (hlavička beze změny,
  odkaz @nick je aktivní na obou).
- **Dlaždice:** viděné filmy, zhlédnutí (+ opakování), čas (hodiny, od 24 h i „dní v kuse“), dokončené kolekce
  (+ rozkoukané), nejdelší série dní za sebou (+ aktuální 🔥), watchlist.
- **Activity:** sloupcový graf zhlédnutí po měsících za posledních 12 měsíců + přehled po rocích (zhlédnutí, nové filmy).
- **Most watched:** 5 nejčastěji viděných filmů s plakátem a počtem.
- **By release decade** a **By category** (viděné filmy z kolekcí kategorie / všechny, v barvě kategorie).
- **Almost there:** rozkoukané kolekce s nejmenším počtem zbývajících filmů (odkaz rovnou do kolekce).
- **Fun facts:** první zaznamenaný film, nejdelší / nejkratší, nejstarší / nejnovější, nejrušnější den, oblíbený den v týdnu.
- Nové soubory: `web/js/stats.js` (výpočet), `web/js/views/stats.js` (obrazovka).

#### Rozhodnutí ve fázi 17
- **Počítá se v prohlížeči ze stejných dat jako achievementy** (`fetchAchievementData`, jen dotaz na zhlédnutí
  vrací navíc název, plakát a datum vydání filmu) – žádná migrace, žádná funkce, jeden průchod daty.
- **Samostatná stránka, ne další sekce profilu** – profil by byl moc dlouhý; ve V2.0 se obojí spojí do veřejného profilu
  (logika ve `stats.js` je na tohle připravená – dostane data a vrátí čísla).
- **Grafy čistě v CSS** (bez knihovny) podle pravidel pro vizualizace: jedna barva pro velikost (akcent),
  kategorie v jejich barvách vždy s popiskem, hodnoty v barvě textu, hodnota při najetí myší, nejvyšší měsíc
  popsaný vždy, popis grafu pro čtečky obrazovky.
- **Volitelné filmy se do postupu kolekcí nepočítají** (stejně jako v detailu kolekce).
- **„Nejrušnější den“ se ukáže až od 2 filmů za den** – s jedním filmem nic neříká.

### Fáze 18 – sdílení profilu ✅ (5. 11. 2026) – **V2.0**
Z osobního deníku sociální aplikace.
- **Veřejný profil `#/u/<nick>`** – funguje i pro nepřihlášené: iniciála, nick, úroveň a titul, „Member since“,
  počet filmů a dokončených kolekcí, tlačítko **Share**; pod tím přepínač **Achievements | Stats** se stejnými
  kartami a grafy jako vlastní profil (bez watchlistu).
- **Karta Public profile** na vlastním profilu: přepínač Public, odkaz, **Share** (na telefonu systémová nabídka,
  jinak kopie do schránky) a **View**. Uživatel s automatickým nickem z Googlu musí nejdřív zvolit vlastní.
- **Hledání lidí** – v hledání sekce **People** (jen veřejné profily, od 2 znaků), vede na `#/u/<nick>`.
- Migrace `20261105090000_public_profiles.sql`: sloupec `profiles.is_public` (výchozí soukromý), funkce
  `public_profile` a `search_public_profiles`.
- Zásady ochrany soukromí doplněné o sekci **Public profile (optional)**.
- Nové soubory: `web/js/social.js`, `web/js/views/public-profile.js`; achievementy a statistiky jdou vykreslit
  i pro cizí data (`achievementsContent`, `statsContent`), katalog kolekcí se načítá zvlášť (`fetchCatalogData`).
- Načítání po stránkách má nově stabilní řazení (podle `id`) – při víc než 1000 řádcích se stránky nepřekrývají.

#### Rozhodnutí ve fázi 18
- **Soukromý profil je výchozí** (opt-in) – deník je osobní; zveřejnění je vědomé rozhodnutí s vysvětlením, co bude vidět.
- **Funkce místo otevření tabulek** – RLS u `profiles` a `watches` se neměnila; přesně definovaný výstup funkce
  je bezpečnější než pravidlo „smí číst řádky veřejných uživatelů“ (to by pustilo ven všechny sloupce včetně
  hodnocení a poznámek, až se začnou používat).
- **Soukromý a neexistující profil vypadají stejně** – nedá se zjistit, jestli účet s daným nickem existuje.
- **Jeden JSON s celou historií** místo řádků – žádný limit 1000 řádků API; výpočet achievementů, XP a statistik
  pak běží v prohlížeči stejným kódem jako na vlastním profilu.
- **Odkaz je podle nicku** – je čitelný; po změně nicku starý odkaz přestane fungovat (je to vidět v nastavení).
- **Hledání lidí přes `strpos`, ne `LIKE`** – podtržítko v nicku není zástupný znak; minimum 2 znaky a 10 výsledků
  brání vypsání všech uživatelů.
- Ověřeno na lokálním Postgresu: anonym ani jiný uživatel nevidí tabulky, soukromý profil vrací `null`,
  zapnutí admina selže, cizí profil zveřejnit nejde, hodnocení a poznámky se do JSONu nedostanou.

**Plán fází 0–18 je tím dokončený.** Pokračuje kapitola V2.x – optimalizace a bezpečnost.

### Fáze 19 – optimalizace ✅ (5. 11. 2026) – **V2.1**
Měřeno na telefonu (390 px, 2× hustota) s daty ze seedu, před → po:

| Krok | Dotazy do databáze | Obrázky |
|---|---|---|
| Otevření detailu MCU | 2 → **1** | plakáty v seznamu 748 kB → **126 kB** |
| Zpět na přehled | 3 → **1** | – |
| Detail podruhé | 2 → **0** | – |
| Banner na telefonu | – | 210 kB → **95 kB** |

- **Plakáty ve velikosti podle místa:** `w92` žebříček ve statistikách, `w154` řádky filmů a Up next, `w342` karty a hero
  (`POSTER_SIZES` v `config.js`). **Banner** `w780` na telefonu, `w1280` na velké obrazovce (podle šířky × hustoty displeje).
- **Mezipaměť katalogu** (`web/js/cache.js`, 5 minut): seznam kolekcí, kategorie, detail kolekce, katalog pro
  achievementy a statistiky, filmy pro hledání. Ukládá se slib, takže souběžné dotazy sdílí jeden požadavek.
  Zhlédnutí, watchlist a postup se načítají vždy čerstvé.
- **Po každém +1** se kvůli achievementům a levelu stahují jen zhlédnutí, ne celý katalog (~900 řádků).
- **Detail kolekce jedním dotazem** – filmy vnořené v kolekci (`universe_items.order=release_order.asc`) místo dvou
  dotazů po sobě = o jedno čekání na síť méně.
- **Přednačtení** – najetí myší, fokus nebo dotyk na kartu kolekce začne stahovat její data a banner; po kliknutí je
  detail hotový.

#### Rozhodnutí ve fázi 19
- **Mezipaměť jen v paměti, ne v localStorage** – po zavření aplikace se načte čerstvý katalog; žádné riziko
  zastaralých dat mezi verzemi.
- **Admin mezipaměť maže** při každé operaci a při otevření úprav kolekce – změny z admin panelu jsou vidět hned.
- **Bez build kroku (minifikace)** – GitHub Pages soubory komprimuje (gzip/brotli); přínos by byl malý a projekt by
  ztratil jednoduchost „co je v repozitáři, to běží“. Případně ve V2.7.

#### V2.1.1 – stabilní rozložení a rychlejší start
Lighthouse po V2.1 (telefon, přihlášený): Performance 62 – CLS 0,267, TBT 330 ms, LCP 4,5 s. Vlastní měření stejného
scénáře (telefon, CPU 4×, pomalá síť, data ze seedu, průměr 3 běhů):

| Metrika | V2.1 | V2.1.1 |
|---|---|---|
| CLS (posun obsahu) | 0,283 | **0,000** |
| LCP (první plakát) | 3,66 s | **3,09 s** |
| Blokování hlavního vlákna | 79 ms | **48 ms** |

- **Patička** byla při načítání vidět hned pod spinnerem a obsah ji odsunul (největší část CLS) → `main` má
  `min-height: 100vh`.
- **Hlavička** měla před spuštěním JavaScriptu výšku 0 a pak 61 px → pevná `min-height`.
- **Hero karta** – zástupná i hotová mají stejnou minimální výšku podle šířky obrazovky (`--hero-min`).
- **Data přehledu se stahují hned při startu** (`warmOverview`), souběžně s přihlášením a načtením profilu; postup
  se drží 10 s v mezipaměti, aby ho přednačtení a první vykreslení sdílely, a zahodí se po zhlédnutí a změně přihlášení.
- **Obrazovky na vyžádání** – přehled a detail kolekce se načítají hned, ostatní (admin, hledání, statistiky, profil,
  přihlášení, watchlist, veřejný profil) dynamickým importem až při prvním otevření; `modulepreload` jen pro startovní
  moduly (17 místo 31). Offline dál fungují všechny (service worker je má uložené).
- **Achievementy a level** se po startu počítají až ve volné chvíli prohlížeče (`requestIdleCallback`).
- **Sekce kolekcí mimo obrazovku** se vykreslí, až k nim uživatel doroluje (`content-visibility: auto`).

Nedá se ovlivnit: „Use efficient cache lifetimes“ – GitHub Pages posílá všem souborům `max-age=600`; opakované
návštěvy to řeší service worker (Lighthouse ho nezapočítává). Na V2.7 zůstává: menší knihovna Supabase (jen
přihlášení a databáze, bez realtime a storage), případně minifikace.

### Fáze 20 – o aplikaci a pravidla ✅ (5. 11. 2026) – **V2.2**
- Stránka **About** (`#/about`): co je MMD, kdo ho dělá, pravidla komunity ve zkratce, kontakt, data, poděkování a verze.
- **Patička** na všech stránkách: About · Terms · Privacy · Contact · GitHub, verze a povinné uvedení TMDB.
- **Terms of Service** (`terms.html`): provozovatel, účet (věk **15+**, vlastní e-mail, jeden účet na osobu),
  **pravidla komunity** (žádné urážlivé nicky ani obcházení čísly a symboly, žádné vydávání se za jiné nebo za admina,
  žádné boty a falešné účty, žádné útoky), moderace (reset nicku, skrytí profilu, smazání účtu i bez upozornění),
  data, TMDB, „as is“, změny, české právo, kontakt.
- **Zásady ochrany soukromí** přepsané: kdo aplikaci provozuje, co přesně se ukládá (včetně údajů, které si při přihlášení
  Googlem uloží Supabase, a záznamů o přihlášení s IP adresou), jak jsou data propojená (náhodné ID, e-mail jen pro
  přihlášení, propojení účtů se stejným e-mailem), kdo co vidí (admin vidí seznam účtů s e-mailem), proč, jak dlouho,
  práva (přístup, oprava, výmaz, stížnost u ÚOOÚ), věk.
- **Souhlas při registraci** – povinné zaškrtnutí „I am at least 15 and I agree to the Terms of Service and the Privacy
  Policy“; pod tlačítkem Google věta, že pokračováním uživatel souhlasí (účet z Googlu vzniká bez formuláře).
- Provozovatel, kontakt a minimální věk na jednom místě v `config.js` (`OPERATOR_NAME`, `CONTACT_EMAIL`, `MIN_AGE`);
  kontakt je i ve statických stránkách a v patičce `index.html`.

#### Rozhodnutí ve fázi 20
- **Kontakt `mymoviediary.support@gmail.com`** – samostatný Gmail jen pro aplikaci (osobní e-mail se nezveřejňuje);
  stejný účet poslouží ve V2.4 jako odesílatel mailů (SMTP). Adresa typu `support@…` by vyžadovala vlastní doménu.
- **Podepsáno „Adam Kopecký (Kopejdos)“** – u podmínek je vhodné uvést, kdo službu provozuje.
- **Minimální věk 15 let** – hranice pro souhlas se zpracováním osobních údajů online v Česku.
- **Terms a Privacy jako statické stránky** (ne obrazovky aplikace) – fungují bez JavaScriptu a mají stálou adresu
  pro nastavení přihlášení přes Google (Branding → Terms of service).
- **Souhlas se neukládá do databáze** – registrace bez zaškrtnutí neprojde; případné ukládání data souhlasu později.

### Fáze 21 – nicky a moderace ✅ (6. 11. 2026) – **V2.3**
- **Filtr nicků v databázi** (migrace `20261106000000_nickname_moderation.sql`): tabulka `blocked_words`,
  normalizace nicku (malá písmena, čísla a znaky za písmena, bez `_` `-`, sloučená opakovaná písmena) a trigger
  při každém uložení nicku – nedá se obejít voláním API mimo web.
- **Výchozí seznam** – 57 slov: vulgarity a sexuální výrazy, nenávist a urážky, česká sprostá slova, vydávání se za
  správce / aplikaci (admin, moderator, support, mymoviediary…).
- **Registrace** – web nick předem ověří (`is_username_allowed`) a ukáže hlášku; kdyby se kontrola obešla, účet
  vznikne s automatickým nickem a uživatel si musí zvolit jiný. Totéž při obsazeném nicku (dřív by registrace spadla).
- **Profil** – změna na zakázaný nick skončí srozumitelnou hláškou.
- **Admin → Nicknames** (`#/admin/words`) – seznam slov, přidání (anywhere / whole nickname), odebrání.
- **Admin → Users** – štítek **⚠ Nickname breaks the rules** a tlačítko **Reset nickname** (automatický nick +
  skrytý veřejný profil; uživatel si při dalším otevření musí zvolit nový).
- **Delete my account** na profilu – potvrzení opsáním vlastního nicku; nová Edge Function `account` smaže účet
  přes admin API (profil, zhlédnutí a watchlist zmizí díky `on delete cascade`). Správce se takhle smazat nemůže.

#### Rozhodnutí ve fázi 21
- **Dva režimy slova** – `contains` pro jednoznačná slova, `exact` pro ta, která jsou součástí běžných slov
  (rape → grape, pica → Picasso, dick → Dickens, cum → document, anal → canal, mod → modern).
- **Slova jako „gay“ nebo „furry“ se neblokují** – sama o sobě nejsou urážlivá a blokovala by běžné uživatele;
  nevhodné kombinace řeší admin resetem nicku.
- **Správci se neoznačují** – účet „admin“ vznikl před zavedením pravidel (rezervované slovo).
- **Smazání účtu přes Edge Function, ne SQL** – oficiální admin API Supabase uklidí i relace a propojené identity.
- **Žádný filtr není dokonalý** – kombinace: seznam slov + pravidla v Terms + reset nicku + smazání účtu.

### Fáze 22 – e-mail ✅ (6. 11. 2026) – **V2.4**
- **Vlastní SMTP** – maily odchází z `mymoviediary.support@gmail.com` (Gmail + heslo aplikace), limit 30 / hod;
  **Confirm email** zapnuté. Nastavení v setup.md (6b).
- **Šablony v designu MMD** (`supabase/templates/`): potvrzení registrace, obnova hesla (připravená pro V2.5),
  změna e-mailu – tmavá hlavička s klapkou, mosazné tlačítko, oslovení nickem, záložní odkaz, patička s důvodem
  mailu a kontaktem. Tabulkové rozložení a styly přímo v HTML (jinak by je e-mailové programy ignorovaly).
- **Návrat z odkazu v mailu:** ve stejném prohlížeči rovnou přihlášení + „Email confirmed – welcome…“; v jiném
  prohlížeči (PKCE) hláška „Email confirmed! Now sign in.“ a formulář přihlášení; vypršený / použitý odkaz →
  srozumitelná hláška a přihlášení (chyba v `?…` i v `#…`, adresa se uklidí).
- **Nepotvrzený e-mail při přihlášení** – „Please confirm your email first“ místo obecné chyby, i u nicku; tlačítko
  **Resend confirmation email** (u nicku přes funkci `login`, jen se správným heslem, e-mail se neprozradí);
  po registraci obrazovka s adresou a tlačítkem pro znovuposlání. Limit Supabase 1 mail / 60 s → hláška „wait a minute“.

#### Rozhodnutí ve fázi 22
- **Gmail místo domény** – zdarma a hned; Supabase upozorňuje na horší doručitelnost (osobní schránka), pro pár
  uživatelů stačí. První mail u Adama skončil ve spamu (nový odesílatel + výchozí šablona), u kamaráda v doručené
  poště – vlastní šablona a historie odesílatele pomohou; při problémech doména + Resend.
- **Návrat z Googlu vs. z mailu** – oba přijdou s `?code=`; před odchodem na Google se uloží značka do
  sessionStorage, návrat bez ní = potvrzení e-mailu. Adresa se čte dřív, než ji knihovna Supabase zpracuje
  (`launchUrl` v `supabase.js`).
- **Resend u nicku jen po správném hesle** – jinak by šlo nickem zahlcovat cizí schránku; Supabase hlásí nepotvrzený
  e-mail až po ověření hesla, takže se nic neprozradí.

### Fáze 23 – hesla ✅ (6. 11. 2026) – **V2.5**
- **Forgot password?** na přihlášení → `#/forgot`: e-mail → odkaz pro nové heslo (šablona z V2.4). Odpověď je
  vždy stejná, ať účet existuje, nebo ne. U účtu z Googlu nápověda „použij Continue with Google“.
- **Návrat z odkazu** → `#/reset-password` s formulářem pro nové heslo; v jiném prohlížeči hláška „otevři odkaz ve
  stejném prohlížeči“ a formulář pro nový odkaz; vypršený odkaz → hláška a nový odkaz.
- **Change password** na profilu – nejdřív ověření současného hesla (nové přihlášení), pak změna; účet jen z Googlu
  si heslo může nastavit poprvé (*Set a password*) a pak se přihlašovat i e-mailem.
- **Pravidla hesla:** aspoň 8 znaků, písmeno i číslice – web (`passwordProblem`) i Supabase (Password requirements).
  Srozumitelné hlášky: krátké, slabé, stejné jako staré, špatné současné heslo, příliš častá žádost.

#### Rozhodnutí ve fázi 23
- **Obnova jen podle e-mailu, ne nicku** – odkaz musí vzniknout v prohlížeči uživatele (PKCE); serverová funkce
  by ho vytvořila jinde a odkaz by nefungoval. Nick se navíc nesmí prozradit spojením s e-mailem.
- **Rozpoznání obnovy hesla** – knihovna Supabase po výměně kódu vyšle `PASSWORD_RECOVERY` (typ uložený u PKCE
  verifieru jako `/recovery`); posluchač je zaregistrovaný hned při načtení modulu, protože událost přichází se
  zpožděním po startu. Značka `?reset=1` v adrese odkazu navíc pozná odkaz i v jiném prohlížeči.
- **Ověření současného hesla před změnou** – kdo si nechá otevřený počítač, nezmění heslo jen tak.
- **Kontrola uniklých hesel (HaveIBeenPwned)** je v Supabase jen v placeném plánu – nepoužívá se.

### Fáze 24 – CAPTCHA ✅ (6. 11. 2026) – **V2.6**
- **Cloudflare Turnstile** (`web/js/captcha.js`) ve všech formulářích, které posílají heslo nebo e-mail: registrace,
  přihlášení (e-mailem i nickem), Forgot password, Resend confirmation (přihlášení i obrazovka po registraci) a
  Change password v profilu (ověření současného hesla je přihlášení).
- Režim **interaction-only** – většinou neviditelný; políčko „Verify you are human“ jen při podezření.
- Token platí jednou → po každém odeslání `reset()` a widget si na pozadí vezme nový.
- Skript Cloudflare se načítá jen na stránkách s formulářem; v profilu až po kliknutí do karty změny hesla.
- **Funkce `login`** ověřuje token sama (`TURNSTILE_SECRET_KEY`) před dohledáním nicku.
- **Forgot password:** e-mail se předvyplní z pole na přihlášení; zadaný nick → upozornění „zadej e-mail toho účtu“.
  Formulář nového hesla ukazuje rámeček **Account: nick + e-mail**, ať je jasné, čí heslo se mění.
- Zásady ochrany soukromí: nová sekce *Bot protection* (Cloudflare zpracovává IP a údaje o prohlížeči).

#### Rozhodnutí ve fázi 24
- **Turnstile místo hCaptcha / reCAPTCHA** – zdarma, bez skládaček s obrázky, bez reklamních cookies; Supabase ho
  podporuje přímo (Attack Protection).
- **Token ověřuje i funkce `login`** – Supabase Auth u požadavků se serverovým klíčem (service_role) CAPTCHA
  přeskakuje, takže bez vlastní kontroly by přihlášení nickem ochranu obcházelo.
- **Bez klíče = vypnuto** – prázdný `TURNSTILE_SITE_KEY` / chybějící `TURNSTILE_SECRET_KEY` ochranu vypne;
  díky tomu jde nasadit nejdřív web a funkci a teprve pak CAPTCHA zapnout v Supabase (opačné pořadí by
  zablokovalo přihlašování).
- **Žádná kontrola „nick a e-mail k sobě nepatří“ u obnovy hesla** – odkaz přijde jen do schránky zadaného
  e-mailu, cizí heslo tak změnit nejde. Hláška o nesouladu by naopak komukoli umožnila zjistit, jaký e-mail má
  který veřejný nick. Srozumitelnost řeší předvyplnění e-mailu a rámeček s účtem.

### Fáze 25 – optimalizace, 2. kolo ✅ (6. 11. 2026) – **V2.7**
- **Odlehčená knihovna Supabase** `web/vendor/supabase-lite-2.119.0.min.js`: sestavená ze stejné verze
  supabase-js, ale Realtime, Storage a Functions klient jsou nahrazené prázdnými třídami
  (`scripts/vendor/build.mjs` + `stubs.js`). 225 → 134 kB, po kompresi 59 → 34 kB. Přihlášení a dotazy do
  databáze jsou beze změny (stejný kód knihovny).
- **Minifikace při nasazení** – krok *Minify JavaScript and CSS* v `.github/workflows/deploy-pages.yml`
  (esbuild, každý soubor zvlášť). JS při startu po kompresi ~43 → ~22 kB, CSS 13 → 9 kB.
- **Inter bez `preload`** – 48 kB písma už nesoupeří o linku s moduly aplikace; text se na první návštěvě
  na okamžik ukáže systémovým písmem. Přednačítá se jen malé písmo nadpisů (Chakra Petch 700).
- Service worker `mmd-v3` – stará mezipaměť (s původní knihovnou) se smaže.

**Měření** (telefon 412 px, CPU 4×, 1,6 Mb/s + 150 ms, gzip jako GitHub Pages, přihlášený uživatel, 5 běhů):

| | FCP | LCP | CLS |
|---|---|---|---|
| V2.6 | 848 ms | 1643 ms | 0 |
| + odlehčená knihovna | ~830 ms | ~1560 ms | 0 |
| + minifikace | 749 ms | 1445 ms | 0 |
| + Inter bez preload (**V2.7**) | **610 ms** | **1348 ms** | 0 |

#### Rozhodnutí ve fázi 25
- **Minifikace až v GitHub Actions, ne v repozitáři** – v repozitáři zůstává čitelný kód s českými komentáři
  (pravidlo „bez build kroku“ platí pro vývoj: soubory z `web/` jdou dál otevřít přímo v prohlížeči). Nevýhoda:
  chyby v konzoli na živém webu ukazují zmenšený kód – při ladění pustit web lokálně ze zdrojáků.
- **Bez spojování modulů do jednoho souboru (bundling)** – změnilo by názvy souborů, seznam pro service
  worker a líné načítání obrazovek; zisk by byl malý (HTTP/2 stahuje moduly souběžně).
- **Prázdné náhrady místo vlastního klienta** – vlastní obal nad auth-js a postgrest-js by ušetřil o pár kB
  víc, ale chování přihlášení (obnova tokenu, hlavičky) by se muselo psát znovu. Takhle běží původní kód
  supabase-js.
- **Kapitola V2.x je tímto uzavřená.** Správcovský klíč `MMD_ADMIN_KEY` vyměněn (6. 11.). Pokračuje kapitola V3.x.

### Fáze 26 – organizace kolekcí 1: zobrazení ✅ (6. 11. 2026) – **V3.0.1**
- **Tři pohledy na kolekci** (`views/universe.js`): **Release order** (výchozí, má ho každá kolekce, nadpisy
  z `group_label`), **Story order** (jen když je vyplněné `story_order`) a **By series** (jen když má aspoň jeden
  film `franchise`). Přepínač ukazuje jen dostupné pohledy; volba se pamatuje (`prefs` – klíč `order`), kolekce
  bez zvoleného pohledu ukáže Release.
- **By series:** skupiny v pořadí svého prvního filmu, uvnitř podle roku; filmy bez série ve skupině
  **Standalone** na konci.
- **Nové sloupce** `universe_items.franchise` a `universe_items.label` (migrace
  `20261106100000_collection_views.sql`), v seedu pole `franchise` a `label`, import je ukládá, admin panel má
  u filmu pole **Series** a **Label** (dosavadní „Group“ se jmenuje **Section**).
- **Popisek** se ukazuje nad názvem filmu v seznamu i v kartě Up next (Episode IV – A New Hope…).
- **Hledání najde i série** – sekce *Series in collections* („Cars“ → *Pixar › Cars*); odkaz
  `#/collection/<slug>?view=groups&group=<série>` otevře kolekci v pohledu By series a posune ji na sérii.
- **Cesty na přehledu až na konci** (`KIND_ORDER = series, studio, genre, path`).
- **Ukázková data:** MCU po hrdinech (Iron Man, Hulk, Thor, Captain America, The Avengers, Guardians…;
  Black Widow, Eternals, Shang-Chi… jako Standalone), Star Wars s čísly epizod a série *Skywalker Saga*
  (oddíly Skywalker Saga / Standalone se v pořadí vydání střídaly – přesunuté do By series).

#### Rozhodnutí ve fázi 26
- **Dva samostatné údaje místo jednoho:** `group_label` = oddíly v čase (Release), `franchise` = série (By series).
  U MCU dávají smysl obojí (Phase 1–6 i Iron Man / Thor…), u Disneyho éry i série.
- **Pořadí skupin podle prvního filmu**, ne abecedně – odpovídá tomu, jak série vznikaly (Iron Man před Thorem).
- **Odkaz z hledání neukládá zvolený pohled** – po otevření z hledání se ukáže By series, ale zapamatovaná
  volba uživatele zůstane, dokud sám neklikne.

### Fáze 27 – organizace kolekcí 2: obsah ✅ (6. 11. 2026) – **V3.0.2**
- **Série (By series)** v seedu: Pixar (Toy Story, Monsters Inc., Finding Nemo, The Incredibles, Cars, Inside Out),
  DreamWorks (Shrek, Spirit, Madagascar, Kung Fu Panda, How to Train Your Dragon, The Croods, Trolls, The Boss Baby,
  The Bad Guys), Disney (Fantasia, Winnie the Pooh, The Rescuers, Wreck-It Ralph, Frozen, Zootopia, Moana,
  Live-action remakes), X-Men (X-Men, Wolverine, Deadpool), Spider-Man (Raimi trilogy, The Amazing Spider-Man,
  MCU, Spider-Verse, Sony's Spider-Man Universe), Alien (Alien, Alien vs. Predator, Prequels), Asterix (Animated,
  Live-action), Conjuring (The Conjuring, Annabelle, The Nun). Filmy bez série → *Standalone*.
- **Oddíly v Release zůstaly tam, kde jdou po sobě** (MCU Phase 1–6, Disney éry, Pixar a DreamWorks po
  desetiletích, Halloween, Batman, Harry Potter / Fantastic Beasts…). Kde se v pořadí vydání střídaly (X-Men,
  Spider-Man, Alien, Asterix), přesunuly se do By series.
- **Popisky:** Star Wars epizody (V3.0.1), Spin-off / Prequel / MCU crossover / Live-action remake (stejný název
  jako animák) / Director's cut / Pre-Ghibli / Co-production – místo dřívějších jednofilmových „oddílů“.
- **Kolekce Shrek zrušena** (migrace `20261106110000_remove_shrek_collection.sql`) – filmy jsou v DreamWorks › Shrek;
  zhlédnutí a watchlist zůstávají.
- **Cesty přepsané** – pořadí už neodpovídá roku vydání:
  - *MCU Essentials* – v pořadí příběhu podle Kamenů nekonečna (Captain America: The First Avenger první),
  - *Star Wars: First Watch* – IV, V, pak prequely jako flashback (I–III) a Rogue One, VI, sequely,
  - *Superhero Hall of Fame* – po hrdinech (Spider-Man → MCU → Batman → X-Men → DC),
  - *Animation Essentials* – od rodinných hitů přes klasiku Disney a Ghibli po Spider-Verse,
  - *Horror 101* – od zábavných vstupních hororů (Scream) po nejtěžší (The Exorcist, Hereditary), klasika cestou,
  - *Fantasy Starter* – pořadí už bylo vlastní (rampa k Pánovi prstenů), beze změny.

### Fáze 28 – kontrola existujících kolekcí ✅ (6. 11. 2026) – **V3.1.1**
Pravidlo: do kolekce patří každý **film**, který s ní aspoň trochu souvisí; okrajové kusy jako **volitelné**
(nepočítají se do postupu) a s popiskem. Doplněno 29 filmů:
- **Batman** – celá historie: Burton & Schumacher (1989–1997), Dark Knight Trilogy, The Batman (+ Part II, 2028);
  volitelně Batman (1966), Mask of the Phantasm, The Lego Batman Movie, Joker a Joker: Folie à Deux.
  Kolekce přešla z oddílů na série (By series).
- **Middle-earth** – volitelně klasické animované filmy (The Hobbit 1977, The Lord of the Rings 1978, The Return
  of the King 1980) + The Hunt for Gollum (2027); přešla na série (The Lord of the Rings / The Hobbit / Animated).
- **Star Wars** – volitelně TV filmy (Holiday Special, dva filmy o Ewocích) + Star Wars: Starfighter (2027).
- **Wizarding World** – volitelně Return to Hogwarts (oddíl Specials).
- **Studio Ghibli** – volitelně The Castle of Cagliostro (Miyazaki před založením studia, popisek Pre-Ghibli).
- **Disney** – hrané remaky The Jungle Book (1994), 101 a 102 Dalmatians, Christopher Robin; Frozen III (2027).
- **Ohlášené filmy** – Avengers: Secret Wars, Spider-Man: Beyond the Spider-Verse, Man of Tomorrow (DCU),
  Shrek 5 (vše 2027). Import je přeskočí a nahlásí jako *upcoming*; další import je doplní sám.
- Dvojznačné názvy mají připnuté TMDB ID (Batman 1966 / 1989, The Hobbit 1977, The Jungle Book 1994…).

#### Rozhodnutí ve fázi 28
- **Žánrové výběry (horory) se nedoplňují** – jsou to kurátorské výběry, ne úplné série; případné rozšíření ve V3.1.2.
- **Disney jen kánon studia + hrané remaky** – pokračování přímo na video (Lion King II, Aladdin a další) by
  kolekci zdvojnásobila; zatím ne.
- **Marvel mimo MCU** (Hulk 2003, Blade, Fantastic Four 2005, Daredevil, Ghost Rider…) do MCU nepatří – kandidát na
  novou kolekci ve V3.1.2. Stejně tak **Predator** (souvisí s Alien vs. Predator).
- Seriály (She-Hulk, Andor, The Mandalorian…) se nepřidávají – viz kapitola V4.x.
- **Postup se může změnit:** kdo měl dokončený Batman (4 filmy), teď uvidí 6 povinných – nové filmy se počítají.

### Fáze 29 – dvouvrstvý filtr ✅ (6. 11. 2026) – **V3.1.2**
- **Přehled kolekcí má dvě vrstvy filtru** (`views/universes.js`): nahoře záložky **druhu** (All / Series / Studios /
  Genre picks / Paths), pod nimi pilulky **žánru**. Počty v jedné vrstvě se počítají podle volby ve druhé, prázdné
  volby se skryjí (zvolená zůstává vidět). Obě volby se pamatují (`prefs`: `kind`, `category`); kombinace bez
  výsledku nabídne „Show all collections“.
- **Kategorie** (migrace `20261106120000_categories_v2.sql`, stejně v seedu): Superhero · **Sci-fi** · **Fantasy** ·
  Animation · Action & Adventure · **Comedy** · **Crime & Thriller** · Horror. Fantasy: Wizarding World,
  Middle-earth, Fantasy Starter, Piráti z Karibiku, Ghibli; Comedy: Asterix, Horror Comedy; Crime & Thriller:
  Fast & Furious, Psychological, Giallo.

#### Rozhodnutí ve fázi 29
- **Druh jako záložky, žánr jako pilulky** – dvě vrstvy musí být na první pohled odlišné.
- **Žánrové výběry mimo horory jen tematické** (Time Travel, Heist…) – obecná kolekce „Action“ by byla nekonečná.
- **Verze V3.1.2–V3.1.5 místo čtyřmístných** (3.1.1.1) – přehlednější.

**Oprava po vydání V3.1.2 – širší stránka a zalamování žánrů (6. 11.):**
- Na počítači se poslední pilulka žánru (Crime & Thriller) schovávala za okraj → od šířky 720 px se pilulky
  **zalamují** na další řádek; na telefonu zůstává posouvání do strany (dotyk).
- **Širší obsah na velkých monitorech** (`--content-width`): do 1440 px 1140 px, od 1440 px **1320 px**, od 1700 px
  **1480 px** – zhruba polovina prázdného okraje na každé straně; víc karet na řádek. Telefon a tablet beze změny.
- Poznámka: po nasazení ukáže první načtení ještě starou verzi z offline mezipaměti (service worker) – nová se
  stáhne na pozadí, stačí obnovit stránku dvakrát (Ctrl+Shift+R). Úprava service workeru (síť jako první u JS/CSS)
  zapsána do Drobností.

### Fáze 30 – velká studia ✅ (6. 11. 2026) – **V3.1.3**
Deset nových studií (416 položek, filmy se sdílí s ostatními kolekcemi). Všechna mají v Release oddíly po
desetiletích a v By series série studia:
- **Marvel** (85) – *všechny filmy podle Marvelu*: MCU, X-Men (Fox), Spider-Man (Sony: Raimi + Amazing),
  Spider-Verse, Sony's Spider-Man Universe a filmy před MCU (Blade, Daredevil + Elektra, Hulk 2003, The Punisher,
  Fantastic Four 2005/2007/2015, Ghost Rider); volitelně Howard the Duck, Captain America (1990), Man-Thing,
  Big Hero 6.
- **DC** (50) – klasický Superman (1978–2006, Supergirl jako volitelný spin-off), všichni Batmani (Burton & Schumacher,
  Dark Knight Trilogy, The Batman), DCEU, DCU, Joker a samostatné (Catwoman, Constantine, Watchmen, Jonah Hex,
  Green Lantern…); okrajové (Swamp Thing, Steel, V for Vendetta, animované) volitelně.
- **Lucasfilm** (30) – Star Wars, Indiana Jones (5), American Graffiti, Howard the Duck, Labyrinth, Willow, Tucker,
  Red Tails, Strange Magic.
- **Illumination** (17) – Despicable Me + Minions, The Secret Life of Pets, Sing, Super Mario, The Lorax, The Grinch…
- **Sony Pictures Animation** (21) – Hotel Transylvania, Cloudy with a Chance of Meatballs, Angry Birds, Spider-Verse,
  KPop Demon Hunters, GOAT…
- **Blue Sky Studios** (13) – Ice Age, Rio, Robots, Epic, Ferdinand… (studio zavřené 2021).
- **Laika** (6) – Coraline, ParaNorman, The Boxtrolls, Kubo, Missing Link, Wildwood (2026).
- **Aardman** (10) – Wallace & Gromit, Chicken Run, Shaun the Sheep, Arthur Christmas, Early Man…
- **Warner Bros.** (148) – *velké série + zásadní filmy* (celý katalog by měl tisíce titulů): Wizarding World,
  Middle-earth, DC (bez filmů jiných distributorů – Batman 1966, Supergirl, Swamp Thing), The Matrix, MonsterVerse,
  Dune, Mad Max (od Mad Max 2), Lethal Weapon, Ocean's, Sherlock Holmes, The Hangover, Gremlins, Beetlejuice,
  Space Jam, The Lego Movie, It, Conjuring, Final Destination, Mortal Kombat + klasika a hity (Casablanca, The Exorcist,
  Blade Runner, Goodfellas, Inception, Barbie, Sinners…).
- **Jerry Bruckheimer Films** (42) – na přání kvůli **Armageddonu** (1998: produkce Bruckheimer, distribuce
  Touchstone = Disney): Top Gun, Bad Boys, Beverly Hills Cop, Piráti z Karibiku, National Treasure, The Rock,
  Con Air, Pearl Harbor, Black Hawk Down, F1…
- Ohlášené filmy (Avengers: Secret Wars, Beyond the Spider-Verse, Man of Tomorrow, The Batman Part II,
  Starfighter, Minions 3) import zatím přeskočí jako *upcoming*.

#### Rozhodnutí ve fázi 30
- **Studio = celý katalog, série = skupiny** – Marvel není kopie MCU, DC není kopie DCEU; samostatné série
  (MCU, X-Men, Batman…) zůstávají pro ty, kdo sledují jen jednu.
- **Spoluprodukce ve více studiích** – Chicken Run, Were-Rabbit a Flushed Away jsou v DreamWorks i v Aardmanu,
  Arthur Christmas v Sony i v Aardmanu, Spider-Verse v Marvelu, Spider-Manovi i Sony (zhlédnutí se počítá všude).
- **Armageddon → Jerry Bruckheimer Films, ne Touchstone** – Touchstone je jen značka Disneyho pro filmy pro dospělé;
  Bruckheimer je produkční studio s jasným rukopisem a slavnými sériemi.
- **Warner Bros. jako výběr, ne úplný katalog** – série + filmy, které definovaly studio; další se dají přidat.
- Doplňování dalších studií (Universal, Paramount, Blumhouse, A24…) později spolu s novými filmy.

### Fáze 31 – tematické žánrové výběry ✅ (6. 11. 2026) – **V3.1.4**
- **8 nových výběrů** (13–17 filmů): **Time Travel**, **Space Adventures**, **Cyberpunk & Dystopia** (Sci-fi),
  **Heist Movies** (Crime & Thriller + Action), **Martial Arts**, **80s Action** (Action & Adventure),
  **War Movies** (nová kategorie **War**) a **Christmas Movies** (nová kategorie **Family** + Comedy; s Třemi oříšky
  pro Popelku a Smrtonosnou pastí jako volitelnou – „Is it a Christmas movie?“).
- **Ruční obal karty:** film v seedu může mít `"cover": true` (import to bere před „prvním povinným filmem“).
  Nastaveno u studií, kde by obalem byl nevýrazný první film: Marvel → Avengers: Endgame, DC → The Dark Knight,
  Warner Bros. → The Matrix, Lucasfilm → Star Wars, Jerry Bruckheimer → Armageddon, Ghibli → Spirited Away,
  DreamWorks → Shrek, Sony → Into the Spider-Verse, Illumination → Minions; a u všech nových výběrů.
- Migrace `20261106130000_categories_war_family.sql` (kategorie Family a War) – spustit **před** importem.

#### Rozhodnutí ve fázi 31
- **Témata místo obecných žánrů** (Time Travel, ne „Sci-fi“) – výběr pak něco říká a dá se dokončit.
- **AI & Robots vynecháno ve prospěch War Movies** – tři sci-fi výběry stačí, válečné filmy rozšiřují nabídku.
- Christmas Movies jsou žánrový výběr, ne série – dávají smysl celoročně ve filtru Family.

### Fáze 32 – nové série ✅ (6. 11. 2026) – **V3.1.5**
25 nových sérií (167 položek) podle standardu V3.0 – série uvnitř kolekce, popisky, pořadí příběhu, okrajové
filmy volitelně:
- **James Bond** (25 oficiálních + volitelně Casino Royale 1967 a Never Say Never Again; By series podle herců),
  **Mission: Impossible** (8), **John Wick** (4 + Ballerina), **Indiana Jones** (Story: Temple of Doom jako prequel),
  **The Matrix** (+ The Animatrix volitelně), **Terminator**, **Rocky & Creed**, **Back to the Future**, **Die Hard**,
  **The Hunger Games** (Katniss + prequely, Story order; Sunrise on the Reaping 2026), **The Twilight Saga**,
  **Planet of the Apes** (původní série, reboot; Burtonův remake volitelně), **Transformers** (Bay, nová éra,
  animované), **Star Trek** (TOS, TNG, Kelvin; Section 31 volitelně), **Bourne**, **Men in Black**, **Ghostbusters**
  (reboot 2016 volitelně), **Predator** (Story order od Killer of Killers po Badlands; AvP volitelně), **Rambo**,
  **The Godfather**, **Knives Out**, **Paddington**, **Kingsman** (Story: The King's Man jako prequel), **Jumanji**
  (Zathura volitelně), **The Karate Kid** (původní série + Dre Parker a Legends).
- Nová kategorie **Drama** (migrace `20261106140000_category_drama.sql`) – Rocky & Creed, The Godfather.
- Stejné názvy v jedné kolekci mají připnuté TMDB ID (Casino Royale 1967/2006, Ghostbusters 1984/2016,
  Planet of the Apes 1968/2001, The Karate Kid 1984/2010) + Ballerina (v TMDB „From the World of John Wick: Ballerina“).

#### Rozhodnutí ve fázi 32
- **Série ze studií zůstávají i samostatně** (Indiana Jones je v Lucasfilmu, Matrix ve Warner Bros.) – kdo sleduje
  jen jednu sérii, nechce procházet celé studio.
- **Jumanji 3 (prosinec 2026) zatím ne** – název ani datum nejsou potvrzené; doplní se při další kontrole.
  *(Doplněno ve V3.3 jako Jumanji: Open World.)*
- **Kapitola rozšiřování V3.1 je tímto hotová** – pokračuje V3.2 (hodnocení).

**Oprava k V3.1.5 – nová verze hned po nasazení:** service worker (`web/sw.js`, mezipaměť `mmd-v4`) bere JS, CSS
a ikony **ze sítě jako první** (limit 2,5 s, offline / pomalá síť → uložená verze). Dřív je vracel hned z mezipaměti
a nová verze (třeba číslo verze v patičce) se ukázala až po druhém obnovení. Neměnné soubory s verzí v názvu
(vendor/, fonts/) zůstávají jen z mezipaměti; offline režim funguje stejně. Hláška „update-available“
s tlačítkem Reload se už nepoužívá. Jednorázově: po nasazení téhle opravy je potřeba obnovit ještě naposledy dvakrát.

### Fáze 33 – hodnocení ✅ (6. 11. 2026) – **V3.2**
- **0,5–5 ★ po půlkách** (tabulka `ratings`, score 1–10). Migrace `20261106150000_ratings.sql` – RLS ověřené na
  lokálním Postgresu (cizí hodnocení nejde číst, měnit ani vložit; score mimo 1–10 neprojde; anon nevidí tabulku,
  jen průměry).
- **Detail kolekce:** u filmu pilulka **průměru uživatelů MMD** („★ 4.2 · 12“, vidí i nepřihlášení) a u viděného filmu
  tlačítko **☆ Rate** / **★ 4.5**. Editor se otevře pod řádkem přes celou šířku: 5 hvězd, každá se dvěma půlkami
  (myš, dotyk i klávesnice – Tab + Enter, Escape zavře), náhled při najetí, **Remove rating**. Uložení je
  optimistické, průměr se po uložení obnoví. Průměry se načítají až po vykreslení stránky.
- **Statistiky:** dlaždice **Average rating**, panel **Top rated** (8 nejlépe hodnocených s hvězdičkami) a
  **Your ratings** (rozložení 0,5–5 ★).
- Nové soubory `web/js/ratings.js` (data) a `web/js/views/rating.js` (hvězdičky).

#### Rozhodnutí ve fázi 33
- **Hodnotit jde jen viděný film** (pravidlo webu, ne databáze) – kdo smaže poslední zhlédnutí, hodnocení mu zůstane
  a může ho dál měnit.
- **Ukládá se 1–10, ne 0,5–5** – celé číslo, žádné zaokrouhlovací chyby.
- **Průměr veřejný, jednotlivá hodnocení soukromá** – na veřejném profilu zatím nejsou; přijdou s porovnáním
  s kamarádem (V3.4).
- **Průměr se ukazuje už od 1 hlasu** (s počtem hlasů vedle) – u malé komunity by vyšší práh skryl skoro vše.

### Fáze 34 – Co dneska? + Coming soon ✅ (6. 11. 2026) – **V3.3**
- **What to watch today?** nahoře na přehledu přihlášeného uživatele (nahradil kartu *Continue watching*) – tři karty:
  1. **From your watchlist** – náhodný vydaný a neviděný film z watchlistu,
  2. **Up next** – další neviděný film v rozkoukané kolekci; napoprvé v té, kde uživatel viděl film naposledy
     (= dřívější Continue watching), po Shuffle v jiné rozkoukané kolekci,
  3. **Explore something new** – kolekce, kterou ještě nezačal, vybraná podle **oblíbených žánrů**: každá kategorie
     má váhu podle počtu viděných filmů v jejích kolekcích; série a cesta začíná prvním filmem, studio a žánrový výběr
     nabídne náhodný film. Popisek „Because you watch Horror“ (nebo „Something different“, když žádný žánr nesedí).
- **Shuffle** nabídne jiné tři filmy (už ukázané přeskočí, dokud jsou jiné). Výběr je **náhodný na den** – generátor
  se semínkem z data a ID uživatele, takže po obnovení stránky zůstanou stejné tipy.
- Karta Up next / watchlist má **+ Mark as watched**, Explore **☆ Watchlist** a **Open →**. Úplný nováček (nic neviděl,
  prázdný watchlist) dostane dál uvítací kartu.
- Logika v `web/js/today.js` (čistá, bez vykreslování), vykreslení `web/js/views/today.js`. Data se berou ze stejného
  seznamu filmů jako hledání (`fetchSearchData`, v mezipaměti) – žádná nová tabulka ani funkce v databázi.
- **Coming soon:** nový sloupec `universe_items.is_upcoming` (migrace `20261106160000_coming_soon.sql`), pohled
  `universe_progress` chystané filmy nepočítá. **Import** (`tmdb`) dřív nevydané filmy přeskočil; teď je uloží
  s `is_upcoming = true`, pokud je premiéra **nejpozději do konce roku letos + 5** (2031 → Avatar 5 se vejde).
  Vzdálenější nebo zrušené filmy jen vypíše v reportu (`skipped`), uložené chystané v `comingSoon`.
  *(Od V3.3.1 hranici počítá web a import ukládá všechny oznámené filmy – viz fáze 34b.)*
- **Detail kolekce:** oddíl **Coming soon** úplně dole – kartičky s plakátem (nebo velkým rokem premiéry, když plakát
  ještě není), datem, odpočtem do 60 dnů („in 35 days“) a sérií; přihlášený si film může dát do watchlistu.
  Číslo kolekce na přehledu ani postup se nemění.
- **Hledání** chystané filmy najde (pilulka „Coming 21 Dec 2029“, bez počítadla); **watchlist** u nich nemá
  *Mark as watched*; **statistiky a achievementy** je nepočítají; **admin** je vidí s pilulkou *Coming soon*.
- **Seed:** Avatar 4 (2029) a 5 (2031), Gatto (2027), Incredibles 3 (2028), Coco 2 (2029), Lilo & Stitch 2 (hraný, 2028),
  How to Train Your Dragon 2 (hraný, 2027), Jumanji: Open World (prosinec 2026), Fast X: Part 2 (2027).
  Opravy: *Minions 3* → **Minions & Monsters** (vyšlo 1. 7. 2026 – proto Illumination ukazovala 16 filmů místo 15),
  *The Batman Part II* → **2027** (přesunuto na říjen 2027).
- **Opravy mimo plán:** na telefonu šel přehled posouvat do strany (nevykreslené sekce kolekcí měly odhad šířky
  900 px – `contain-intrinsic-size` teď jen na výšku); text „Nothing left to watch here“ ve filtru neviděných
  přebíjel stejně pojmenovaný text přehledu (`filterEmpty` byl v `texts.js` dvakrát).
- Service worker `mmd-v5` (nové soubory v offline mezipaměti).

#### Rozhodnutí ve fázi 34
- **Co dneska? nahrazuje Continue watching**, místo aby byl další blok nad ním – „co vás čeká dál“ je přesně to, co
  Continue watching dělalo, dvakrát by se to opakovalo.
- **Tipy se počítají v prohlížeči**, ne v databázi – seznam filmů už web má kvůli hledání a výpočet je okamžitý;
  Shuffle tak nepotřebuje žádný dotaz na server.
- **Náhoda na den, ne při každém načtení** – tip se neztratí, když se uživatel vrátí na přehled.
- **Explore bere jen nezačaté kolekce** a žánry váží druhou mocninou – oblíbený žánr výrazně převáží, ale malá
  základní váha nechá občas prostor i pro něco úplně jiného.
- **Chystaný film = položka kolekce s příznakem**, ne zvláštní tabulka – po premiéře ho další import jen přepne na
  běžný film (zhlédnutí, watchlist i hodnocení zůstanou na stejném `tmdb_id`).
- **Horizont 5 let** podle zadání; datum z TMDB, a když ještě není, rozhodne rok ze seedu.
- ~~Po premiéře je potřeba import~~ – od V3.3.1 se film v den premiéry přepne sám (fáze 34b).

### Fáze 34b – stránka Coming soon + automatika ✅ (6. 11. 2026) – **V3.3.1**
- **Nová záložka Coming soon** v hlavičce (pro všechny, i nepřihlášené; na telefonu ikona kalendáře) →
  `#/coming-soon` (`web/js/views/upcoming.js`). Jeden seznam všech chystaných filmů ze všech kolekcí, **nejbližší
  premiéra nahoře**, rozdělený **po čtvrtletích** (*October – December 2026 · Q4*, *January – March 2027 · Q1*…),
  filmy bez data na konci (*Date to be announced*). Řádek: plakát (nebo velký rok), název, datum s odpočtem,
  barevné odkazy na kolekce (série první), ☆ watchlist pro přihlášené. Bez filtrů.
- **Hranice 5 let počítá web** podle dnešního data, po celých rocích: v roce 2026 se ukazuje vše do konce roku 2031,
  1. 1. 2027 přibude celý rok 2032 – samo, bez importu (`comingSoonLastYear()` v `data.js`). Import (`tmdb`) proto
  ukládá **všechny** oznámené filmy, přeskočí jen zrušené. Filmy za hranicí vidí jen admin.
- **V den premiéry se film přepne sám:** chystaný = `is_upcoming` **a** premiéra je až po dnešku (nebo bez data).
  Stejné pravidlo má pohled `universe_progress` (migrace `20261106170000_coming_soon_auto.sql`) i web
  (`isUpcoming()` v `data.js`) – film se v den premiéry začne počítat do postupu a jde označit jako viděný.
  Import pak jen obnoví údaje z TMDB (délka, plakát) a srovná příznak.
- **Seed:** *How to Rob a Bank* (David Leitch, 13. 11. 2026) do **Heist Movies**.
- Hlavička na nejužších telefonech (≤ 360 px) má menší mezery, ať se nepřihlášenému vejde i Register.
- Service worker `mmd-v6`.

#### Rozhodnutí ve fázi 34b
- **Stránka bez filtrů** – kdo chce jen Marvel nebo jednu sérii, otevře kolekci (oddíl Coming soon dole); tady jde
  o přehled „co vychází“.
- **Čtvrtletí místo měsíců** – měsíců by bylo moc a většinou s jedním filmem.
- **Hranice po celých rocích**, ne den po dni – jednodušší a stejně se posouvá sama.
- **Data jsou z TMDB = hlavní (většinou americká) premiéra**, ne česká – rozdíl bývá den až pár týdnů.

**Oprava V3.3.2 – chystaný film podle data:** *Hunger Games: Sunrise on the Reaping* měl v TMDB 6. 11. stav
„Released“, ale premiéru 18. 11. – import ho uložil jako vydaný (v seznamu filmů s délkou, ne v Coming soon).
Teď rozhoduje **datum premiéry**: se známým datem je film chystaný, dokud premiéra nebyla (stav z TMDB se ignoruje);
bez data rozhodne příznak `is_upcoming`. Pravidlo má pohled `universe_progress` (migrace
`20261106180000_coming_soon_by_date.sql`) i web (`isUpcoming()`); import nastaví příznak i podle data. Stránka
Coming soon se proto skládá ze stejného seznamu filmů jako hledání (dotaz jen na `is_upcoming` by takový film minul).
Opraví se hned po migraci a nasazení webu, bez importu.

### Fáze 35 – přátelé ✅ (6. 11. 2026) – **V3.4.1**
- **Vzájemné přátelství:** žádost → druhý ji přijme nebo odmítne; zrušit ho může kdokoli z dvojice. Když mi ten
  druhý už žádost poslal a já pošlu svoji, rovnou se přijme.
- **Bez veřejného profilu:** požádat jde i soukromý účet – najde se podle **přesného nicku** (formulář *Add a friend*
  nebo hledání). Cizí soukromý profil ukáže jen nick, „🔒 Private profile“ a tlačítko přátelství – žádná čísla.
  **Přátelé vidí profil toho druhého** (achievementy, statistiky) i když je soukromý. Veřejný profil dál slouží ke
  sdílení s ostatními lidmi; u soukromého profilu přítele se tlačítko *Share* schová.
- **Stránka `#/friends`** (třetí záložka u profilu: Achievements | Stats | **Friends**): přidání podle nicku, přijaté
  žádosti (Accept / Decline), seznam přátel (odkaz na profil, Remove s potvrzením přímo v řádku), odeslané žádosti
  (Cancel). **Odznak** s počtem žádostí v záložce i v rohu tlačítka s nickem v hlavičce – s žádostí vede nick
  rovnou na Friends. Žádosti se kontrolují po přihlášení a při přechodu mezi stránkami (nejvýš jednou za minutu).
- **Profil (`#/u/<nick>`):** tlačítko podle stavu – *+ Add friend*, *⏳ Request sent · Cancel request*,
  *Accept / Decline*, *✓ Friends* (klik → „Remove @nick from friends?“).
- **Hledání lidí:** veřejné profily a přátelé podle části nicku, soukromý účet jen podle přesného nicku;
  pilulka *✓ Friends* / *Request sent* / *Wants to be friends*.
- Migrace `20261106190000_friends.sql` – tabulka `friendships` (zápis jen přes funkce), funkce `send_friend_request`,
  `respond_friend_request`, `remove_friend`, `my_friends`, `search_people`, rozšířená `public_profile`.
  Ověřeno na lokálním Postgresu (přímý zápis do tabulky neprojde, cizí řádky nejsou vidět, nepřihlášený nemůže
  žádat ani vidět soukromý účet).
- Opravy mimo plán: na úzkém telefonu se zkracuje jen nick v hlavičce (odznaky se neusekávají).

#### Rozhodnutí ve fázi 35
- **Vzájemné, ne „follow“** – přátelství otevírá soukromý profil, musí s ním souhlasit oba.
- **Soukromý účet jen podle přesného nicku** – jinak by šlo procházet seznam všech účtů; kamarád ti nick řekne.
  Prozradí to jen, že účet s tím nickem existuje, nic víc.
- **Žádný chat ani zprávy** – jen seznam přátel a porovnání (V3.4.2).
- **Žádné ID účtů ven** – všechny akce podle nicku přes funkce v databázi.

### Fáze 36 – porovnání s kamarádem ✅ (7. 11. 2026) – **V3.4.2**
- **Stránka `#/compare/<nick>`** – tlačítko **⇄ Compare** na profilu (přihlášený, cizí profil, který vidí) a u každého
  přítele v seznamu Friends.
- **Hlavička:** obě iniciály, **shoda ve viděných filmech v %** (společné / všechny filmy, které viděl aspoň jeden),
  počet filmů a hodin každého, pruh *jen ty · oba · jen kamarád*.
- **Taste match** (jen u přátel): shoda v hodnocení u filmů, které hodnotili oba (100 % = stejně, 0 % = rozdíl
  4,5 ★), od 3 společně hodnocených filmů; seznamy **You both loved** (oba od 4 ★) a **Biggest differences**
  (rozdíl aspoň 1,5 ★).
- **@kamarád recommends:** filmy, které viděl jen on – s hodnocením od 4 ★ (přítel), u veřejného profilu bez
  hodnocení ty, které viděl víckrát.
- **Collections head to head:** až 8 kolekcí, které rozkoukal aspoň jeden, se dvěma pruhy postupu (cesty se
  nepočítají).
- **Movies:** záložky *Both · Only you · Only @kamarád* s mřížkou plakátů (48 + *Show all*).
- Migrace `20261107000000_compare.sql` – `public_profile` vrací **hodnocení jen příteli** (cizímu u veřejného profilu
  `ratings = null`). Výpočet v prohlížeči (`web/js/compare.js`), vykreslení `web/js/views/compare.js`.

#### Rozhodnutí ve fázi 36
- **Porovnat jde přítele i veřejný profil** – data veřejného profilu jsou stejně vidět; jen hodnocení zůstávají
  mezi přáteli (u veřejného profilu výzva „add as a friend to compare tastes too“).
- **Shoda = Jaccard**, ne „kolik z mých filmů viděl on“ – je souměrná, oběma vyjde stejné číslo.
- **Taste match až od 3 společně hodnocených filmů** – z jednoho nebo dvou by procento nic neznamenalo.

### Fáze 37 – požadavky na filmy ✅ (8. 11. 2026) – **V3.5.1**
- **Záložka Requests** v hlavičce (přihlášení; na užších noteboocích a telefonu jen ikona ⊕) → `#/requests`:
  - **New request:** hledání v TMDB přímo na stránce (Edge Function `requests`), u každého filmu stav –
    *In MMD* (už ho máme, odkaz do hledání), *Requested* (už ho chci), *+1 Wanted* (čeká cizí požadavek –
    výběr se počítá jako +1), *+ Add*. Až **20 filmů** v jednom požadavku (štítky s ×), nepovinná poznámka pro
    admina. Nejvýš **5 nevyřízených požadavků** (+1 jde dávat dál).
  - **My requests:** požadavky se stavem *Pending / Added / Rejected / Partly added*, u každého filmu zvlášť
    (u přidaného i kolekce, kam ho admin zařadil); nerozhodnutý požadavek jde zrušit.
  - **Wanted movies:** všechny požadované filmy bez jmen žadatelů – záložky Pending / Added / Rejected,
    filtr podle názvu, počet zájemců a **+1** (zpět jde vzít).
- **Hledání:** pod výsledky „Can't find a movie? **Request it**“ (předvyplní dotaz); filmy mimo kolekce se
  najdou s pilulkou *Other movie* a jdou zapsat jako viděné / do watchlistu.
- **Admin → Requests:** karta požadavku (nick, datum, poznámka), u každého filmu zaškrtnutí, počet zájemců a výběr
  kolekce – předvybraný **návrh podle TMDB** (stejná série = kolekce, kde už je jiný díl; produkční společnost =
  studio stejného jména), nebo *No collection*. **Approve / Reject** pro zaškrtnuté filmy (celý požadavek nebo
  výběr). Rozhodnutí platí pro film ve všech čekajících požadavcích. Po přijetí do kolekce ukáže **řádky do seedu**
  (s tlačítkem Copy) – jinak by film z kolekce smazal příští import.
- **Statistiky / profil:** panel **Other movies** (viděné filmy mimo kolekce).
- **Seed:** série **The Texas Chainsaw Massacre** (9 filmů; remake 2003/2006 volitelný) a **Wrong Turn**
  (7 filmů; reboot 2021 volitelný) – požadavek od kamaráda.
- Migrace `20261108100000_film_requests.sql` (tabulky `film_requests`, `film_request_items`, `film_request_votes`,
  funkce `wanted_films`, `film_request_pending`, pohled `other_films`), nová Edge Function `requests`,
  funkce `admin` rozšířená o `requests` a `request-decide`. Ověřeno na lokálním Postgresu (cizí požadavky
  nejsou vidět, přímý zápis požadavku neprojde, +1 jen u čekajícího filmu, zrušit jde jen nerozhodnutý požadavek).
- Hlavička: správce má v hlavičce o odkaz víc – do 1 439 px jsou Coming soon a Requests jen ikony
  (ostatním do 1 180 px), na 320 px menší okraje.

**Doplnění seedu (8. 11.):** série **RoboCop** (1987, 2, 3; remake 2014 volitelný), **Black Christmas** (1974 + dva
remaky volitelně), **Terrifier** (All Hallows' Eve volitelně), **Happy Death Day** (2 filmy) a **X Trilogy**
(X, Pearl, MaXXXine – s pořadím v příběhu: Pearl → X → MaXXXine). Návrhy od kamaráda a první požadavky:
RoboCop 2 a 3 admin přijal do 80s Action (návrh podle TMDB série) – patří ale do vlastní kolekce, takže řádky do
seedu v 80s Action nejsou a příští import 80s Action je odtamtud odebere.

#### Rozhodnutí ve fázi 37
- **Údaje o filmu bere z TMDB server**, ne web – v seznamu požadavků (vidí ho všichni) tak nemůže být podvržený název.
- **+1 místo duplicitního požadavku** – správce vidí, kolik lidí film chce, a nemá ve schránce desetkrát totéž.
- **Jedno rozhodnutí na film**, ne na požadavek – stejný film od tří lidí se přijme (nebo zamítne) jednou.
- **Návrh kolekce jen jako návrh** – produkční společnosti v TMDB jsou nepřesné (Disney je u spousty filmů),
  zařazení potvrzuje správce.

## Drobnosti k dořešení
- Nausicaä se v TMDB může zobrazovat pod starým americkým názvem *Warriors of the Wind* – případně doplnit možnost přepsat zobrazovaný název (admin panel).
- GitHub vypne plánované workflow (keep-alive) ve veřejném repozitáři po 60 dnech bez aktivity v repozitáři – přijde e-mail, zapne se jedním kliknutím.

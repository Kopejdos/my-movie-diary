# Testy (V3.6.2)

Rychlé testy **logiky webu** – bez prohlížeče, bez databáze a bez instalace balíčků.
Moduly z `web/js` se načtou přímo v Node.js; klient Supabase se podvrhne (`stub-supabase.mjs`).

## Spuštění

Potřeba je jen **Node.js 20 nebo novější** (https://nodejs.org – verze LTS). V kořeni repozitáře:

```bash
node --test
```

Node sám najde všechny soubory `*.test.mjs`. Výsledek je na konci výpisu (`# pass …`, `# fail 0`).
Jeden soubor: `node --test tests/levels.test.mjs`.

## Co se testuje

| Soubor | Co hlídá |
|---|---|
| `levels.test.mjs` | prahy úrovní (100 / 450 / 1 950 / 10 400 … 79 150 XP), tituly Extra … Legend, postup k další úrovni |
| `achievements.test.mjs` | XP za nové filmy, opakování a dokončené kolekce; *Seen before* se nepočítá do času ani Marathonu; datum odemčení |
| `search.test.mjs` | normalizace textu (diakritika, apostrofy, `&`, cyrilice), pořadí výsledků, „spiderman“ = „Spider-Man“, hledání podle roku i podle anglického názvu přeloženého filmu |
| `settings.test.mjs` | nastavení vzhledu (V4.0): výchozí hodnoty, neplatné volby se ignorují, zápis na `<html>` |
| `texts.test.mjs` | jazyky (V4.2): každý slovník má všechny texty mimo admin, žádné navíc, stejné `{0}` jako angličtina a tvary podle počtu (1 / 2 / 5 / 21…) |
| `catalog-i18n.test.mjs` | přeložená data katalogu (V4.2.2): soubory `catalog.<jazyk>.json` mají správný tvar, žádné prázdné texty a stejné kolekce ve všech jazycích |
| `add-pack.test.mjs` | balíček kolekcí do seedu (V4.3.2): nové kolekce na konec, úpravy existujících, ostatní řádky beze změny, opakované spuštění nic nepřidá, CRLF; platnost balíčku V4.3.2; další cíl katalogu (2 000, pak po 500) |
| `collection-texts.test.mjs` | překlady kolekcí (V4.3.4): oprava z databáze → soubor → angličtina, rozdíly proti návrhům z TMDB (ne u „Keep ours“), co uložit po ruční úpravě (návrat na soubor = smazání opravy) |
| `guide.test.mjs` | průvodce pro nováčky (V4.3.4): která prohlídka se kde spustí, kratší verze bez přihlášení, texty všech kroků, zapamatování i bez úložiště |
| `theme.test.mjs` | každá barva kolekce ze `supabase/seed/universes.json` dá tlačítko s kontrastem aspoň 4,5 : 1 (WCAG AA) |

## Pomocné soubory

- `setup.mjs` – importuje se jako první v každém testu: zaregistruje `hooks.mjs` a doplní minimum z prohlížeče
  (`window`, `localStorage`); `web("soubor.js")` vrátí cestu k modulu webu.
- `hooks.mjs` – při načítání modulů přesměruje `./supabase.js` na `stub-supabase.mjs`.

## Kdy spustit

Po změně levelování, achievementů, hledání, textů (nový klíč v `en.js` = doplnit ho do všech jazyků) nebo barev kolekcí – a před vydáním verze.
`theme.test.mjs` hlídá, že automatické ztmavení barvy na tlačítkách (`fillFor` ve `web/js/theme.js`)
stačí pro každou kolekci – i pro ty, které teprve přibudou v seedu.

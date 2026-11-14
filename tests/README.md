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
| `search.test.mjs` | normalizace textu (diakritika, apostrofy, `&`), pořadí výsledků, „spiderman“ = „Spider-Man“, hledání podle roku |
| `settings.test.mjs` | nastavení vzhledu (V4.0): výchozí hodnoty, neplatné volby se ignorují, zápis na `<html>` |
| `theme.test.mjs` | každá barva kolekce ze `supabase/seed/universes.json` dá tlačítko s kontrastem aspoň 4,5 : 1 (WCAG AA) |

## Pomocné soubory

- `setup.mjs` – importuje se jako první v každém testu: zaregistruje `hooks.mjs` a doplní minimum z prohlížeče
  (`window`, `localStorage`); `web("soubor.js")` vrátí cestu k modulu webu.
- `hooks.mjs` – při načítání modulů přesměruje `./supabase.js` na `stub-supabase.mjs`.

## Kdy spustit

Po změně levelování, achievementů, hledání nebo barev kolekcí – a před vydáním verze.
`theme.test.mjs` hlídá, že automatické ztmavení barvy na tlačítkách (`fillFor` ve `web/js/theme.js`)
stačí pro každou kolekci – i pro ty, které teprve přibudou v seedu.

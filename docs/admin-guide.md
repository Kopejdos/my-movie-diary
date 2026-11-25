# Návod pro správce (admin panel)

Návod pro správce My Movie Diary – co v admin panelu jde udělat, kde to najdeš a na co si dát pozor.
Admin panel otevřeš odkazem **Admin** v hlavičce webu (vidí ho jen správci). Texty admin panelu jsou
jen anglicky; tenhle návod je česky a v panelu na něj vede tlačítko **📖 Admin guide**.

> **Zlaté pravidlo:** všechno, co uděláš v admin panelu, se ukládá rovnou do databáze a je hned vidět
> na webu. Nic se nekopíruje ručně – vlastník webu to při dalším importu propíše do seedu
> (`supabase/seed/universes.json`) sám. Každá změna se zapíše do **deníku správců** (záložka Activity).

---

## Role v týmu

| Role | Co smí |
|---|---|
| **Vlastník** (👑 Owner) | všechno; jako jediný dělá a ruší správce, mění účty jiných správců; spouští skripty (balíčky, import, překlady) a nasazuje novou verzi |
| **Agent** (správce) | kolekce, filmy, překlady, požadavky, nahlášené seznamy, nicky a běžné uživatele |

- Správci se v rozhraní jmenují **agenti** (od V4.4.6.1) a mají nick ve tvaru `Agent_` + písmeno (`Agent_A`,
  `Agent_F`). Vyhrazená slova (*admin*, *agent*, *staff*…) smí mít v nicku jen agent – urážky nesmí nikdo.
- Agent **nemůže** udělit ani odebrat roli agenta, smazat jiného správce ani mu resetovat nick.
  To hlídá i server (Edge Function `admin`), ne jen tlačítka.
- Vlastník se nastavuje jen v SQL (viz `docs/setup.md`, „Další správce“) – z webu to nejde.
- Správcovský účet je **samostatný účet jen pro správu** (vlastní e-mail a heslo). Na svém osobním
  účtu si dál zapisuješ filmy jako běžný uživatel – tam roli správce nemáš.
- Heslo ke správcovskému účtu nikomu neposílej a nikam nepiš. Klíč `MMD_ADMIN_KEY` (pro skripty)
  správce nepotřebuje – má ho jen vlastník.

---

## Záložky admin panelu

### Collections – kolekce

Přehled všech kolekcí v pořadí, v jakém jsou na webu. Nahoře:

- **Catalog goal** – kolik filmů má katalog a kolik zbývá do cíle.
- **New movies in your series** – nové díly sérií z TMDB, které v kolekcích ještě nejsou. **Add** film
  přidá na správné místo podle data premiéry (a nabídne i další kolekce, kam by patřil); **Dismiss** ho
  už nenabízí. Kontrola běží sama při otevření panelu, ručně tlačítkem **Check now**.
- **New collection** – prázdná kolekce: název, adresa (slug – malá písmena, čísla a pomlčky, např.
  `star-wars`; po vytvoření ho neměň), typ, kategorie (kde se na přehledu ukáže, může jich být víc),
  barva a popis. Filmy přidáš v editoru.

U každé kolekce: šipky **↑ ↓** (pořadí na přehledu), **Edit** (editor) a **Delete** (smaže kolekci,
filmy v databázi zůstanou). Hledání najde kolekci i podle filmu, který v ní je.

**Typy kolekcí:**

| Typ | Na co | Příklad |
|---|---|---|
| Series | filmová série nebo univerzum | Alien, MCU, Bud Spencer & Terence Hill |
| Studios | filmy jednoho studia | Pixar, Hammer, A24 |
| Directors | filmy režiséra, obvykle po dekádách | Sergio Leone, Kubrick |
| Genre picks | ručně vybraná klasika žánru | AI & Robots, Film Noir |
| Paths | cesta krok za krokem, s poznámkou ke každému filmu | Kaiju 101, Czech Classics |

### Editor kolekce (Edit)

Změny se sbírají a ukládají najednou tlačítkem **Save** dole (lišta ukáže počet neuložených změn;
**Discard** je zahodí). Odejít z neuložené kolekce se web zeptá.

- **Collection details** – název, typ, kategorie, barva, popis. U série prázdný popis = popis z TMDB.
- **Add a movie** – hledání v TMDB podle názvu (*Iron Man*), **Add** film přidá na konec; přesuň ho
  šipkami. Nevydaný film jde přidat taky – ukáže se v Coming soon.
- U každého filmu:
  - **Section** – nadpis skupiny (*Phase 1*, *1970s*, *Together*, *Bud Spencer*);
  - **Series** – podsérie uvnitř velké kolekce (*Iron Man* v MCU) – pro řazení „By series“;
  - **Label** – štítek u filmu (*Episode IV*, *Remake*, země u oscarových výběrů);
  - **Story #** – pořadí v chronologii příběhu (prázdné = podle premiéry);
  - **Optional** – vedlejší film, nepočítá se do postupu (prequel, spin-off, remake);
  - **Step note** – proč film vidět (jen u cest, Paths);
  - **Use as cover** – plakát filmu jako obal kolekce;
  - **Remove** – odebere film z kolekce (jde vrátit **Undo** do uložení).
- Pořadí filmů = pořadí podle premiéry na webu; měň ho šipkami.
- **View collection** – otevře kolekci na webu.

### Builder – stavitel kolekcí

Nová kolekce z TMDB jedním tahem (režiséři, herci, studia, témata):

1. Vyber **zdroj**:
   - **Person** – režisér nebo herec (filmy podle role: Directing / Acting…);
   - **Two people** – dvojice: filmy, které natočili spolu (*Together*), a samostatné filmy každého z nich;
   - **Studio** – produkční společnost z TMDB (Hammer, Toho, A24);
   - **Keyword** – klíčové slovo TMDB (*spaghetti western*, *kaiju*, *time travel*).
2. Najdi osobu / studio / slovo, nastav **pořadí**, kolik filmů načíst, roli, **min. počet hlasů**
   (odfiltruje neznámé filmy), roky **From–To**, **No documentaries**, **Hide movies already in MMD**.
3. Zaškrtni filmy (nebo **Select all shown**), zvol **Sections** (bez sekcí / po dekádách / spolu a každý
   zvlášť), vyplň název a typ a **Create collection**. Kolekce se přidá na konec přehledu; dolaď ji v editoru.

**Studio vs. Keyword:** studio je firma, která film vyrobila (Pixar), klíčové slovo je téma (*robot*).
Pro „studio“ jako typ kolekce použij zdroj Studio a typ Studios.

### Translations – překlady kolekcí

Názvy a popisy kolekcí v češtině, němčině, španělštině a ukrajinštině (angličtina je v kolekci samotné).

- **Check with TMDB** porovná naše názvy sérií s TMDB a ukáže rozdíly: **Use** vezme název z TMDB,
  **Keep ours** nechá náš, nebo ho oprav ručně a **Save**.
- **Use TMDB for N untranslated** – hromadně doplní chybějící názvy z TMDB.
- Filtr **Differences / Untranslated** a výběr jazyka. Opravy jsou vidět po obnovení stránky.
- Názvy **filmů** se nepřekládají ručně – bere je import z TMDB. Český film, který v TMDB nemá český
  překlad názvu, se v češtině ukáže pod původním názvem (od V4.4.6).

### Users – uživatelé

Hledání podle nicku nebo e-mailu, filtr **Agents**. U uživatele: úroveň, počet zhlédnutí, veřejný /
soukromý profil, způsob přihlášení.

- **★ Make Elite / Remove Elite** – odznak Elite u nicku (jen ozdoba, nemění limity).
- **Reset nickname** – dá automatický nick a profil přepne na soukromý (nick porušuje pravidla).
- **Delete** – trvale smaže účet a všechna jeho zhlédnutí. Nejde vrátit.
- **Make agent / Remove agent** – jen vlastník.

### Nicknames – zakázaná slova

Slova, která nesmí být v nicku. **Anywhere in the nickname** = kdekoli v nicku, **Whole nickname** = jen
celý nick. Čísla a znaky se berou jako písmena (k0k0t = kokot); podtržítko a pomlčka se při porovnání
vynechají, v nicku jsou ale povolené (*Movie_Fan*). Nick se slovem dostane v Users příznak *Nickname breaks
the rules* – resetuj ho.

- **🛡 Reserved** – vyhrazené slovo (*admin*, *agent*, *moderator*, *staff*, *official*…): běžný uživatel ho
  v nicku mít nesmí, aby se nevydával za tým webu, agent ano (*Agent_F*). V názvech seznamů se nekontroluje.
  Tlačítkem **Reserve for agents / Block for everyone** slovo přepneš, u nového slova zaškrtni *Reserved*.
- Urážky a vulgarity nech **zakázané pro všechny** – ty nesmí mít ani agent.

### Requests – požadavky

Požadavky uživatelů na filmy a kolekce.

- U filmu vyber **kolekci** (návrhy podle série a studia nahoře, nebo *No collection* = jen přidat film),
  zaškrtni filmy a **Approve**, nebo **Reject** s důvodem a poznámkou pro uživatele.
- **Suggested new collections** – víc lidí chce filmy ze stejné série TMDB, která v MMD není: jedním
  kliknutím z ní uděláš kolekci.
- U požadavku na vlastní kolekci uprav pořadí, sekce a štítky; **Similar collections** ukáže, jestli
  podobná kolekce už neexistuje.

### Reports – nahlášené seznamy

Seznamy, které uživatelé nahlásili. **Hide list** seznam skryje (vidí ho jen autor, dokud ho neopraví),
**Dismiss reports** nahlášení zahodí, **Show again** skrytý seznam vrátí.

### Activity – deník správců

Kdo kdy co změnil: úpravy a mazání kolekcí, přijaté a zamítnuté požadavky, filmy ze sérií, uživatelé,
odznaky, zakázaná slova, překlady, nahlášené seznamy. Nejnovější nahoře, hledání a filtr podle správce.
Skripty (balíčky, import) se sem nezapisují – ty jsou v historii gitu.

---

## Jak na to – časté úkoly

**Přidat film do existující kolekce** – Collections → Edit → Add a movie → najít → Add → šipkami na
místo → Save. (Nový díl série nabídne i panel *New movies in your series*.)

**Nová kolekce režiséra / herce** – Builder → Person → najít → Role: Directing (Acting) → Min. votes
např. 200 → Sections: By decade → zkontrolovat zaškrtnuté → typ Directors → Create collection.

**Nová kolekce dvojice** (Bud Spencer & Terence Hill) – Builder → Two people → obě osoby → Sections:
Together / each person → Create.

**Nová kolekce studia** – Builder → Studio → najít firmu → Order: Most votes → typ Studios → Create.

**Kolekce na téma** – Builder → Keyword → najít slovo → vybrat filmy ručně (klíčová slova jsou hodně
široká) → typ Genre picks → Create.

**Špatný film v kolekci** (stejný název, jiný film) – Edit → Remove u špatného → Add a movie → najít ten
správný (pozor na rok) → Save.

**Překlad nové kolekce** – Translations → najít kolekci → vyplnit názvy a popisy → Save (nebo Check with
TMDB → Use).

---

## Co v admin panelu nejde (dělá vlastník)

- velké **balíčky kolekcí** (`supabase/packs/*.json`, `./scripts/add-pack.sh`) a **import** (`./scripts/import.sh`);
- **přeložené názvy filmů** (`./scripts/translate.sh` – běží sám po importu);
- **migrace databáze**, nasazení Edge Functions a nové verze webu;
- role správce a vlastníka.

Když narazíš na něco, co by šlo líp přes balíček (desítky filmů, oprava ID filmu v TMDB), napiš vlastníkovi
seznam: název kolekce, film, rok a ideálně odkaz na film v TMDB (`themoviedb.org/movie/…`).

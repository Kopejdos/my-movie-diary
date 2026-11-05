# Zprovoznění projektu

Návod, jak projekt rozjet od nuly (nový počítač, nový Supabase projekt…).
Doplňuje se s každou fází.

## 1. Git a repozitář

Identita pro commity (jednou na počítač):
```bash
git config --global user.name "Adam Kopecký"
git config --global user.email "166435910+Kopejdos@users.noreply.github.com"
```

Klonování (cesta bez diakritiky a mezer):
```bash
cd /c/Users/adisk/Documents/MyProjects
git clone https://github.com/Kopejdos/my-movie-diary.git
cd my-movie-diary
```

Běžná práce:
```bash
git pull                         # stáhnout změny (na začátku práce)
git status                       # co se změnilo
git add .                        # připravit všechny změny
git commit -m "Popis změny"      # uložit změny lokálně
git push                         # nahrát na GitHub
```

Označení dokončené fáze:
```bash
git tag faze-1
git push --tags
```

## 2. GitHub Pages

1. Repozitář → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Po každém pushi, který změní `web/`, se spustí workflow **Deploy to GitHub Pages** (záložka **Actions**).
3. Ruční spuštění: **Actions → Deploy to GitHub Pages → Run workflow**.
4. Web: https://kopejdos.github.io/my-movie-diary/

## 3. Supabase

Nový projekt (supabase.com, přihlášení přes GitHub):
- plán **Free**, region **Europe**
- heslo k databázi vygenerovat a uložit do správce hesel
- Security: **Enable Data API** ✅, **Automatically expose new tables** ❌, **Enable automatic RLS** ✅

Po vytvoření: **Project Settings → API Keys** – Project URL a publishable key patří do `web/js/config.js`.
Secret key se nikam nekopíruje.

Struktura databáze: každý SQL skript z `supabase/migrations/` se spustí **jednou**, postupně
podle čísla v názvu: **SQL Editor → New query → vložit obsah → Run**. Propojení Supabase
s GitHubem (automatické migrace) se nezapíná.

## 4. TMDB

1. Účet na themoviedb.org → **Settings → API → Create** → Developer, personal use, type of use: Website.
2. **API Read Access Token** (dlouhý, začíná `eyJ`) uložit v Supabase:
   **Edge Functions → Secrets** → název `TMDB_READ_TOKEN`.
3. Token nikdy nepatří do repozitáře ani do kódu webu.

## 5. Edge Function a import filmů

1. Správcovský klíč: `openssl rand -hex 24` (Git Bash) → Supabase **Edge Functions → Secrets**
   → `MMD_ADMIN_KEY`. Uložit i do správce hesel.
2. **Edge Functions → Deploy a new function → Via Editor**, název `tmdb`, obsah
   `supabase/functions/tmdb/index.ts` → **Deploy**.
3. V nastavení funkce **vypnout Verify JWT**.
4. Import (ve složce repozitáře):
   ```bash
   curl -X POST "https://vvnexfdnfvwbwluazwoo.supabase.co/functions/v1/tmdb?action=import" \
     -H "apikey: sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM" \
     -H "x-admin-key: <MMD_ADMIN_KEY>" \
     -H "Content-Type: application/json" \
     --data-binary @supabase/seed/universes.json \
     -o import-report.json
   cat import-report.json
   ```
   Jen jedno univerzum: na konec adresy přidat `&only=mcu`.
5. V reportu zkontrolovat `warnings` (jiný název / rok) a `notFound`. Chybnou shodu opravit
   doplněním `"tmdb": <id>` k filmu v seedu a import pustit znovu.

Po změně kódu funkce: v dashboardu otevřít funkci → Code → vložit nový obsah → Deploy.

## 6. Přihlašování (Supabase → Authentication)

1. **URL Configuration:** Site URL `https://kopejdos.github.io/my-movie-diary/`, stejná adresa i v Redirect URLs.
2. **Sign In / Providers → Email:** vypnout **Confirm email**.
3. **Přihlášení nickem:** Edge Function `login` (Deploy a new function → Via Editor, obsah
   `supabase/functions/login/index.ts`) a u ní **vypnout Verify JWT**.
4. **Google:**
   1. Google Cloud Console → nový projekt → **Google Auth Platform → Get started**
      (app name, support e-mail, Audience: External).
   2. **Clients → Create client:** Web application; origin `https://kopejdos.github.io`;
      redirect `https://vvnexfdnfvwbwluazwoo.supabase.co/auth/v1/callback` (pozor na mezery při kopírování).
      Client secret se zobrazí jen jednou – hned uložit.
   3. **Branding:** home page `https://kopejdos.github.io/my-movie-diary/`,
      privacy policy `https://kopejdos.github.io/my-movie-diary/privacy.html`; logo nenahrávat.
   4. **Audience → Publish app.**
   5. Supabase → **Sign In / Providers → Google:** zapnout, vložit Client ID a Client secret.

## 7. Admin účet

1. Supabase → **Authentication → Users → Add user → Create new user**: e-mail
   `adiskop987+admin@gmail.com`, heslo ze správce hesel, **Auto Confirm User**.
2. SQL Editor:
   ```sql
   update public.profiles
   set username = 'admin', is_admin = true
   where id = (select id from auth.users where email = 'adiskop987+admin@gmail.com');
   ```

## 8. Admin panel

1. Migrace `20261105050000_admin_panel.sql` (pravidla pro správce).
2. Edge Function `admin` (Deploy a new function → Via Editor, obsah `supabase/functions/admin/index.ts`)
   a u ní **vypnout Verify JWT** – funkce si ověřuje přihlášení a správce sama.
3. Na webu se správci ukáže v hlavičce odkaz **Admin**.

**Pozor:** plný import ze seedu přepíše změny z admin panelu u univerz, která jsou v `universes.json`
(a smaže z nich filmy, které v seedu nejsou). Nová univerza a filmy přidávat přes admin panel.

## 9. Keep-alive

GitHub Action `keep-alive.yml` volá každé 3 dny databázovou funkci `ping()`.
Ruční spuštění: **Actions → Keep Supabase awake → Run workflow**; výsledek je vidět
v tabulce `heartbeat`.

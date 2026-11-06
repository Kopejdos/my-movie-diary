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
4. Import (Git Bash, ve složce repozitáře) – skript se zeptá na klíč (zadává se skrytě):
   ```bash
   ./scripts/import.sh mad-max              # jedna kolekce
   ./scripts/import.sh saw scream halloween # víc kolekcí
   ./scripts/import.sh --all                # všechny – přepíše úpravy z admin panelu, chce potvrzení
   ```
   Reporty se uloží do `import-reports/<slug>.json`.
5. V reportu zkontrolovat `warnings` (jiný název / rok) a `notFound`. Chystané filmy (V3.3) jsou v `comingSoon`,
   zrušené v `skipped`. V den premiéry se chystaný film přepne na běžný sám (V3.3.1); import po premiéře jen
   doplní délku a plakát z TMDB.
   Chybnou shodu opravit
   doplněním `"tmdb": <id>` k filmu v seedu a import pustit znovu, nebo ji opravit v admin panelu.

**Nová verze funkce `tmdb` musí být nasazená před importem**, jinak import poběží se starou verzí.

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
      privacy policy `https://kopejdos.github.io/my-movie-diary/privacy.html`,
      terms of service `https://kopejdos.github.io/my-movie-diary/terms.html` (od V2.2); logo nenahrávat.
   4. **Audience → Publish app.**
   5. Supabase → **Sign In / Providers → Google:** zapnout, vložit Client ID a Client secret.

### 6b. E-maily – vlastní SMTP a šablony (V2.4)

**Odesílání přes Gmail aplikace** (`mymoviediary.support@gmail.com`):
1. Google účet aplikace → **Zabezpečení → Dvoufázové ověření** zapnout (telefon).
2. myaccount.google.com/apppasswords → název `Supabase` → **Vytvořit** → 16 znaků uložit do správce hesel
   (do chatu ani do repozitáře nepatří). Google je ukáže jen jednou.
3. Supabase → **Authentication → Emails → SMTP Settings**: sender `mymoviediary.support@gmail.com`, name
   `My Movie Diary`, host `smtp.gmail.com`, port `465`, username = ta adresa, password = heslo aplikace **bez mezer**
   → **Enable custom SMTP** → Save. Limit odesílání se tím zvedne na 30 mailů / hod (Rate Limits).
4. **Sign In / Providers → Email:** zapnout **Confirm email**.
5. Upozornění „designed for sending personal email“ u hostu je v pořádku – pro malý počet uživatelů stačí;
   při problémech s doručováním vlastní doména + Resend.

**Šablony** (`supabase/templates/`) → Supabase → **Authentication → Emails → Templates**:

| Šablona v Supabase | Soubor | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `Confirm your email – My Movie Diary` |
| Reset password | `reset-password.html` | `Reset your password – My Movie Diary` |
| Change email address | `change-email.html` | `Confirm your new email – My Movie Diary` |

U každé: Subject přepsat, do **Message body** vložit celý obsah souboru → Save. Proměnné `{{ .ConfirmationURL }}`,
`{{ .Data.username }}`, `{{ .Email }}`, `{{ .NewEmail }}` doplní Supabase.

**Hesla (V2.5):**
- **Sign In / Providers → Email:** *Minimum password length* `8`, *Password requirements* **Letters and digits**
  (stejné pravidlo kontroluje web).
- **URL Configuration → Redirect URLs:** přidat `https://kopejdos.github.io/my-movie-diary/**` – odkaz pro obnovu
  hesla vede na `…/?reset=1` (bez téhle položky obnova funguje taky, jen v jiném prohlížeči by se ukázala obecnější hláška).

### 6c. CAPTCHA – Cloudflare Turnstile (V2.6)

**Pořadí je důležité** – kdyby se CAPTCHA zapnula v Supabase dřív, než web posílá tokeny, nikdo se nepřihlásí.

1. **Cloudflare:** účet zdarma na dash.cloudflare.com → **Turnstile → Add widget**: název `My Movie Diary`,
   hostname `kopejdos.github.io` (pro testy na počítači případně i `localhost`), Widget mode **Managed**,
   pre-clearance **No** → Create. Zobrazí se **Site key** (veřejný) a **Secret key** (tajný – jen do správce hesel).
2. **Web:** site key do `web/js/config.js` → `TURNSTILE_SITE_KEY = "…"`.
3. **Funkce `login`:** Supabase → **Edge Functions → Secrets** → `TURNSTILE_SECRET_KEY` = secret key;
   pak nasadit novou verzi funkce `login` (Verify JWT zůstává vypnuté).
4. **Push** webu, počkat na nasazení a vyzkoušet přihlášení – CAPTCHA už běží, Supabase ji zatím nevyžaduje.
5. **Supabase → Authentication → Attack Protection** (dříve *Bot and Abuse Protection*) → **Enable CAPTCHA
   protection** → provider **Turnstile by Cloudflare** → Secret key → Save.
6. **Test:** přihlášení e-mailem i nickem, registrace, Forgot password, změna hesla v profilu.

Vypnutí v nouzi: v Supabase vypnout *Enable CAPTCHA protection* (web pak tokeny posílá zbytečně, nevadí).

**Test:** registrace v anonymním okně s `adiskop987+test@gmail.com` → mail od My Movie Diary (zkontrolovat i spam)
→ odkaz → přihlášení → zkušební účet smazat v Admin → Users.

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

4. **Smazání vlastního účtu (V2.3):** Edge Function `account` (Deploy a new function → Via Editor, obsah
   `supabase/functions/account/index.ts`) a u ní **vypnout Verify JWT** – ověřuje si přihlášení sama.

**Pozor:** plný import ze seedu přepíše změny z admin panelu u univerz, která jsou v `universes.json`
(a smaže z nich filmy, které v seedu nejsou). Nová univerza a filmy přidávat přes admin panel.

## 9. Aktualizace knihovny Supabase (web/vendor)

Web používá odlehčené `supabase-js` jako jeden předpřipravený soubor – jen přihlášení a dotazy do
databáze, bez Realtime / Storage / Functions (V2.7). Nová verze (jednou za čas, není nutné):
```bash
mkdir /tmp/sb && cd /tmp/sb && npm init -y && npm install @supabase/supabase-js esbuild
node <cesta k repozitáři>/scripts/vendor/build.mjs
```
Skript vytvoří `web/vendor/supabase-lite-<verze>.min.js`. Starý soubor smazat a název upravit
v `web/js/supabase.js`, `web/index.html` (modulepreload) a `web/sw.js` (seznam SHELL + zvýšit `VERSION`).

## 9b. Minifikace při nasazení (V2.7)

Workflow `Deploy to GitHub Pages` před nahráním zmenší JS a CSS (esbuild). Nic se nenastavuje; když by krok
selhal (např. chyba syntaxe v JS), nasazení se zastaví a stará verze webu zůstane online – chyba je vidět
v záložce Actions. Lokálně se web dál spouští přímo ze zdrojáků.

**Nasadit znovu bez změny ve `web/`** (např. když GitHub Pages hlásí „Deployment failed, try again later“):
**Actions → Deploy to GitHub Pages → Run workflow → main**. Prázdný commit nestačí – workflow se při pushi spouští
jen tehdy, když se změní složka `web/`. *Re-run* starého běhu používá stejný zabalený web.

## 10. Keep-alive

GitHub Action `keep-alive.yml` volá každé 3 dny databázovou funkci `ping()`.
Ruční spuštění: **Actions → Keep Supabase awake → Run workflow**; výsledek je vidět
v tabulce `heartbeat`.

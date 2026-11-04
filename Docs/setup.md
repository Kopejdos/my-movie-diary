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

Struktura databáze: SQL skripty z `supabase/migrations/` se spouštějí postupně podle čísla
v **SQL Editoru** (fáze 1 doplní přesný postup).

## 4. TMDB

1. Účet na themoviedb.org → **Settings → API → Create** → Developer, personal use, type of use: Website.
2. **API Read Access Token** (dlouhý, začíná `eyJ`) uložit v Supabase:
   **Edge Functions → Secrets** → název `TMDB_READ_TOKEN`.
3. Token nikdy nepatří do repozitáře ani do kódu webu.

## 5. Keep-alive

Doplní se ve fázi 1 (GitHub Action `keep-alive.yml`).

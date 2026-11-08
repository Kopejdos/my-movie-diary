#!/usr/bin/env bash
# =====================================================================
# My Movie Diary – doplnění seedu o filmy přidané z požadavků (V3.5.2)
#
# Použití (Git Bash, ve složce repozitáře):
#   ./scripts/sync-seed.sh
#
# Pošle supabase/seed/universes.json funkci tmdb (action=seed-sync) a uloží,
# co vrátí: soubor doplněný o filmy, které správce přijal z požadavků do kolekcí,
# a o celé kolekce vytvořené ze série TMDB. Zbytek souboru se nemění.
# Pak stačí změnu zkontrolovat (git diff) a commitnout.
#
# Spouští se i sám na začátku ./scripts/import.sh – ručně ho stačí pustit,
# když chceš seed doplnit bez importu.
# Klíč MMD_ADMIN_KEY se zadává skrytě (nebo ho předá import.sh v proměnné MMD_KEY).
# =====================================================================

set -euo pipefail

SUPABASE_URL="https://vvnexfdnfvwbwluazwoo.supabase.co"
PUBLISHABLE_KEY="sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM"
SEED="supabase/seed/universes.json"

cd "$(dirname "$0")/.."     # skript funguje odkudkoli – pracuje vždy z kořene repozitáře

KEY="${MMD_KEY:-}"
if [ -z "$KEY" ]; then
    read -r -s -p "Admin key: " KEY
    echo
fi

body=$(mktemp)
headers=$(mktemp)
trap 'rm -f "$body" "$headers"' EXIT

status=$(curl -s -X POST "$SUPABASE_URL/functions/v1/tmdb?action=seed-sync" \
    -H "apikey: $PUBLISHABLE_KEY" \
    -H "x-admin-key: $KEY" \
    -H "Content-Type: text/plain; charset=utf-8" \
    --data-binary @"$SEED" \
    -D "$headers" -o "$body" -w "%{http_code}")

if [ "$status" != "200" ] || [ ! -s "$body" ]; then
    echo "✗ sync-seed – CHYBA (HTTP $status): $(cat "$body")"
    exit 1
fi

# Počty z hlaviček odpovědi (X-Seed-Films / X-Seed-Collections)
films=$(grep -i '^x-seed-films:' "$headers" | tr -d '\r' | awk '{print $2}')
collections=$(grep -i '^x-seed-collections:' "$headers" | tr -d '\r' | awk '{print $2}')
films="${films:-0}"
collections="${collections:-0}"

if [ "$films" = "0" ] && [ "$collections" = "0" ]; then
    echo "✓ Seed je aktuální – žádné nové filmy z požadavků."
    exit 0
fi

cat "$body" > "$SEED"
echo "✓ Seed doplněn: filmy do kolekcí: $films, nové kolekce: $collections"
echo "  Zkontroluj změny (git diff $SEED) a commitni je."

#!/usr/bin/env bash
# =====================================================================
# My Movie Diary – propsání změn z aplikace do seedu (V3.5.2, V3.5.2.1)
#
# Použití (Git Bash, ve složce repozitáře):
#   ./scripts/sync-seed.sh
#
# Pošle supabase/seed/universes.json funkci tmdb (action=seed-sync) a uloží,
# co vrátí: soubor se všemi změnami z aplikace – filmy přijaté z požadavků, kolekce
# vytvořené ze série TMDB a úpravy v admin panelu (přidání, úprava, přesun a odebrání
# filmu, úprava / nová / smazaná kolekce). Mění se jen dotčené kolekce.
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

# Počty z hlaviček odpovědi (X-Seed-Changed / X-Seed-Added / X-Seed-Removed / X-Seed-Slugs)
header() { grep -i "^$1:" "$headers" | tr -d '\r' | cut -d' ' -f2- ; }
changed=$(header x-seed-changed); changed="${changed:-0}"
added=$(header x-seed-added); added="${added:-0}"
removed=$(header x-seed-removed); removed="${removed:-0}"
slugs=$(header x-seed-slugs)

if [ "$changed" = "0" ] && [ "$added" = "0" ] && [ "$removed" = "0" ]; then
    echo "✓ Seed je aktuální – v aplikaci se nic nezměnilo."
    exit 0
fi

cat "$body" > "$SEED"
echo "✓ Seed doplněn: upravené kolekce: $changed, nové: $added, smazané: $removed"
echo "  ($slugs)"
echo "  Zkontroluj změny (git diff $SEED) a commitni je."

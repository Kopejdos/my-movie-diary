#!/usr/bin/env bash
# =====================================================================
# My Movie Diary – import kolekcí ze seedu do Supabase (Edge Function tmdb)
#
# Použití (Git Bash, ve složce repozitáře):
#   ./scripts/import.sh mad-max                 jedna kolekce
#   ./scripts/import.sh saw scream halloween    víc kolekcí
#   ./scripts/import.sh --all                   VŠECHNY kolekce (přepíše úpravy z admin panelu!)
#
# Klíč MMD_ADMIN_KEY se zadává skrytě (nic se nezobrazí, ani hvězdičky).
# Reporty se ukládají do složky import-reports/ (Git ji ignoruje).
# =====================================================================

set -euo pipefail

SUPABASE_URL="https://vvnexfdnfvwbwluazwoo.supabase.co"
PUBLISHABLE_KEY="sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM"
SEED="supabase/seed/universes.json"
REPORTS="import-reports"

cd "$(dirname "$0")/.."     # skript funguje odkudkoli – pracuje vždy z kořene repozitáře

if [ $# -eq 0 ]; then
    echo "Použití: ./scripts/import.sh <slug> [<slug>…]   nebo   ./scripts/import.sh --all"
    echo "Slugy kolekcí najdeš v $SEED (\"slug\": …)."
    exit 1
fi

if [ "$1" = "--all" ]; then
    echo "POZOR: plný import přepíše úpravy z admin panelu u všech kolekcí ze seedu."
    read -r -p "Opravdu pokračovat? (ano/ne) " answer
    [ "$answer" = "ano" ] || { echo "Zrušeno."; exit 0; }
    targets=("")            # prázdný = bez &only= → všechno
else
    targets=("$@")
fi

read -r -s -p "Admin key: " KEY
echo
mkdir -p "$REPORTS"

for slug in "${targets[@]}"; do
    name="${slug:-all}"
    url="$SUPABASE_URL/functions/v1/tmdb?action=import"
    [ -n "$slug" ] && url="$url&only=$slug"

    curl -s -X POST "$url" \
        -H "apikey: $PUBLISHABLE_KEY" \
        -H "x-admin-key: $KEY" \
        -H "Content-Type: application/json" \
        --data-binary @"$SEED" \
        -o "$REPORTS/$name.json"

    # Krátké shrnutí z reportu: kolik filmů, z toho Coming soon (V3.3), varování
    summary=$(sed -n 's/.*"imported": *\([0-9]*\).*/\1/p' "$REPORTS/$name.json" | head -1)
    if grep -q '"error"' "$REPORTS/$name.json"; then
        echo "✗ $name – CHYBA: $(cat "$REPORTS/$name.json")"
    else
        warnings=$(grep -c '→' "$REPORTS/$name.json" || true)
        soon=$(awk '/"comingSoon": \[$/{f=1; next} f && /\]/{f=0} f{c++} END{print c+0}' "$REPORTS/$name.json")
        echo "✓ $name – ${summary:-?} filmů (z toho Coming soon: $soon), varování: $warnings  ($REPORTS/$name.json)"
    fi
done

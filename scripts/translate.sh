#!/usr/bin/env bash
# =====================================================================
# My Movie Diary – přeložené názvy filmů z TMDB (V4.2.2)
#
# Použití (Git Bash, ve složce repozitáře):
#   ./scripts/translate.sh
#
# Volá funkci tmdb (action=translate) po dávkách, dokud nejsou přeložené všechny filmy
# (čeština, němčina, španělština, ukrajinština). Poprvé (po migraci V4.2.2) projde celý
# katalog – pár minut; potom už jen nové filmy, a ty většinou přeloží rovnou import
# nebo admin panel. Spouští se i sám na konci ./scripts/import.sh.
# Klíč MMD_ADMIN_KEY se zadává skrytě (nebo ho předá import.sh v proměnné MMD_KEY).
# =====================================================================

set -euo pipefail

SUPABASE_URL="https://vvnexfdnfvwbwluazwoo.supabase.co"
PUBLISHABLE_KEY="sb_publishable_ECIGAmDLE3Fj8FNTnx0mgw_P1dEBspM"

cd "$(dirname "$0")/.."     # skript funguje odkudkoli – pracuje vždy z kořene repozitáře

KEY="${MMD_KEY:-}"
if [ -z "$KEY" ]; then
    read -r -s -p "Admin key: " KEY
    echo
fi

total=0
while true; do
    response=$(curl -s -X POST "$SUPABASE_URL/functions/v1/tmdb?action=translate&limit=150" \
        -H "apikey: $PUBLISHABLE_KEY" \
        -H "x-admin-key: $KEY")

    if ! echo "$response" | grep -q '"ok": true'; then
        echo "✗ Překlady – CHYBA: $response"
        exit 1
    fi
    translated=$(echo "$response" | sed -n 's/.*"translated": *\([0-9]*\).*/\1/p' | head -1)
    remaining=$(echo "$response" | sed -n 's/.*"remaining": *\([0-9]*\).*/\1/p' | head -1)
    total=$((total + ${translated:-0}))
    echo "  přeloženo $total filmů, zbývá ${remaining:-?}"

    # Hotovo – nebo se v dávce nepovedlo nic (TMDB nedostupné), ať se skript netočí dokola
    if [ "${remaining:-0}" -eq 0 ] || [ "${translated:-0}" -eq 0 ]; then
        if echo "$response" | grep -q '"failed": \[$'; then
            echo "  Některé filmy se nepovedlo přeložit (zkusí se příště):"
            echo "$response" | awk '/"failed": \[$/{f=1; next} f && /^ *\]/{f=0} f{print "   " $0}'
        fi
        break
    fi
done
echo "✓ Překlady názvů filmů hotové."

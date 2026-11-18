#!/usr/bin/env bash
# =====================================================================
# My Movie Diary – balíček kolekcí do seedu a do aplikace (V4.3.2)
#
# Použití (Git Bash, ve složce repozitáře):
#   ./scripts/add-pack.sh supabase/packs/v4.3.2-westerns.json
#
# 1. sync-seed – nejdřív se do seedu propíšou změny z aplikace (ať balíček nic nepřepíše),
# 2. add-pack.mjs – nové kolekce z balíčku na konec seedu, existujícím doplní kategorie / popis,
# 3. import.sh – naimportuje kolekce z balíčku (a doplní překlady názvů).
# Jde spustit opakovaně (podruhé jen znovu naimportuje). Pak seed commitni.
# Klíč MMD_ADMIN_KEY se zadává jen jednou (skrytě).
# =====================================================================

set -euo pipefail
cd "$(dirname "$0")/.."     # skript funguje odkudkoli – pracuje vždy z kořene repozitáře

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
    echo "Použití: ./scripts/add-pack.sh supabase/packs/<balíček>.json"
    exit 1
fi

read -r -s -p "Admin key: " KEY
echo
export MMD_KEY="$KEY"

bash scripts/sync-seed.sh
output=$(node scripts/add-pack.mjs "$1")
echo "$output" | sed '$d'                 # souhrn (bez posledního řádku se slugy)
slugs=$(echo "$output" | tail -n 1)

# shellcheck disable=SC2086              # slugy se mají rozdělit na jednotlivé argumenty
bash scripts/import.sh $slugs

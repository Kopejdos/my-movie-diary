-- =====================================================================
-- My Movie Diary – barvy univerz a backdropy filmů (fáze 4 – redesign)
-- Spouští se jednou v Supabase → SQL Editor.
-- Potom je potřeba znovu pustit import (doplní barvy a backdropy).
-- =====================================================================

-- Barva univerza (#rrggbb) – záře pozadí, okraje karet, tlačítka
alter table public.universes
    add column color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

-- Širokoúhlý záběr z filmu (TMDB backdrop) – banner v detailu univerza
alter table public.films
    add column backdrop_path text;

notify pgrst, 'reload schema';

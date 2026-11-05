-- =====================================================================
-- My Movie Diary – cesty / paths (fáze 16 – V1.8)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Cesta je další typ kolekce: kurátorská trasa krok za krokem (pořadí =
-- release_order). Každý krok může mít krátkou poznámku, proč ho vidět.
-- Postup, dokončení i XP fungují stejně jako u ostatních kolekcí.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nový typ kolekce „path“
-- ---------------------------------------------------------------------
alter table public.universes drop constraint if exists universes_kind_check;
alter table public.universes
    add constraint universes_kind_check
    check (kind in ('series', 'studio', 'genre', 'path'));

-- ---------------------------------------------------------------------
-- 2. Poznámka ke kroku (u ostatních typů zůstává prázdná)
-- ---------------------------------------------------------------------
alter table public.universe_items
    add column note text
    check (note is null or char_length(note) <= 300);

comment on column public.universe_items.note is
    'Krátká poznámka ke kroku cesty – proč film vidět (zobrazuje se u kind = path).';

-- Práva: select (anon, authenticated) a update (správce přes RLS) jsou na
-- celé tabulce, takže se vztahují i na nový sloupec – žádný nový grant.

-- PostgREST (API) si načte novou strukturu
notify pgrst, 'reload schema';

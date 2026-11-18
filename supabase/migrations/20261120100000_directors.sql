-- =====================================================================
-- My Movie Diary – typ kolekce „Director“ (V4.3.5)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- Kolekce režiséra (Nolan, Tarantino, Kubrick…) – na přehledu vlastní záložka Directors,
-- filmy po desetiletích, na kartě odznak 🎬 Director. Postup, dokončení a XP fungují jako
-- u ostatních kolekcí; dokončené kolekce režisérů počítá achievement Auteur (jen web).
-- Sergio Leone se z typu „series“ přepne na „director“ balíčkem v4.3.5 (seed → import).
-- =====================================================================

alter table public.universes drop constraint if exists universes_kind_check;
alter table public.universes
    add constraint universes_kind_check
    check (kind in ('series', 'studio', 'genre', 'path', 'director'));

comment on column public.universes.kind is
    'Typ kolekce: series (série), studio, genre (žánrový výběr), path (cesta), director (režisér, V4.3.5)';

notify pgrst, 'reload schema';

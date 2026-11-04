-- =====================================================================
-- My Movie Diary – správce a úprava profilu (fáze 2b)
-- Spouští se jednou v Supabase → SQL Editor.
-- =====================================================================

-- Příznak správce (budoucí správcovské funkce na webu, např. import filmů)
alter table public.profiles
    add column is_admin boolean not null default false;

-- Uživatel smí ve svém profilu měnit jen nickname – ne is_admin.
-- (Pravidlo RLS "Users can update own profile" omezuje řádek,
--  oprávnění na sloupec omezuje, co v něm smí změnit.)
revoke update on public.profiles from authenticated;
grant  update (username) on public.profiles to authenticated;

-- Ať Data API hned vidí nové sloupce a funkce
notify pgrst, 'reload schema';

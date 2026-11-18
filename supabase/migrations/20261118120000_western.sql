-- =====================================================================
-- My Movie Diary – kategorie Western 🤠 (V4.3.2)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- Nová kategorie pro westernové kolekce z balíčku supabase/packs/v4.3.2-westerns.json
-- (Bud Spencer & Terence Hill, Sergio Leone, Django, Sedm statečných, výběry).
-- Winnetou dostane kategorii Western importem (balíček ji doplní do seedu).
-- =====================================================================

insert into public.categories (slug, name, color, sort_order) values
    ('western', 'Western', '#d97706', 49)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

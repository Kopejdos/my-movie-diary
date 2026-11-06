-- =====================================================================
-- My Movie Diary – kategorie Drama (fáze 32 – V3.1.5)
-- Spouští se jednou v Supabase → SQL Editor – PŘED importem nových sérií
-- (Rocky & Creed, The Godfather).
-- =====================================================================

insert into public.categories (slug, name, color, sort_order) values
    ('drama', 'Drama', '#f472b6', 46)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

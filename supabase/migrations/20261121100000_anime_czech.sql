-- =====================================================================
-- My Movie Diary – kategorie Anime 🎌 a Czech & Slovak 🇨🇿 (V4.3.7)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- Nové kategorie pro kolekce z balíčku supabase/packs/v4.3.7-anime-czech.json
-- (Shinkai, Hosoda, Kon, Evangelion, Pokémon, Dragon Ball…; Slunce, seno…, Básníci,
-- České pohádky…). Studio Ghibli dostane kategorii Anime importem (balíček ji doplní do seedu).
-- Kategorie musí existovat dřív, než se balíček naimportuje – import kolekci s neznámou
-- kategorií odmítne.
-- =====================================================================

insert into public.categories (slug, name, color, sort_order) values
    ('anime',        'Anime',          '#f43f5e', 32),
    ('czech-slovak', 'Czech & Slovak', '#2563eb', 52)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

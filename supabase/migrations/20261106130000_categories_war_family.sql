-- =====================================================================
-- My Movie Diary – kategorie War a Family (fáze 31 – V3.1.4)
-- Spouští se jednou v Supabase → SQL Editor – PŘED importem nových výběrů
-- (import kategorie jen přiřazuje, nezakládá; neznámá kategorie = chyba importu).
-- =====================================================================

insert into public.categories (slug, name, color, sort_order) values
    ('family', 'Family', '#fb7185', 35),
    ('war',    'War',    '#84cc16', 48)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';

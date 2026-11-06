-- =====================================================================
-- My Movie Diary – nové kategorie pro dvouvrstvý filtr (fáze 29 – V3.1.2)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- • „Sci-fi & Fantasy“ se dělí na Sci-fi a Fantasy.
-- • Nové kategorie Comedy a Crime & Thriller (další přibydou s novými žánrovými výběry).
-- • Přiřazení kolekcí je stejné jako v seedu (supabase/seed/universes.json),
--   takže další import nic nezmění.
-- =====================================================================

-- 1. Sci-fi & Fantasy → Sci-fi (stávající přiřazení zůstanou, fantasy kolekce se přesunou níž)
update public.categories
   set slug = 'scifi', name = 'Sci-fi', color = '#38bdf8'
 where slug = 'scifi-fantasy';

-- 2. Nové kategorie a pořadí všech
insert into public.categories (slug, name, color, sort_order) values
    ('fantasy',        'Fantasy',          '#8b5cf6', 25),
    ('comedy',         'Comedy',           '#facc15', 45),
    ('crime-thriller', 'Crime & Thriller', '#94a3b8', 47)
on conflict (slug) do nothing;

update public.categories set sort_order = 10 where slug = 'superhero';
update public.categories set sort_order = 20 where slug = 'scifi';
update public.categories set sort_order = 30 where slug = 'animation';
update public.categories set sort_order = 40 where slug = 'action-adventure';
update public.categories set sort_order = 50 where slug = 'horror';

-- 3. Fantasy kolekce už nejsou Sci-fi
delete from public.universe_categories uc
 using public.universes u, public.categories c
 where uc.universe_id = u.id and uc.category_id = c.id
   and c.slug = 'scifi'
   and u.slug in ('wizarding-world', 'middle-earth', 'path-fantasy-starter');

-- 4. Nová přiřazení
insert into public.universe_categories (universe_id, category_id)
select u.id, c.id
from (values
    ('wizarding-world', 'fantasy'), ('middle-earth', 'fantasy'), ('path-fantasy-starter', 'fantasy'),
    ('pirates-of-the-caribbean', 'fantasy'), ('studio-ghibli', 'fantasy'),
    ('asterix-and-obelix', 'comedy'), ('horror-comedy', 'comedy'),
    ('fast-and-furious', 'crime-thriller'), ('horror-psychological', 'crime-thriller'),
    ('horror-giallo', 'crime-thriller')
) as map (universe_slug, category_slug)
join public.universes  u on u.slug = map.universe_slug
join public.categories c on c.slug = map.category_slug
on conflict do nothing;

notify pgrst, 'reload schema';

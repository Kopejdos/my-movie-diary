-- =====================================================================
-- My Movie Diary – kategorie a typy kolekcí (fáze 10 – V1.2)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Kategorie = sekce / filtr na přehledu (Superhero, Animation, Horror…).
-- Kolekce může být ve více kategoriích (Alien = Sci-fi i Horror).
-- Typ kolekce: série (MCU), studio (Pixar), žánrový výběr (Slasher).
-- Interní název kolekce zůstává „universe“ (viz docs/decisions.md, V1.1.1).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Typ kolekce
-- ---------------------------------------------------------------------
alter table public.universes
    add column kind text not null default 'series'
    check (kind in ('series', 'studio', 'genre'));

update public.universes set kind = 'studio'
where slug in ('studio-ghibli', 'disney', 'pixar', 'dreamworks');

-- ---------------------------------------------------------------------
-- 2. Kategorie
-- ---------------------------------------------------------------------
create table public.categories (
    id          bigint generated always as identity primary key,
    slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
    name        text not null,
    color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
    sort_order  integer not null default 0
);

create table public.universe_categories (
    universe_id  bigint not null references public.universes (id)  on delete cascade,
    category_id  bigint not null references public.categories (id) on delete cascade,
    primary key (universe_id, category_id)
);

create index universe_categories_category_idx on public.universe_categories (category_id);

-- ---------------------------------------------------------------------
-- 3. Pravidla přístupu – číst smí kdokoli, měnit jen správce
-- ---------------------------------------------------------------------
alter table public.categories          enable row level security;
alter table public.universe_categories enable row level security;

create policy "Categories are readable by everyone"
    on public.categories for select to anon, authenticated using (true);
create policy "Admins can create categories"
    on public.categories for insert to authenticated with check (public.is_admin());
create policy "Admins can update categories"
    on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete categories"
    on public.categories for delete to authenticated using (public.is_admin());

create policy "Collection categories are readable by everyone"
    on public.universe_categories for select to anon, authenticated using (true);
create policy "Admins can assign categories"
    on public.universe_categories for insert to authenticated with check (public.is_admin());
create policy "Admins can unassign categories"
    on public.universe_categories for delete to authenticated using (public.is_admin());

grant select on public.categories, public.universe_categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, delete on public.universe_categories to authenticated;
grant all on public.categories, public.universe_categories to service_role;

-- ---------------------------------------------------------------------
-- 4. Výchozí kategorie a přiřazení stávajících kolekcí
-- ---------------------------------------------------------------------
insert into public.categories (slug, name, color, sort_order) values
    ('superhero',        'Superhero',          '#e23636', 10),
    ('scifi-fantasy',    'Sci-fi & Fantasy',   '#8b5cf6', 20),
    ('animation',        'Animation',          '#34d399', 30),
    ('action-adventure', 'Action & Adventure', '#f97316', 40),
    ('horror',           'Horror',             '#b91c1c', 50);

insert into public.universe_categories (universe_id, category_id)
select u.id, c.id
from (values
    ('mcu', 'superhero'), ('x-men', 'superhero'), ('spider-man', 'superhero'),
    ('dceu', 'superhero'), ('dcu', 'superhero'), ('batman', 'superhero'),
    ('star-wars', 'scifi-fantasy'), ('wizarding-world', 'scifi-fantasy'),
    ('middle-earth', 'scifi-fantasy'), ('avatar', 'scifi-fantasy'),
    ('jurassic-park', 'scifi-fantasy'), ('alien', 'scifi-fantasy'),
    ('maze-runner', 'scifi-fantasy'),
    ('studio-ghibli', 'animation'), ('disney', 'animation'), ('pixar', 'animation'),
    ('dreamworks', 'animation'), ('shrek', 'animation'), ('asterix-and-obelix', 'animation'),
    ('fast-and-furious', 'action-adventure'), ('mad-max', 'action-adventure'),
    ('pirates-of-the-caribbean', 'action-adventure'), ('jurassic-park', 'action-adventure'),
    ('maze-runner', 'action-adventure'),
    ('alien', 'horror')
) as map (universe_slug, category_slug)
join public.universes  u on u.slug = map.universe_slug
join public.categories c on c.slug = map.category_slug
on conflict do nothing;

notify pgrst, 'reload schema';

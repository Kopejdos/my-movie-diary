-- =====================================================================
-- My Movie Diary – důvod zamítnutí a podobné kolekce (V4.3.3)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- 1. Zamítnutý film v požadavku má důvod (kód, který web přeloží) a nepovinnou poznámku
--    správce – uživatel ví proč a požadavek na kolekci může upravit a poslat znovu.
-- 2. similar_collections – kolekce, které už mají většinu filmů z požadavku (nebo podobný
--    název). Ukazuje se správci u požadavku na kolekci a ve staviteli a uživateli při
--    skládání vlastní kolekce.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Důvod zamítnutí
-- ---------------------------------------------------------------------
alter table public.film_request_items
    add column if not exists reject_reason text,
    add column if not exists reject_note   text;

alter table public.film_request_items drop constraint if exists film_request_items_reject_reason_check;
alter table public.film_request_items
    add constraint film_request_items_reject_reason_check
    check (reject_reason is null or reject_reason in
        ('in_mmd', 'similar', 'not_released', 'not_movie', 'off_topic', 'duplicate', 'needs_changes', 'left_out', 'other'));

alter table public.film_request_items drop constraint if exists film_request_items_reject_note_check;
alter table public.film_request_items
    add constraint film_request_items_reject_note_check check (char_length(reject_note) <= 300);

comment on column public.film_request_items.reject_reason is
    'Proč správce film zamítl (V4.3.3): in_mmd, similar, not_released, not_movie, off_topic, duplicate, needs_changes, left_out, other';
comment on column public.film_request_items.reject_note is 'Poznámka správce k zamítnutí – vidí ji autor požadavku (V4.3.3)';

-- ---------------------------------------------------------------------
-- 2. Podobné kolekce
--    Kolekce, které mají aspoň 2 filmy z daného seznamu a zároveň aspoň polovinu filmů
--    seznamu (nebo polovinu svých filmů), anebo mají podobný název (jeden obsahuje druhý,
--    bez ohledu na velikost písmen a „The“). Seřazené podle počtu společných filmů.
--    Veřejné údaje katalogu – smí volat kdokoli.
-- ---------------------------------------------------------------------
create or replace function public.similar_collections(p_tmdb_ids integer[], p_name text default null)
returns table (
    slug       text,
    name       text,
    kind       text,
    overlap    integer,
    total      integer,
    name_match boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    with wanted as (
        select distinct unnest(coalesce(p_tmdb_ids, '{}'::integer[])) as tmdb_id
    ),
    wanted_count as (
        select count(*)::integer as n from wanted
    ),
    clean_name as (
        select nullif(regexp_replace(lower(btrim(coalesce(p_name, ''))), '^the\s+|\s+collection$', '', 'g'), '') as value
    ),
    per_universe as (
        select u.id, u.slug, u.name, u.kind,
               count(w.tmdb_id)::integer as overlap,
               (select count(*)::integer from public.universe_items t where t.universe_id = u.id) as total
        from public.universes u
        left join public.universe_items i on i.universe_id = u.id
        left join wanted w on w.tmdb_id = i.tmdb_id
        group by u.id
    )
    select p.slug, p.name, p.kind, p.overlap, p.total,
           coalesce(length(c.value) >= 4 and (
               position(c.value in regexp_replace(lower(p.name), '^the\s+', '')) > 0 or
               position(regexp_replace(lower(p.name), '^the\s+', '') in c.value) > 0
           ), false) as name_match
    from per_universe p, wanted_count wc, clean_name c
    where (p.overlap >= 2 and (p.overlap * 2 >= wc.n or (p.total > 0 and p.overlap * 2 >= p.total)))
       or coalesce(length(c.value) >= 4 and (
               position(c.value in regexp_replace(lower(p.name), '^the\s+', '')) > 0 or
               position(regexp_replace(lower(p.name), '^the\s+', '') in c.value) > 0
           ), false)
    order by p.overlap desc, p.name
    limit 5;
$$;

grant execute on function public.similar_collections(integer[], text) to anon, authenticated;

notify pgrst, 'reload schema';

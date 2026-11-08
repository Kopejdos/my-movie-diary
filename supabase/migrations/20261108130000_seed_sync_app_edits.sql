-- =====================================================================
-- V3.5.2.1 – úpravy z aplikace se samy propisují do seedu
--
-- Seed (supabase/seed/universes.json) zůstává zdrojem pravdy pro import,
-- ale ručně se už nemusí přepisovat nic, co správce udělal v aplikaci:
--   • přidání / úprava / přesun / odebrání filmu v kolekci (admin panel),
--   • úprava kolekce (název, popis, barva, typ, kategorie, obal),
--   • nová kolekce (admin panel, kolekce ze série TMDB), smazání kolekce,
--   • filmy přijaté z požadavků (už od V3.5.2).
-- Databáze si změny pamatuje a skript scripts/sync-seed.sh je do seedu
-- dopíše (Edge Function tmdb, action=seed-sync). Import pak změněné
-- položky převezme jako obyčejné ('seed') a záznamy o odebrání smaže.
--
-- Poznámka: změna pořadí kolekcí na přehledu (šipky v admin panelu) se do
-- seedu nepropisuje – pořadí kolekcí určuje pořadí bloků v souboru.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kdo položku naposledy změnil
-- ---------------------------------------------------------------------
-- universe_items.source: 'seed' | 'request' (z požadavku, V3.5.2) | 'admin' (admin panel)
alter table public.universe_items drop constraint if exists universe_items_source_check;
alter table public.universe_items
    add constraint universe_items_source_check check (source in ('seed', 'request', 'admin'));

comment on column public.universe_items.source is
    'seed = ze seedu; request = z požadavku; admin = změna v admin panelu. Ne-seed položky import nesmaže a sync-seed je dopíše do seedu (V3.5.2, V3.5.2.1)';

-- universes.source: 'seed' | 'app' (kolekce vytvořená nebo upravená v aplikaci)
alter table public.universes
    add column if not exists source text not null default 'seed' check (source in ('seed', 'app'));

comment on column public.universes.source is
    'seed = podle seedu; app = vytvořená nebo upravená v aplikaci – sync-seed ji přepíše do seedu (V3.5.2.1)';

-- Kolekce vytvořené ze série ve V3.5.2 (všechny filmy z požadavků) → 'app'
update public.universes u
set source = 'app'
where exists (select 1 from public.universe_items i where i.universe_id = u.id)
  and not exists (select 1 from public.universe_items i where i.universe_id = u.id and i.source = 'seed');

-- ---------------------------------------------------------------------
-- 2. Odebrané filmy a smazané kolekce (sync je ze seedu vyškrtne)
--    tmdb_id = null → smazaná celá kolekce
-- ---------------------------------------------------------------------
create table if not exists public.seed_removals (
    id             bigint generated always as identity primary key,
    universe_slug  text not null,
    tmdb_id        integer,
    removed_at     timestamptz not null default now()
);
create index if not exists seed_removals_slug_idx on public.seed_removals (universe_slug);

alter table public.seed_removals enable row level security;     -- žádné pravidlo: jen Edge Functions
comment on table public.seed_removals is
    'Filmy odebrané z kolekcí a smazané kolekce v admin panelu – sync-seed je vyškrtne ze seedu, import záznamy smaže (V3.5.2.1)';

-- ---------------------------------------------------------------------
-- 3. Triggery: změna od přihlášeného uživatele = admin panel
--    (Edge Functions běží jako service_role a značku si nastavují samy;
--     zapisovat do kolekcí smí z webu jen správce – pravidla RLS)
-- ---------------------------------------------------------------------
create or replace function public.mark_app_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.role(), '') = 'authenticated' then
        if tg_table_name = 'universes' then
            new.source := 'app';
        else
            new.source := 'admin';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists universe_items_mark_app on public.universe_items;
create trigger universe_items_mark_app
    before insert or update on public.universe_items
    for each row execute function public.mark_app_change();

drop trigger if exists universes_mark_app on public.universes;
create trigger universes_mark_app
    before insert or update on public.universes
    for each row execute function public.mark_app_change();

-- Změna kategorií kolekce v admin panelu → kolekce upravená v aplikaci
create or replace function public.mark_universe_categories_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.role(), '') = 'authenticated' then
        update public.universes
        set source = 'app'
        where id = coalesce(new.universe_id, old.universe_id) and source <> 'app';
    end if;
    return null;
end;
$$;

drop trigger if exists universe_categories_mark_app on public.universe_categories;
create trigger universe_categories_mark_app
    after insert or delete on public.universe_categories
    for each row execute function public.mark_universe_categories_change();

-- Odebrání filmu / smazání kolekce v admin panelu → záznam pro sync
create or replace function public.log_seed_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_slug text;
begin
    if coalesce(auth.role(), '') <> 'authenticated' then
        return old;
    end if;
    if tg_table_name = 'universes' then
        insert into public.seed_removals (universe_slug, tmdb_id) values (old.slug, null);
    else
        -- při mazání celé kolekce (cascade) už kolekce neexistuje → stačí záznam o kolekci
        select u.slug into v_slug from public.universes u where u.id = old.universe_id;
        if v_slug is not null then
            insert into public.seed_removals (universe_slug, tmdb_id) values (v_slug, old.tmdb_id);
        end if;
    end if;
    return old;
end;
$$;

drop trigger if exists universe_items_log_removal on public.universe_items;
create trigger universe_items_log_removal
    after delete on public.universe_items
    for each row execute function public.log_seed_removal();

drop trigger if exists universes_log_removal on public.universes;
create trigger universes_log_removal
    after delete on public.universes
    for each row execute function public.log_seed_removal();

revoke execute on function public.mark_app_change() from public, anon, authenticated;
revoke execute on function public.mark_universe_categories_change() from public, anon, authenticated;
revoke execute on function public.log_seed_removal() from public, anon, authenticated;

notify pgrst, 'reload schema';

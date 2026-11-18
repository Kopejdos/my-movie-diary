-- =====================================================================
-- My Movie Diary – překlady názvů a popisů kolekcí z admin panelu (V4.3.4)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- Výchozí překlady kolekcí jsou dál v souborech web/js/i18n/catalog.<jazyk>.json (verzují se
-- s webem). Tato tabulka je **přepisuje** – opravy ze záložky Translations v admin panelu
-- a názvy sérií z TMDB u nově založených kolekcí. Web bere: databáze → soubor → angličtina.
--
--   source = 'tmdb'   název převzatý z TMDB (série nebo první film)
--   source = 'manual' správce ho napsal nebo potvrdil („Keep“) – kontrola ho už neukazuje jako rozdíl
-- =====================================================================

create table if not exists public.universe_translations (
    universe_id  bigint      not null references public.universes (id) on delete cascade,
    lang         text        not null check (lang in ('cs', 'de', 'es', 'uk')),
    name         text        check (char_length(name) between 1 and 80),
    description  text        check (char_length(description) between 1 and 400),
    source       text        not null default 'manual' check (source in ('manual', 'tmdb')),
    updated_at   timestamptz not null default now(),
    primary key (universe_id, lang)
);

comment on table public.universe_translations is
    'Překlady názvů a popisů kolekcí z admin panelu (V4.3.4) – mají přednost před catalog.<jazyk>.json';

alter table public.universe_translations enable row level security;

drop policy if exists "Collection translations are public" on public.universe_translations;
create policy "Collection translations are public"
    on public.universe_translations for select
    using (true);

drop policy if exists "Admins can add collection translations" on public.universe_translations;
create policy "Admins can add collection translations"
    on public.universe_translations for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "Admins can update collection translations" on public.universe_translations;
create policy "Admins can update collection translations"
    on public.universe_translations for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "Admins can delete collection translations" on public.universe_translations;
create policy "Admins can delete collection translations"
    on public.universe_translations for delete
    to authenticated
    using (public.is_admin());

grant select on public.universe_translations to anon, authenticated;
grant insert, update, delete on public.universe_translations to authenticated;
grant all on public.universe_translations to service_role;

-- Překlady kolekcí jednoho jazyka jedním dotazem: { "happy-death-day": { "name": "…", "description": "…" } }
-- (prázdná pole se vynechají – web pak vezme soubor nebo angličtinu)
create or replace function public.collection_texts(p_lang text)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(u.slug, jsonb_strip_nulls(jsonb_build_object(
               'name', t.name,
               'description', t.description))), '{}'::jsonb)
    from public.universe_translations t
    join public.universes u on u.id = t.universe_id
    where t.lang = p_lang
      and (t.name is not null or t.description is not null);
$$;

grant execute on function public.collection_texts(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- My Movie Diary – přeložené názvy filmů (V4.2.2)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- Názvy (a popisy) filmů v češtině, němčině, španělštině a ukrajinštině z TMDB.
-- Plní je Edge Function tmdb: import (nové a obnovené filmy), akce translate
-- (filmy, které ještě přeložené nejsou – scripts/translate.sh) a admin panel
-- při přidání filmu. Chybí-li překlad, web ukáže anglický název.
-- Názvy a popisy kolekcí, kategorie a poznámky cest nejsou v databázi –
-- jsou v souborech web/js/i18n/catalog.<jazyk>.json (verzují se s webem).
-- =====================================================================

create table if not exists public.film_translations (
    tmdb_id   integer not null references public.films (tmdb_id) on delete cascade,
    lang      text    not null check (lang in ('cs', 'de', 'es', 'uk')),
    title     text,                     -- null = stejný jako anglický (web ukáže anglický)
    overview  text,
    primary key (tmdb_id, lang)
);

alter table public.film_translations enable row level security;

drop policy if exists "Film translations are public" on public.film_translations;
create policy "Film translations are public"
    on public.film_translations for select
    using (true);

grant select on public.film_translations to anon, authenticated;
grant all on public.film_translations to service_role;

-- Kdy se film naposledy překládal (null = ještě ne → vezme ho akce translate)
alter table public.films add column if not exists translated_at timestamptz;

create index if not exists films_untranslated_idx on public.films (tmdb_id) where translated_at is null;

-- Všechny přeložené názvy jednoho jazyka jedním dotazem: { "603": "Matrix", … }.
-- Jeden objekt JSON místo ~1 300 řádků (bez stránkování po 1 000).
create or replace function public.film_titles(p_lang text)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(t.tmdb_id::text, t.title), '{}'::jsonb)
    from public.film_translations t
    where t.lang = p_lang
      and t.title is not null
      and t.title <> '';
$$;

grant execute on function public.film_titles(text) to anon, authenticated;

notify pgrst, 'reload schema';

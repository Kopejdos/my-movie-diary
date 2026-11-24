-- =====================================================================
-- My Movie Diary – admin tým a detail filmu (V4.4.6)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- 1. Vlastník (owner) – jeden správce (hlavní admin účet) smí jako jediný udělovat a odebírat
--    roli správce a mazat / resetovat jiné správce. Ostatní správci spravují obsah, uživatele
--    a požadavky jako dosud. Vlastník se nastavuje jen tady v SQL (ne z webu).
-- 2. Deník správců (admin_log) – kdo kdy co změnil v admin panelu (záložka Activity).
--    Zapisují Edge Function admin (přes serverový klíč) a web přes admin_log_action.
-- 3. Původní jazyk filmu (films.original_language) – český film se v češtině ukáže pod
--    původním názvem („Jak svět přichází o básníky“), i když TMDB nemá český překlad názvu.
-- 4. Trailer (films.trailer_key) – klíč videa na YouTube pro detail filmu; plní ho import
--    a při prvním otevření detailu Edge Function tmdb (akce film-trailer).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vlastník
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_owner boolean not null default false;

comment on column public.profiles.is_owner is
    'Vlastník webu (V4.4.6) – jediný smí měnit roli správce; nastavuje se jen v SQL';

-- Vlastník je vždy i správce
alter table public.profiles drop constraint if exists profiles_owner_is_admin;
alter table public.profiles add constraint profiles_owner_is_admin check (not is_owner or is_admin);

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select p.is_owner from public.profiles p where p.id = auth.uid()),
        false
    );
$$;

revoke execute on function public.is_owner() from public;
grant  execute on function public.is_owner() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Deník správců
-- ---------------------------------------------------------------------
create table if not exists public.admin_log (
    id          bigint generated always as identity primary key,
    admin_id    uuid references public.profiles (id) on delete set null,
    action      text not null check (char_length(action) between 1 and 60),
    target      text check (target is null or char_length(target) <= 200),
    details     jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists admin_log_created_idx on public.admin_log (created_at desc);

alter table public.admin_log enable row level security;

drop policy if exists "Admins read the admin log" on public.admin_log;
create policy "Admins read the admin log"
    on public.admin_log for select to authenticated
    using ((select public.is_admin()));

-- Zápis jen přes funkci (web) nebo serverovým klíčem (Edge Function) – ne přímo z prohlížeče
revoke insert, update, delete on public.admin_log from anon, authenticated;
grant select on public.admin_log to authenticated;
grant all on public.admin_log to service_role;

-- Záznam z webu (úprava kolekce, odznak, zakázané slovo, překlad…). Jen pro správce.
create or replace function public.admin_log_action(p_action text, p_target text default null, p_details jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Administrators only' using errcode = '42501';
    end if;
    insert into public.admin_log (admin_id, action, target, details)
    values (auth.uid(), left(p_action, 60), left(p_target, 200), p_details);
end;
$$;

revoke execute on function public.admin_log_action(text, text, jsonb) from public, anon;
grant  execute on function public.admin_log_action(text, text, jsonb) to authenticated;

-- Posledních N záznamů s nickem správce (záložka Activity)
create or replace function public.admin_log_recent(p_limit integer default 200)
returns table (id bigint, created_at timestamptz, admin_name text, action text, target text, details jsonb)
language sql
stable
security definer
set search_path = ''
as $$
    select l.id, l.created_at, p.username, l.action, l.target, l.details
    from public.admin_log l
    left join public.profiles p on p.id = l.admin_id
    where public.is_admin()
    order by l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

revoke execute on function public.admin_log_recent(integer) from public, anon;
grant  execute on function public.admin_log_recent(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Původní jazyk filmu + názvy pro web
-- ---------------------------------------------------------------------
alter table public.films add column if not exists original_language text
    check (original_language is null or original_language ~ '^[a-z]{2}$');

-- Filmy s neanglickým původním názvem se přeloží znovu (scripts/translate.sh) – akce translate
-- si při tom zjistí původní jazyk. Anglické filmy (název = původní název) zůstanou.
update public.films
set translated_at = null
where original_language is null
  and original_title is not null
  and original_title <> title;

-- Názvy filmů v jazyce: překlad z TMDB, a když chybí, původní název filmu v tomhle jazyce
-- (česky natočený film v češtině, německý v němčině…).
create or replace function public.film_titles(p_lang text)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(jsonb_object_agg(x.tmdb_id::text, x.title), '{}'::jsonb)
    from (
        select t.tmdb_id, t.title
        from public.film_translations t
        where t.lang = p_lang
          and t.title is not null
          and t.title <> ''
        union all
        select f.tmdb_id, f.original_title
        from public.films f
        where f.original_language = p_lang
          and f.original_title is not null
          and f.original_title <> f.title
          and not exists (
              select 1 from public.film_translations t
              where t.tmdb_id = f.tmdb_id and t.lang = p_lang and t.title is not null and t.title <> ''
          )
    ) x;
$$;

grant execute on function public.film_titles(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Trailer
-- ---------------------------------------------------------------------
alter table public.films add column if not exists trailer_key text
    check (trailer_key is null or trailer_key ~ '^[A-Za-z0-9_-]{6,20}$');
alter table public.films add column if not exists trailer_checked_at timestamptz;

comment on column public.films.trailer_key is
    'Klíč videa na YouTube (V4.4.6) – null + trailer_checked_at = TMDB trailer nemá';

notify pgrst, 'reload schema';

-- =====================================================================
-- V3.5.1 – požadavky na filmy
--
-- • Katalog je kurátorský: film se do databáze dostane jen přes schválený
--   požadavek (nebo import / admin).
-- • Požadavek = jeden nebo víc filmů z TMDB + nepovinná poznámka. Zakládá ho
--   Edge Function "requests" (údaje o filmu bere sama z TMDB, web je podvrhnout
--   nemůže); přímý zápis do tabulek z webu nejde.
-- • Když už film někdo chce, ostatní dají +1 (tabulka film_request_votes).
-- • Správce přijme celý požadavek nebo jen vybrané filmy (Edge Function "admin").
-- • Filmy v databázi, které nejsou v žádné kolekci, ukazuje pohled other_films
--   (hledání, „Other movies“ na profilu).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabulky
-- ---------------------------------------------------------------------
create table public.film_requests (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    note        text check (char_length(note) <= 300),
    created_at  timestamptz not null default now()
);
create index film_requests_user_idx on public.film_requests (user_id);

create table public.film_request_items (
    id           bigint generated always as identity primary key,
    request_id   bigint not null references public.film_requests (id) on delete cascade,
    tmdb_id      integer not null check (tmdb_id > 0),
    -- údaje z TMDB v okamžiku požadavku (film ještě není v tabulce films)
    title        text not null,
    release_date date,
    poster_path  text,
    status       text not null default 'pending' check (status in ('pending', 'added', 'rejected')),
    universe_id  bigint references public.universes (id) on delete set null,   -- kam správce film zařadil
    decided_at   timestamptz,
    unique (request_id, tmdb_id)
);
create index film_request_items_tmdb_idx on public.film_request_items (tmdb_id);
create index film_request_items_status_idx on public.film_request_items (status);

create table public.film_request_votes (
    tmdb_id     integer not null check (tmdb_id > 0),
    user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (tmdb_id, user_id)
);

-- ---------------------------------------------------------------------
-- 2. Přístupová pravidla
-- ---------------------------------------------------------------------
alter table public.film_requests enable row level security;
alter table public.film_request_items enable row level security;
alter table public.film_request_votes enable row level security;

-- Vlastní požadavky (správce vidí všechny)
create policy "Read own requests"
    on public.film_requests for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

-- Zrušit jde jen vlastní požadavek, o kterém se ještě nerozhodlo
create policy "Cancel own pending requests"
    on public.film_requests for delete to authenticated
    using (
        user_id = auth.uid()
        and not exists (
            select 1 from public.film_request_items i
            where i.request_id = film_requests.id and i.status <> 'pending'
        )
    );

create policy "Read own request items"
    on public.film_request_items for select to authenticated
    using (
        public.is_admin()
        or exists (select 1 from public.film_requests r where r.id = request_id and r.user_id = auth.uid())
    );

-- Čeká film na rozhodnutí? (security definer – cizí položky požadavků přes RLS vidět nejsou)
create function public.film_request_pending(p_tmdb_id integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.film_request_items i where i.tmdb_id = p_tmdb_id and i.status = 'pending');
$$;
revoke execute on function public.film_request_pending(integer) from public, anon;
grant execute on function public.film_request_pending(integer) to authenticated;

-- +1: vlastní hlasy, jen u filmu, který ještě čeká na rozhodnutí
create policy "Read own votes"
    on public.film_request_votes for select to authenticated
    using (user_id = auth.uid());

create policy "Vote for pending films"
    on public.film_request_votes for insert to authenticated
    with check (
        user_id = auth.uid()
        and public.film_request_pending(tmdb_id)
    );

create policy "Remove own votes"
    on public.film_request_votes for delete to authenticated
    using (user_id = auth.uid());

grant select, delete on public.film_requests to authenticated;
grant select on public.film_request_items to authenticated;
grant select, insert, delete on public.film_request_votes to authenticated;

-- ---------------------------------------------------------------------
-- 3. Seznam požadovaných filmů pro všechny přihlášené
--    Jeden řádek na film: kolik lidí ho chce (žadatelé + hlasy), stav,
--    jestli ho chci já. Kdo žádal, se neprozrazuje.
--    p_status: 'pending' | 'added' | 'rejected' | null (vše)
-- ---------------------------------------------------------------------
create function public.wanted_films(p_query text default null, p_status text default null)
returns table (
    tmdb_id integer, title text, release_date date, poster_path text,
    status text, wants integer, i_want boolean, requested_by_me boolean, first_requested timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    with films as (
        select i.tmdb_id,
               (array_agg(i.title order by r.created_at desc))[1]        as title,
               (array_agg(i.release_date order by r.created_at desc))[1] as release_date,
               (array_agg(i.poster_path order by r.created_at desc))[1]  as poster_path,
               case
                   when bool_or(i.status = 'pending') then 'pending'
                   when bool_or(i.status = 'added') then 'added'
                   else 'rejected'
               end as status,
               min(r.created_at) as first_requested,
               bool_or(r.user_id = auth.uid()) as requested_by_me
        from public.film_request_items i
        join public.film_requests r on r.id = i.request_id
        group by i.tmdb_id
    ),
    people as (
        select i.tmdb_id, r.user_id
        from public.film_request_items i join public.film_requests r on r.id = i.request_id
        union
        select v.tmdb_id, v.user_id from public.film_request_votes v
    )
    select f.tmdb_id, f.title, f.release_date, f.poster_path, f.status,
           (select count(*)::integer from people p where p.tmdb_id = f.tmdb_id) as wants,
           exists (select 1 from people p where p.tmdb_id = f.tmdb_id and p.user_id = auth.uid()) as i_want,
           f.requested_by_me,
           f.first_requested
    from films f
    where auth.uid() is not null
      and (p_status is null or f.status = p_status)
      and (p_query is null or btrim(p_query) = '' or strpos(lower(f.title), lower(btrim(p_query))) > 0)
    order by (f.status = 'pending') desc, wants desc, f.first_requested
    limit 200;
$$;

revoke execute on function public.wanted_films(text, text) from public, anon;
grant execute on function public.wanted_films(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Filmy mimo kolekce (schválené požadavky, filmy přidané adminem)
-- ---------------------------------------------------------------------
create view public.other_films
with (security_invoker = true) as
select f.tmdb_id, f.title, f.original_title, f.release_date, f.runtime, f.poster_path
from public.films f
where not exists (select 1 from public.universe_items ui where ui.tmdb_id = f.tmdb_id);

grant select on public.other_films to anon, authenticated;

notify pgrst, 'reload schema';

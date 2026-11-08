-- =====================================================================
-- V3.5.2.3 – hlídání nových dílů sérií
--
-- • films.tmdb_collection_id – do které série TMDB film patří
--   (null = ještě nezjištěno, 0 = žádná série). Plní ho import, admin
--   a postupně i samotná kontrola.
-- • universes.tmdb_collection_id – série TMDB, ze které kolekce vznikla
--   (kolekce ze série, V3.5.2). Hlídají se i série, ze kterých má kolekce
--   aspoň 2 filmy (např. Lethal Weapon, Alien…).
-- • series_updates – nalezené nové díly: správce je přidá, nebo zahodí
--   (zahozený se už znovu nenabídne).
-- • admin_state – kdy proběhla poslední kontrola (spouští se sama, když
--   správce otevře admin panel a od poslední kontroly uběhl den).
-- Vše jen přes Edge Function "admin" – z webu se do tabulek nedá sáhnout.
-- =====================================================================

alter table public.films
    add column if not exists tmdb_collection_id integer check (tmdb_collection_id >= 0);

comment on column public.films.tmdb_collection_id is
    'Série TMDB (belongs_to_collection); 0 = žádná, null = nezjištěno (V3.5.2.3)';

alter table public.universes
    add column if not exists tmdb_collection_id integer check (tmdb_collection_id > 0);

comment on column public.universes.tmdb_collection_id is
    'Série TMDB, ze které kolekce vznikla – hlídají se její nové díly (V3.5.2.3)';

create index if not exists films_collection_idx on public.films (tmdb_collection_id) where tmdb_collection_id > 0;

create table if not exists public.series_updates (
    id                  bigint generated always as identity primary key,
    universe_id         bigint not null references public.universes (id) on delete cascade,
    tmdb_collection_id  integer not null check (tmdb_collection_id > 0),
    tmdb_id             integer not null check (tmdb_id > 0),
    title               text not null,
    release_date        date,
    poster_path         text,
    status              text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
    found_at            timestamptz not null default now(),
    decided_at          timestamptz,
    unique (universe_id, tmdb_id)
);
create index if not exists series_updates_status_idx on public.series_updates (status);

alter table public.series_updates enable row level security;     -- žádné pravidlo: jen Edge Functions
comment on table public.series_updates is 'Nové díly sérií TMDB nalezené kontrolou (V3.5.2.3)';

create table if not exists public.admin_state (
    key         text primary key,
    value       jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now()
);

alter table public.admin_state enable row level security;        -- žádné pravidlo: jen Edge Functions
comment on table public.admin_state is 'Stav správcovských úloh – např. poslední kontrola sérií (V3.5.2.3)';

notify pgrst, 'reload schema';

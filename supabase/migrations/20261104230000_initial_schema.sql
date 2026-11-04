-- =====================================================================
-- My Movie Diary – počáteční struktura databáze (fáze 1a)
-- Spouští se jednou v Supabase → SQL Editor (celý soubor najednou).
-- Popis tabulek a pravidel: docs/data-model.md
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabulky
-- ---------------------------------------------------------------------

-- Profil uživatele (1:1 k auth.users, vzniká automaticky při registraci)
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    username    text not null unique
                check (username ~ '^[A-Za-z0-9_-]{3,24}$'),
    created_at  timestamptz not null default now()
);

-- Cache údajů o filmech z TMDB (zapisuje jen Edge Function)
create table public.films (
    tmdb_id         integer primary key,
    title           text not null,
    original_title  text,
    release_date    date,
    runtime         integer check (runtime is null or runtime >= 0),
    poster_path     text,
    overview        text,
    updated_at      timestamptz not null default now()
);

-- Univerza (owner_id null = oficiální, vyplněné = vlastní univerzum uživatele)
create table public.universes (
    id             bigint generated always as identity primary key,
    slug           text not null unique
                   check (slug ~ '^[a-z0-9-]{2,40}$'),
    name           text not null,
    description    text,
    cover_tmdb_id  integer references public.films (tmdb_id) on delete set null,
    sort_order     integer not null default 0,
    owner_id       uuid references public.profiles (id) on delete cascade
);

-- Filmy v univerzu (jeden film může být ve více univerzech)
create table public.universe_items (
    id             bigint generated always as identity primary key,
    universe_id    bigint  not null references public.universes (id) on delete cascade,
    tmdb_id        integer not null references public.films (tmdb_id) on delete cascade,
    release_order  integer not null,
    story_order    integer,                      -- null = stejné jako release_order
    group_label    text,                         -- např. 'Phase 1', 'Animated'
    is_optional    boolean not null default false, -- crossover / spin-off, nepočítá se do postupu
    unique (universe_id, tmdb_id)
);

-- Zhlédnutí (+1 = nový řádek, −1 = smazání nejnovějšího)
create table public.watches (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid()
                references public.profiles (id) on delete cascade,
    tmdb_id     integer not null references public.films (tmdb_id) on delete cascade,
    watched_on  date not null default current_date,
    rating      smallint check (rating between 1 and 10),
    note        text,
    created_at  timestamptz not null default now()
);

-- Watchlist – „chci vidět“
create table public.watchlist (
    user_id   uuid not null default auth.uid()
              references public.profiles (id) on delete cascade,
    tmdb_id   integer not null references public.films (tmdb_id) on delete cascade,
    added_at  timestamptz not null default now(),
    primary key (user_id, tmdb_id)
);

-- Keep-alive – zapisuje sem jen funkce ping()
create table public.heartbeat (
    id         bigint generated always as identity primary key,
    pinged_at  timestamptz not null default now()
);

-- Indexy pro časté dotazy
create index universe_items_universe_idx on public.universe_items (universe_id);
create index watches_user_film_idx       on public.watches (user_id, tmdb_id);


-- ---------------------------------------------------------------------
-- 2. Row Level Security – každá tabulka je zamčená, přístup jen podle pravidel
-- ---------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.films          enable row level security;
alter table public.universes      enable row level security;
alter table public.universe_items enable row level security;
alter table public.watches        enable row level security;
alter table public.watchlist      enable row level security;
alter table public.heartbeat      enable row level security;   -- žádné pravidlo = nikdo

-- Sdílená data: číst smí kdokoli (i nepřihlášený – náhled univerz)
create policy "Films are readable by everyone"
    on public.films for select
    to anon, authenticated
    using (true);

create policy "Official and own universes are readable"
    on public.universes for select
    to anon, authenticated
    using (owner_id is null or owner_id = auth.uid());

create policy "Universe items are readable by everyone"
    on public.universe_items for select
    to anon, authenticated
    using (true);

-- Profil: jen vlastní řádek
create policy "Users can read own profile"
    on public.profiles for select
    to authenticated
    using (id = auth.uid());

create policy "Users can update own profile"
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Zhlédnutí: jen vlastní řádky
create policy "Users can read own watches"
    on public.watches for select
    to authenticated
    using (user_id = auth.uid());

create policy "Users can add own watches"
    on public.watches for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "Users can update own watches"
    on public.watches for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "Users can delete own watches"
    on public.watches for delete
    to authenticated
    using (user_id = auth.uid());

-- Watchlist: jen vlastní řádky
create policy "Users can read own watchlist"
    on public.watchlist for select
    to authenticated
    using (user_id = auth.uid());

create policy "Users can add to own watchlist"
    on public.watchlist for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "Users can remove from own watchlist"
    on public.watchlist for delete
    to authenticated
    using (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- 3. Oprávnění pro Data API
--    (automatické zpřístupnění nových tabulek je vypnuté, povoluje se výslovně)
-- ---------------------------------------------------------------------

grant select on public.films, public.universes, public.universe_items
    to anon, authenticated;

grant select, update                 on public.profiles  to authenticated;
grant select, insert, update, delete on public.watches   to authenticated;
grant select, insert, delete         on public.watchlist to authenticated;
-- heartbeat: žádná oprávnění, zapisuje jen funkce ping()


-- ---------------------------------------------------------------------
-- 4. Automatický profil při registraci
--    Nickname přijde z registračního formuláře (metadata 'username').
--    Google přihlášení nickname nemá → vygeneruje se 'user_xxxxxxxx',
--    uživatel si ho později změní.
-- ---------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, username)
    values (
        new.id,
        coalesce(
            nullif(new.raw_user_meta_data ->> 'username', ''),
            'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
        )
    );
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 5. Pohledy – výpočty běží v databázi, web dostane hotová čísla
--    security_invoker = pravidla RLS platí pro toho, kdo se ptá
-- ---------------------------------------------------------------------

-- Postup přihlášeného uživatele v každém univerzu (volitelné filmy se nepočítají)
create view public.universe_progress
with (security_invoker = true) as
select
    u.id   as universe_id,
    u.slug,
    count(ui.id) filter (where not ui.is_optional) as total_count,
    count(ui.id) filter (
        where not ui.is_optional
          and exists (
              select 1
              from public.watches w
              where w.tmdb_id = ui.tmdb_id
                and w.user_id = auth.uid()
          )
    ) as watched_count
from public.universes u
left join public.universe_items ui on ui.universe_id = u.id
group by u.id, u.slug;

-- Počet zhlédnutí a poslední zhlédnutí každého filmu přihlášeného uživatele
create view public.my_film_counts
with (security_invoker = true) as
select
    w.tmdb_id,
    count(*)          as watch_count,
    max(w.watched_on) as last_watched_on
from public.watches w
where w.user_id = auth.uid()
group by w.tmdb_id;

-- Pohled universe_progress čte i tabulku watches. Nepřihlášený uživatel (anon)
-- na ni potřebuje oprávnění ke čtení, ale RLS mu žádný řádek neukáže
-- (všechna pravidla pro watches platí jen pro authenticated) → vidí 0 zhlédnutí.
grant select on public.watches to anon;

grant select on public.universe_progress to anon, authenticated;
grant select on public.my_film_counts    to authenticated;


-- ---------------------------------------------------------------------
-- 6. Funkce
-- ---------------------------------------------------------------------

-- −1: smaže nejnovější zhlédnutí filmu přihlášeného uživatele.
-- Vrací nový počet zhlédnutí.
create function public.remove_latest_watch(p_tmdb_id integer)
returns bigint
language sql
security invoker
set search_path = ''
as $$
    delete from public.watches
    where id = (
        select id
        from public.watches
        where user_id = auth.uid()
          and tmdb_id = p_tmdb_id
        order by watched_on desc, created_at desc
        limit 1
    );

    select count(*)
    from public.watches
    where user_id = auth.uid()
      and tmdb_id = p_tmdb_id;
$$;

revoke execute on function public.remove_latest_watch(integer) from public, anon;
grant  execute on function public.remove_latest_watch(integer) to authenticated;

-- Keep-alive: zapíše řádek do heartbeat a smaže záznamy starší než 30 dní.
-- Volá ho GitHub Action (.github/workflows/keep-alive.yml).
create function public.ping()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_now timestamptz := now();
begin
    insert into public.heartbeat (pinged_at) values (v_now);
    delete from public.heartbeat where pinged_at < v_now - interval '30 days';
    return v_now;
end;
$$;

revoke execute on function public.ping() from public;
grant  execute on function public.ping() to anon, authenticated;

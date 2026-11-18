-- =====================================================================
-- My Movie Diary – výhody za úroveň a odznaky (V4.4)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- 1. Úroveň v databázi: XP se počítá stejně jako ve webu (web/js/achievements.js – stejná
--    pravidla, test tests/perks.test.mjs hlídá konstanty), aby limity hlídal server, ne prohlížeč.
--    Výsledek se ukládá do user_progress; zhlédnutí ho označí jako zastaralý, po dni se přepočítá sám.
-- 2. Výhody za úroveň: s úrovní rostou limity požadavků a seznamů (level_perks).
--    Hlídají je Edge Function requests (user_perks) a triggery seznamů. Dnešní limity se nikomu nesníží.
-- 3. Odznaky uživatelů (user_badges) – zatím jen Elite; přiděluje a odebírá jen správce.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Úroveň z XP – stejné vzorce jako web
-- ---------------------------------------------------------------------

-- XP potřebné k úrovni: 110 · (úroveň − 1)^2,07, zaokrouhleno na 50 (achievements.js → xpForLevel)
create or replace function public.xp_for_level(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case when p_level <= 1 then 0
                else (round(110 * power((p_level - 1)::numeric, 2.07) / 50) * 50)::integer end;
$$;

-- Úroveň z XP (achievements.js → levelFromXp)
create or replace function public.level_from_xp(p_xp integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
    v_level integer := 1;
begin
    while v_level < 200 and coalesce(p_xp, 0) >= public.xp_for_level(v_level + 1) loop
        v_level := v_level + 1;
    end loop;
    return v_level;
end;
$$;

-- XP za odemčené úrovně achievementu: Bronze 25, Silver 50, Gold 100, Platinum 200, Diamond 400, Legend 800
create or replace function public.tiers_xp(p_value integer, p_tiers integer[])
returns integer
language sql
immutable
set search_path = ''
as $$
    select coalesce(sum((array[25, 50, 100, 200, 400, 800])[least(t.ord, 6)]), 0)::integer
    from unnest(p_tiers) with ordinality as t(threshold, ord)
    where p_value >= t.threshold;
$$;

-- Úrovně omezené počtem dostupných kolekcí (achievements.js → scaledTiers): 2 kolekce → 1, 2
create or replace function public.scaled_tiers(p_tiers integer[], p_available integer)
returns integer[]
language sql
immutable
set search_path = ''
as $$
    select case
        when p_available < p_tiers[array_length(p_tiers, 1)] and not (p_available = any(p_tiers))
            then coalesce(array(select t from unnest(p_tiers) t where t <= p_available order by t), '{}') || p_available
        else coalesce(array(select t from unnest(p_tiers) t where t <= p_available order by t), '{}')
    end;
$$;

-- XP uživatele – přesně jako computeAchievements + computeXp ve webu:
--   nový film 10, další zhlédnutí 3, dokončená kolekce 10 za každý povinný film,
--   achievementy (First, Collector, Screen Time, Marathon, Rewatcher, Completionist, Pathfinder,
--   Auteur, fanoušci kategorií). „Seen before“ se nepočítá do času ani do Marathonu.
--   Chystané filmy (premiéra po dnešku, bez data podle is_upcoming) se do kolekcí nepočítají.
create or replace function public.compute_user_xp(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
    with w as (
        select w.tmdb_id, w.watched_on, coalesce(w.seen_before, false) as seen_before, coalesce(f.runtime, 0) as runtime
        from public.watches w
        left join public.films f on f.tmdb_id = w.tmdb_id
        where w.user_id = p_user
    ),
    seen as (select distinct tmdb_id from w),
    stats as (
        select
            (select count(*) from w)::integer as total,
            (select count(*) from seen)::integer as distinct_films,
            ((select coalesce(sum(runtime), 0) from w where not seen_before) / 60)::integer as hours,
            (select coalesce(max(c), 0) from (select count(*) as c from w where not seen_before group by watched_on) d)::integer as best_day,
            (select coalesce(max(c), 0) from (select count(*) as c from w group by tmdb_id) r)::integer as most_rewatched
    ),
    today as (select (now() at time zone 'Europe/Prague')::date as d),
    req as (
        select distinct i.universe_id, i.tmdb_id
        from public.universe_items i
        join public.films f on f.tmdb_id = i.tmdb_id
        cross join today
        where not i.is_optional
          and not (case when f.release_date is not null then f.release_date > today.d else coalesce(i.is_upcoming, false) end)
    ),
    uni as (
        select r.universe_id, u.kind, count(*)::integer as n,
               bool_and(exists (select 1 from seen s where s.tmdb_id = r.tmdb_id)) as complete
        from req r
        join public.universes u on u.id = r.universe_id
        group by r.universe_id, u.kind
    ),
    done as (select * from uni where complete),
    fans as (
        select public.tiers_xp(
                   (select count(*) from done d join public.universe_categories l on l.universe_id = d.universe_id and l.category_id = c.id)::integer,
                   public.scaled_tiers(array[1, 3, 5], cnt.n)) as xp
        from public.categories c
        cross join lateral (
            select count(*)::integer as n from uni u
            join public.universe_categories l on l.universe_id = u.universe_id and l.category_id = c.id
        ) cnt
        where cnt.n > 0
    )
    select (
        s.distinct_films * 10
        + (s.total - s.distinct_films) * 3
        + coalesce((select sum(n) from done), 0)::integer * 10
        + public.tiers_xp(s.distinct_films, array[1])
        + public.tiers_xp(s.distinct_films, array[10, 50, 100, 200, 500, 1000])
        + public.tiers_xp(s.hours, array[24, 100, 200, 500, 1000])
        + public.tiers_xp(s.best_day, array[3, 5, 8])
        + public.tiers_xp(s.most_rewatched, array[3, 5, 10])
        + public.tiers_xp((select count(*) from done)::integer, array[1, 5, 10, 20, 50])
        + coalesce((select public.tiers_xp((select count(*) from done where kind = 'path')::integer,
                                           public.scaled_tiers(array[1, 3, 5], count(*)::integer))
                    from uni where kind = 'path' having count(*) > 0), 0)
        + coalesce((select public.tiers_xp((select count(*) from done where kind = 'director')::integer,
                                           public.scaled_tiers(array[1, 3, 5], count(*)::integer))
                    from uni where kind = 'director' having count(*) > 0), 0)
        + coalesce((select sum(xp) from fans), 0)::integer
    )::integer
    from stats s;
$$;

revoke execute on function public.compute_user_xp(uuid) from public, anon, authenticated;
grant execute on function public.compute_user_xp(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Uložená úroveň (aby limity nepočítaly XP při každém přidání filmu do seznamu)
-- ---------------------------------------------------------------------
create table if not exists public.user_progress (
    user_id      uuid        primary key references public.profiles (id) on delete cascade,
    xp           integer     not null default 0,
    level        integer     not null default 1,
    stale        boolean     not null default true,
    computed_at  timestamptz not null default now()
);

comment on table public.user_progress is
    'Úroveň uživatele spočítaná v databázi (V4.4) – pro limity; stale = po zhlédnutí přepočítat';

alter table public.user_progress enable row level security;

drop policy if exists "Users can read own progress" on public.user_progress;
create policy "Users can read own progress"
    on public.user_progress for select
    to authenticated
    using (user_id = auth.uid());

grant select on public.user_progress to authenticated;
grant all on public.user_progress to service_role;

-- Úroveň uživatele: z uložené hodnoty, nebo nově spočítaná (po zhlédnutí, nejpozději po dni –
-- mezitím se mohl změnit katalog nebo vyjít chystaný film)
create or replace function public.user_level(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_level integer;
    v_xp integer;
begin
    if p_user is null then
        return 1;
    end if;
    select p.level into v_level
    from public.user_progress p
    where p.user_id = p_user and not p.stale and p.computed_at > now() - interval '1 day';
    if found then
        return v_level;
    end if;
    v_xp := public.compute_user_xp(p_user);
    v_level := public.level_from_xp(v_xp);
    insert into public.user_progress (user_id, xp, level, stale, computed_at)
    values (p_user, v_xp, v_level, false, now())
    on conflict (user_id) do update set xp = excluded.xp, level = excluded.level, stale = false, computed_at = excluded.computed_at;
    return v_level;
end;
$$;

revoke execute on function public.user_level(uuid) from public, anon, authenticated;
grant execute on function public.user_level(uuid) to service_role;

-- Zhlédnutí změnilo XP → uloženou úroveň přepočítat (jednou za příkaz, i při hromadném „Seen before“)
create or replace function public.mark_progress_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.user_progress (user_id, stale)
    select distinct c.user_id, true from changed c where c.user_id is not null
    on conflict (user_id) do update set stale = true;
    return null;
end;
$$;

drop trigger if exists watches_progress_insert on public.watches;
create trigger watches_progress_insert
    after insert on public.watches
    referencing new table as changed
    for each statement execute function public.mark_progress_stale();

drop trigger if exists watches_progress_delete on public.watches;
create trigger watches_progress_delete
    after delete on public.watches
    referencing old table as changed
    for each statement execute function public.mark_progress_stale();

drop trigger if exists watches_progress_update on public.watches;
create trigger watches_progress_update
    after update on public.watches
    referencing new table as changed
    for each statement execute function public.mark_progress_stale();

-- ---------------------------------------------------------------------
-- 2. Výhody za úroveň – stejná tabulka jako web/js/perks.js (hlídá tests/perks.test.mjs)
-- ---------------------------------------------------------------------
create or replace function public.level_perks(p_level integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select to_jsonb(p) from (
        select * from (values
            ( 1,  5, 30,  300,  50),
            ( 5,  6, 30,  400,  50),
            (10,  7, 40,  500,  60),
            (16,  8, 40,  600,  70),
            (20,  9, 50,  800,  80),
            (25, 10, 50, 1000, 100)
        ) as t(level, open_requests, request_films, list_films, lists)
        where t.level <= greatest(coalesce(p_level, 1), 1)
        order by t.level desc
        limit 1
    ) p;
$$;

-- Výhody uživatele: { level, xp, perks: {…}, next: { level, perks } | null } (Edge Function requests)
create or replace function public.user_perks(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_level integer := public.user_level(p_user);
    v_next jsonb;
begin
    select to_jsonb(n) into v_next from (
        select t.level from (values (5), (10), (16), (20), (25)) as t(level)
        where t.level > v_level order by t.level limit 1
    ) n;
    return jsonb_build_object(
        'level', v_level,
        'xp', (select p.xp from public.user_progress p where p.user_id = p_user),
        'perks', public.level_perks(v_level),
        'next', case when v_next is null then null
                     else public.level_perks((v_next->>'level')::integer) end
    );
end;
$$;

revoke execute on function public.user_perks(uuid) from public, anon, authenticated;
grant execute on function public.user_perks(uuid) to service_role;

-- Totéž pro přihlášeného uživatele (web – co smí a co odemkne další úroveň)
create or replace function public.my_perks()
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select case when auth.uid() is null then null else public.user_perks(auth.uid()) end;
$$;

grant execute on function public.my_perks() to authenticated;

-- Jeden limit uživatele (triggery seznamů): open_requests, request_films, list_films, lists
create or replace function public.user_limit(p_user uuid, p_perk text)
returns integer
language sql
security definer
set search_path = ''
as $$
    select (public.level_perks(public.user_level(p_user)) ->> p_perk)::integer;
$$;

revoke execute on function public.user_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.user_limit(uuid, text) to service_role;

-- Limity seznamů podle úrovně (dřív pevně 50 seznamů a 300 filmů v seznamu)
create or replace function public.check_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_limit integer;
begin
    -- Počítadlo zobrazení a čas úpravy (při přidání filmu) se mění bez kontroly textu
    if tg_op = 'UPDATE'
       and row(new.title, new.description, new.visibility) is not distinct from row(old.title, old.description, old.visibility) then
        return new;
    end if;
    if not public.is_text_allowed(new.title) or not public.is_text_allowed(new.description) then
        raise exception 'list_text_not_allowed' using hint = 'The title or description contains a blocked word.';
    end if;
    if tg_op = 'INSERT' then
        v_limit := coalesce(public.user_limit(new.user_id, 'lists'), 50);
        if (select count(*) from public.lists l where l.user_id = new.user_id) >= v_limit then
            raise exception 'list_limit' using hint = format('You can have at most %s lists.', v_limit);
        end if;
    end if;
    new.title := btrim(new.title);
    new.description := nullif(btrim(coalesce(new.description, '')), '');
    new.updated_at := now();
    return new;
end;
$$;

create or replace function public.check_list_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_limit integer := coalesce(public.user_limit((select l.user_id from public.lists l where l.id = new.list_id), 'list_films'), 300);
begin
    if (select count(*) from public.list_items i where i.list_id = new.list_id) >= v_limit then
        raise exception 'list_items_limit' using hint = format('A list can have at most %s movies.', v_limit);
    end if;
    if not public.is_text_allowed(new.note) then
        raise exception 'list_text_not_allowed';
    end if;
    -- bez pozice → na konec seznamu
    if new.position is null or new.position = 0 then
        new.position := coalesce((select max(i.position) from public.list_items i where i.list_id = new.list_id), 0) + 1;
    end if;
    update public.lists set updated_at = now() where id = new.list_id;
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Odznaky uživatelů (Elite) – jen ozdoba, přiděluje správce
-- ---------------------------------------------------------------------
create table if not exists public.user_badges (
    user_id     uuid        not null references public.profiles (id) on delete cascade,
    badge       text        not null check (badge in ('elite')),
    granted_at  timestamptz not null default now(),
    primary key (user_id, badge)
);

comment on table public.user_badges is 'Odznaky uživatelů (V4.4) – elite; přiděluje a odebírá jen správce';

alter table public.user_badges enable row level security;

drop policy if exists "Badges are public" on public.user_badges;
create policy "Badges are public"
    on public.user_badges for select
    using (true);

drop policy if exists "Admins can grant badges" on public.user_badges;
create policy "Admins can grant badges"
    on public.user_badges for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists "Admins can remove badges" on public.user_badges;
create policy "Admins can remove badges"
    on public.user_badges for delete
    to authenticated
    using (public.is_admin());

grant select on public.user_badges to anon, authenticated;
grant insert, delete on public.user_badges to authenticated;
grant all on public.user_badges to service_role;

-- Odznaky podle nicků (profil, přátelé, autoři seznamů): jen nick a odznaky, nic dalšího
create or replace function public.badges_for(p_usernames text[])
returns table (username text, badges text[])
language sql
stable
security definer
set search_path = ''
as $$
    select p.username, array_agg(b.badge order by b.badge)
    from public.user_badges b
    join public.profiles p on p.id = b.user_id
    where p.username = any(p_usernames)
    group by p.username;
$$;

grant execute on function public.badges_for(text[]) to anon, authenticated;

notify pgrst, 'reload schema';

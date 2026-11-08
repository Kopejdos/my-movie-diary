-- =====================================================================
-- V3.5.4 – komunita
--
-- • Veřejné seznamy (public, aspoň 3 filmy) se dají najít v hledání a na
--   přehledu v sekci Community (top podle zobrazení, řídí se filtry).
-- • Nevhodný seznam jde nahlásit (jedno nahlášení na uživatele a seznam).
-- • Správce nahlášený seznam skryje (lists.hidden) – pak ho vidí jen autor
--   a správce; nebo nahlášení zamítne.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Skrytí seznamu správcem
-- ---------------------------------------------------------------------
alter table public.lists
    add column if not exists hidden boolean not null default false;

comment on column public.lists.hidden is 'Skrytý správcem (nahlášení) – vidí ho jen autor a správce (V3.5.4)';

-- Smím seznam vidět – i se skrytím (skrytý jen autor a správce)
create function public.can_view_list_row(p_owner uuid, p_visibility text, p_hidden boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.can_view_list(p_owner, p_visibility)
       and (not p_hidden or p_owner = auth.uid() or public.is_admin());
$$;
revoke execute on function public.can_view_list_row(uuid, text, boolean) from public;
grant execute on function public.can_view_list_row(uuid, text, boolean) to anon, authenticated;

drop policy if exists "Read visible lists" on public.lists;
create policy "Read visible lists"
    on public.lists for select to anon, authenticated
    using (public.can_view_list_row(user_id, visibility, hidden));

create or replace function public.list_visible(p_list_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.lists l
        where l.id = p_list_id and public.can_view_list_row(l.user_id, l.visibility, l.hidden)
    );
$$;

create or replace function public.register_list_view(p_list_id bigint, p_anon_id text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_list public.lists;
    v_key text;
    v_day date;
    v_count integer;
begin
    select * into v_list from public.lists where id = p_list_id;
    if v_list.id is null or not public.can_view_list_row(v_list.user_id, v_list.visibility, v_list.hidden) then
        return null;
    end if;
    if auth.uid() is not null then
        if auth.uid() = v_list.user_id then
            return v_list.view_count;
        end if;
        v_key := 'u:' || auth.uid()::text;
        v_day := date '2000-01-01';
    elsif p_anon_id ~ '^[A-Za-z0-9-]{8,64}$' then
        v_key := 'a:' || p_anon_id;
        v_day := current_date;
    else
        return v_list.view_count;
    end if;

    insert into public.list_views (list_id, viewer_key, viewed_on)
    values (p_list_id, v_key, v_day)
    on conflict do nothing;
    if found then
        update public.lists set view_count = view_count + 1 where id = p_list_id
        returning view_count into v_count;
        return v_count;
    end if;
    return v_list.view_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 1b. Nahlášení seznamu (tabulka musí být před list_info)
-- ---------------------------------------------------------------------
create table public.list_reports (
    id           bigint generated always as identity primary key,
    list_id      bigint not null references public.lists (id) on delete cascade,
    reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
    reason       text not null check (reason in ('offensive', 'spam', 'spoilers', 'other')),
    note         text check (char_length(note) <= 300),
    status       text not null default 'open' check (status in ('open', 'dismissed', 'hidden')),
    created_at   timestamptz not null default now(),
    unique (list_id, reporter_id)
);
create index list_reports_open_idx on public.list_reports (list_id) where status = 'open';

alter table public.list_reports enable row level security;

-- Nahlásit jde cizí seznam, který vidím (vlastní ne)
create policy "Report visible lists"
    on public.list_reports for insert to authenticated
    with check (
        reporter_id = auth.uid()
        and public.list_visible(list_id)
        and not public.owns_list(list_id)
    );

create policy "Read own reports"
    on public.list_reports for select to authenticated
    using (reporter_id = auth.uid() or public.is_admin());

grant select on public.list_reports to authenticated;
grant insert (list_id, reason, note) on public.list_reports to authenticated;

create or replace function public.list_info(p_list_id bigint)
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select json_build_object(
        'id', l.id, 'title', l.title, 'description', l.description, 'visibility', l.visibility,
        'view_count', l.view_count, 'created_at', l.created_at, 'updated_at', l.updated_at,
        'username', p.username, 'is_mine', l.user_id = auth.uid(), 'hidden', l.hidden,
        'reported', exists (select 1 from public.list_reports r where r.list_id = l.id and r.reporter_id = auth.uid()),
        'categories', coalesce((select json_agg(c.category_id) from public.list_categories c where c.list_id = l.id), '[]'::json)
    )
    from public.lists l
    join public.profiles p on p.id = l.user_id
    where l.id = p_list_id and public.can_view_list_row(l.user_id, l.visibility, l.hidden);
$$;

drop function if exists public.user_lists(text);
create function public.user_lists(p_username text)
returns table (
    id bigint, title text, description text, visibility text, view_count integer,
    updated_at timestamptz, item_count integer, posters text[], is_mine boolean, hidden boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select l.id, l.title, l.description, l.visibility, l.view_count, l.updated_at,
           (select count(*)::integer from public.list_items i where i.list_id = l.id),
           array(select f.poster_path from public.list_items i join public.films f on f.tmdb_id = i.tmdb_id
                 where i.list_id = l.id and f.poster_path is not null order by i.position limit 4),
           l.user_id = auth.uid(),
           l.hidden
    from public.lists l
    join public.profiles p on p.id = l.user_id
    where lower(p.username) = lower(btrim(p_username))
      and public.can_view_list_row(l.user_id, l.visibility, l.hidden)
    order by l.updated_at desc;
$$;
revoke execute on function public.user_lists(text) from public;
grant execute on function public.user_lists(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Komunita: veřejné, neskryté seznamy s aspoň 3 filmy, od nejvíc zobrazených
--    (přehled – sekce Community, hledání). Kategorie jako id – filtr si dělá web.
-- ---------------------------------------------------------------------
create function public.community_lists(p_limit integer default 200)
returns table (
    id bigint, title text, description text, username text, view_count integer,
    updated_at timestamptz, item_count integer, posters text[], category_ids bigint[]
)
language sql
stable
security definer
set search_path = ''
as $$
    select l.id, l.title, l.description, p.username, l.view_count, l.updated_at,
           counts.n,
           array(select f.poster_path from public.list_items i join public.films f on f.tmdb_id = i.tmdb_id
                 where i.list_id = l.id and f.poster_path is not null order by i.position limit 4),
           array(select c.category_id from public.list_categories c where c.list_id = l.id order by c.category_id)
    from public.lists l
    join public.profiles p on p.id = l.user_id
    cross join lateral (select count(*)::integer as n from public.list_items i where i.list_id = l.id) counts
    where l.visibility = 'public' and not l.hidden and counts.n >= 3
    order by l.view_count desc, l.updated_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;
revoke execute on function public.community_lists(integer) from public;
grant execute on function public.community_lists(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Správce: nahlášené a skryté seznamy, skrytí, zamítnutí
-- ---------------------------------------------------------------------
create function public.admin_reported_lists()
returns table (
    id bigint, title text, description text, username text, visibility text, hidden boolean,
    item_count integer, open_reports integer, reasons text[], notes text[], last_report timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Administrators only';
    end if;
    return query
    select l.id, l.title, l.description, p.username, l.visibility, l.hidden,
           (select count(*)::integer from public.list_items i where i.list_id = l.id),
           (select count(*)::integer from public.list_reports r where r.list_id = l.id and r.status = 'open'),
           array(select r.reason from public.list_reports r where r.list_id = l.id and r.status = 'open' order by r.created_at),
           array(select r.note from public.list_reports r where r.list_id = l.id and r.status = 'open' and r.note is not null order by r.created_at),
           (select max(r.created_at) from public.list_reports r where r.list_id = l.id)
    from public.lists l
    join public.profiles p on p.id = l.user_id
    where l.hidden
       or exists (select 1 from public.list_reports r where r.list_id = l.id and r.status = 'open')
    order by l.hidden, 11 desc nulls last;
end;
$$;
revoke execute on function public.admin_reported_lists() from public, anon;
grant execute on function public.admin_reported_lists() to authenticated;

-- Skrýt / zobrazit seznam; otevřená nahlášení se uzavřou (hidden / dismissed)
create function public.admin_moderate_list(p_list_id bigint, p_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_admin() then
        raise exception 'Administrators only';
    end if;
    update public.lists set hidden = p_hide where id = p_list_id;
    update public.list_reports
    set status = case when p_hide then 'hidden' else 'dismissed' end
    where list_id = p_list_id and status = 'open';
end;
$$;
revoke execute on function public.admin_moderate_list(bigint, boolean) from public, anon;
grant execute on function public.admin_moderate_list(bigint, boolean) to authenticated;

notify pgrst, 'reload schema';

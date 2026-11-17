-- =====================================================================
-- V4.1.3 – komunita: poctivá zobrazení, trendy a sledování seznamů
--
-- • Počty zobrazení začínají znovu od nuly (testovací seznamy měly vymyšlená
--   čísla). Přihlášený se dál počítá jednou za celou dobu, nepřihlášený jednou
--   za den, autor nikdy – nově se ale u každého ukládá den návštěvy, aby šlo
--   počítat „lidé za posledních 30 dní“.
-- • Komunita se řadí podle trendu: různí lidé za 30 dní + 3 × počet sledujících.
--   Seznam, na který měsíc nikdo nepřijde, klesá.
-- • Sledování seznamu (☆ Follow): záložka, aby se oblíbené seznamy neztratily;
--   „Updated“, když autor seznam od poslední návštěvy změnil. Sledují se
--   seznamy, ne lidé (lidé jsou přátelé).
-- Jde spustit i opakovaně (vynulování proběhne jen poprvé).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Zobrazení od nuly
-- ---------------------------------------------------------------------
-- jen při prvním spuštění (pak už tabulka list_follows existuje) – opakované spuštění
-- migrace opravdové počty nesmaže
do $$
begin
    if to_regclass('public.list_follows') is null then
        delete from public.list_views;
        update public.lists set view_count = 0 where view_count <> 0;
    end if;
end;
$$;

-- dotazy „za posledních 30 dní“ podle seznamu a dne
create index if not exists list_views_recent_idx on public.list_views (list_id, viewed_on);

comment on column public.list_views.viewed_on is 'Den návštěvy (od V4.1.3 i u přihlášených – kvůli trendu za 30 dní)';

-- ---------------------------------------------------------------------
-- 2. Sledování seznamů
-- ---------------------------------------------------------------------
create table if not exists public.list_follows (
    list_id      bigint not null references public.lists (id) on delete cascade,
    user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),    -- poslední návštěva seznamu (kvůli „Updated“)
    primary key (list_id, user_id)
);
create index if not exists list_follows_user_idx on public.list_follows (user_id);

comment on table public.list_follows is 'Sledované seznamy uživatelů (V4.1.3) – záložky; mění se jen přes funkce';

alter table public.list_follows enable row level security;

drop policy if exists "Read own follows" on public.list_follows;
create policy "Read own follows"
    on public.list_follows for select to authenticated
    using (user_id = (select auth.uid()));

grant select on public.list_follows to authenticated;

-- Změna seznamu = i odebraný film (dřív se čas úpravy posouval jen při přidání)
create or replace function public.touch_list_after_item_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.lists set updated_at = now() where id = old.list_id;
    return old;
end;
$$;

drop trigger if exists list_items_touch_delete on public.list_items;
create trigger list_items_touch_delete
    after delete on public.list_items
    for each row execute function public.touch_list_after_item_delete();

-- Sledovat / přestat sledovat (vlastní seznam ani neviditelný sledovat nejde)
create or replace function public.follow_list(p_list_id bigint, p_follow boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_list public.lists;
begin
    if auth.uid() is null then
        raise exception 'not_signed_in';
    end if;
    if not p_follow then
        delete from public.list_follows where list_id = p_list_id and user_id = auth.uid();
    else
        select * into v_list from public.lists where id = p_list_id;
        if v_list.id is null or not public.can_view_list_row(v_list.user_id, v_list.visibility, v_list.hidden) then
            raise exception 'list_not_found';
        end if;
        if v_list.user_id = auth.uid() then
            raise exception 'list_own' using hint = 'You cannot follow your own list.';
        end if;
        if (select count(*) from public.list_follows f where f.user_id = auth.uid()) >= 200 then
            raise exception 'follow_limit' using hint = 'You can follow at most 200 lists.';
        end if;
        insert into public.list_follows (list_id, user_id) values (p_list_id, auth.uid())
        on conflict do nothing;
    end if;
    return (select count(*)::integer from public.list_follows f where f.list_id = p_list_id);
end;
$$;
revoke execute on function public.follow_list(bigint, boolean) from public;
grant execute on function public.follow_list(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Zobrazení: den návštěvy i u přihlášených, sledujícímu „viděno teď“
-- ---------------------------------------------------------------------
create or replace function public.register_list_view(p_list_id bigint, p_anon_id text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_list public.lists;
    v_key text;
    v_first boolean;
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
        -- sledující viděl seznam teď → zmizí „Updated“
        update public.list_follows set last_seen_at = now()
        where list_id = p_list_id and user_id = auth.uid();
        v_key := 'u:' || auth.uid()::text;
        -- do počtu jednou navždy, do trendu každý den návštěvy
        v_first := not exists (select 1 from public.list_views v where v.list_id = p_list_id and v.viewer_key = v_key);
        insert into public.list_views (list_id, viewer_key, viewed_on)
        values (p_list_id, v_key, current_date)
        on conflict do nothing;
    elsif p_anon_id ~ '^[A-Za-z0-9-]{8,64}$' then
        v_key := 'a:' || p_anon_id;
        insert into public.list_views (list_id, viewer_key, viewed_on)
        values (p_list_id, v_key, current_date)
        on conflict do nothing;
        v_first := found;              -- nepřihlášený: jednou za den
    else
        return v_list.view_count;
    end if;

    if v_first then
        update public.lists set view_count = view_count + 1 where id = p_list_id
        returning view_count into v_count;
        return v_count;
    end if;
    return v_list.view_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Detail seznamu: počet sledujících a jestli ho sleduju
-- ---------------------------------------------------------------------
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
        'categories', coalesce((select json_agg(c.category_id) from public.list_categories c where c.list_id = l.id), '[]'::json),
        'follower_count', (select count(*) from public.list_follows f where f.list_id = l.id),
        'is_following', exists (select 1 from public.list_follows f where f.list_id = l.id and f.user_id = auth.uid())
    )
    from public.lists l
    join public.profiles p on p.id = l.user_id
    where l.id = p_list_id and public.can_view_list_row(l.user_id, l.visibility, l.hidden);
$$;

-- ---------------------------------------------------------------------
-- 5. Komunita podle trendu (+ počet sledujících pro kartu)
-- ---------------------------------------------------------------------
drop function if exists public.community_lists(integer);
create function public.community_lists(p_limit integer default 200)
returns table (
    id bigint, title text, description text, username text, view_count integer,
    updated_at timestamptz, item_count integer, posters text[], category_ids bigint[],
    follower_count integer, recent_viewers integer
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
           array(select c.category_id from public.list_categories c where c.list_id = l.id order by c.category_id),
           followers.n,
           recent.n
    from public.lists l
    join public.profiles p on p.id = l.user_id
    cross join lateral (select count(*)::integer as n from public.list_items i where i.list_id = l.id) counts
    cross join lateral (select count(*)::integer as n from public.list_follows f where f.list_id = l.id) followers
    cross join lateral (
        select count(distinct v.viewer_key)::integer as n from public.list_views v
        where v.list_id = l.id and v.viewed_on >= current_date - 30
    ) recent
    where l.visibility = 'public' and not l.hidden and counts.n >= 3
    -- trend: lidé za posledních 30 dní + 3 body za každého sledujícího
    order by recent.n + 3 * followers.n desc, l.view_count desc, l.updated_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;
revoke execute on function public.community_lists(integer) from public;
grant execute on function public.community_lists(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Moje sledované seznamy (záložka Lists v profilu)
-- ---------------------------------------------------------------------
create or replace function public.my_followed_lists()
returns table (
    id bigint, title text, description text, username text, visibility text, view_count integer,
    updated_at timestamptz, item_count integer, posters text[], follower_count integer, has_update boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select l.id, l.title, l.description, p.username, l.visibility, l.view_count, l.updated_at,
           (select count(*)::integer from public.list_items i where i.list_id = l.id),
           array(select f.poster_path from public.list_items i join public.films f on f.tmdb_id = i.tmdb_id
                 where i.list_id = l.id and f.poster_path is not null order by i.position limit 4),
           (select count(*)::integer from public.list_follows x where x.list_id = l.id),
           l.updated_at > lf.last_seen_at
    from public.list_follows lf
    join public.lists l on l.id = lf.list_id
    join public.profiles p on p.id = l.user_id
    where lf.user_id = auth.uid()
      and public.can_view_list_row(l.user_id, l.visibility, l.hidden)
    order by (l.updated_at > lf.last_seen_at) desc, l.updated_at desc;
$$;
revoke execute on function public.my_followed_lists() from public;
grant execute on function public.my_followed_lists() to authenticated;

notify pgrst, 'reload schema';

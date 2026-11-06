-- =====================================================================
-- V3.4.1 – přátelé
--
-- • Přátelství je VZÁJEMNÉ: žádost → druhý ji přijme (nebo odmítne).
--   Zrušit ho může kdokoli z dvojice.
-- • Na přátelství NENÍ potřeba veřejný profil. Požádat jde i soukromý účet
--   (najde se podle přesného nicku), ale cizí soukromý profil neukáže žádná
--   data – jen nick a tlačítko „Add friend“.
-- • Přátelé vidí profil toho druhého (achievementy, statistiky) i když je
--   soukromý. Veřejný profil zůstává pro sdílení s ostatními lidmi.
-- • Tabulka friendships se z webu jen čte (vlastní řádky). Zápisy jdou přes
--   funkce níže – pracují s nickem, ID účtů nikdy neopustí databázi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabulka
-- ---------------------------------------------------------------------
create table public.friendships (
    requester_id  uuid not null references public.profiles (id) on delete cascade,
    addressee_id  uuid not null references public.profiles (id) on delete cascade,
    status        text not null default 'pending' check (status in ('pending', 'accepted')),
    created_at    timestamptz not null default now(),
    responded_at  timestamptz,
    primary key (requester_id, addressee_id),
    check (requester_id <> addressee_id)
);

-- Jedna dvojice jen jednou (ne A→B i B→A zároveň)
create unique index friendships_pair_idx
    on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

create policy "Users can read own friendships"
    on public.friendships for select to authenticated
    using (auth.uid() in (requester_id, addressee_id));

grant select on public.friendships to authenticated;

-- ---------------------------------------------------------------------
-- 2. Pomocné funkce (jen pro funkce níže, web je volat nesmí)
-- ---------------------------------------------------------------------

-- Jsou dva účty přátelé?
create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select p_a is not null and p_b is not null and exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = p_a and f.addressee_id = p_b) or (f.requester_id = p_b and f.addressee_id = p_a))
    );
$$;

-- Vztah přihlášeného uživatele k účtu: none | friend | incoming | outgoing | self
create function public.friendship_state(p_other uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select case
        when auth.uid() is null then 'none'
        when p_other = auth.uid() then 'self'
        else coalesce((
            select case
                when f.status = 'accepted' then 'friend'
                when f.requester_id = auth.uid() then 'outgoing'
                else 'incoming'
            end
            from public.friendships f
            where (f.requester_id = auth.uid() and f.addressee_id = p_other)
               or (f.requester_id = p_other and f.addressee_id = auth.uid())
        ), 'none')
    end;
$$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.friendship_state(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Akce (přihlášený uživatel, podle nicku)
-- ---------------------------------------------------------------------

-- Žádost o přátelství. Když mi ten druhý už žádost poslal, rovnou se přijme.
-- Vrací: sent | accepted | already_friends | already_sent | not_found | self | limit
create function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
    other uuid;
    existing public.friendships%rowtype;
begin
    if me is null then
        raise exception 'Not signed in';
    end if;

    select id into other from public.profiles where lower(username) = lower(btrim(p_username));
    if other is null then return 'not_found'; end if;
    if other = me then return 'self'; end if;

    select * into existing from public.friendships
    where (requester_id = me and addressee_id = other) or (requester_id = other and addressee_id = me);

    if found then
        if existing.status = 'accepted' then return 'already_friends'; end if;
        if existing.requester_id = me then return 'already_sent'; end if;
        update public.friendships set status = 'accepted', responded_at = now()
        where requester_id = other and addressee_id = me;
        return 'accepted';
    end if;

    -- Ochrana proti spamu: nejvýš 50 nevyřízených žádostí a 500 přátel
    if (select count(*) from public.friendships where requester_id = me and status = 'pending') >= 50
       or (select count(*) from public.friendships where me in (requester_id, addressee_id) and status = 'accepted') >= 500 then
        return 'limit';
    end if;

    insert into public.friendships (requester_id, addressee_id) values (me, other);
    return 'sent';
end;
$$;

-- Odpověď na žádost. Vrací: accepted | declined | not_found
create function public.respond_friend_request(p_username text, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
    other uuid;
begin
    if me is null then
        raise exception 'Not signed in';
    end if;
    select id into other from public.profiles where lower(username) = lower(btrim(p_username));
    if other is null then return 'not_found'; end if;

    if p_accept then
        update public.friendships set status = 'accepted', responded_at = now()
        where requester_id = other and addressee_id = me and status = 'pending';
        return case when found then 'accepted' else 'not_found' end;
    end if;

    delete from public.friendships
    where requester_id = other and addressee_id = me and status = 'pending';
    return case when found then 'declined' else 'not_found' end;
end;
$$;

-- Zrušení vztahu: odebrání přítele, zrušení odeslané i odmítnutí přijaté žádosti.
-- Vrací: removed | not_found
create function public.remove_friend(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
    other uuid;
begin
    if me is null then
        raise exception 'Not signed in';
    end if;
    select id into other from public.profiles where lower(username) = lower(btrim(p_username));
    if other is null then return 'not_found'; end if;

    delete from public.friendships
    where (requester_id = me and addressee_id = other) or (requester_id = other and addressee_id = me);
    return case when found then 'removed' else 'not_found' end;
end;
$$;

-- Moji přátelé a žádosti: nick, stav (friend | incoming | outgoing), od kdy
create function public.my_friends()
returns table (username text, state text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    select p.username,
           case
               when f.status = 'accepted' then 'friend'
               when f.requester_id = auth.uid() then 'outgoing'
               else 'incoming'
           end,
           coalesce(f.responded_at, f.created_at)
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    where auth.uid() in (f.requester_id, f.addressee_id)
    order by lower(p.username);
$$;

revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(text, boolean) from public, anon;
revoke execute on function public.remove_friend(text) from public, anon;
revoke execute on function public.my_friends() from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(text, boolean) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.my_friends() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Profil podle nicku – nově i pro přátele
--    • veřejný profil, nebo profil přítele → plná data + friendship
--    • cizí soukromý profil (jen pro přihlášené) → { username, private: true, friendship }
--      bez jakýchkoli dalších údajů
--    • nepřihlášený u soukromého profilu → null (jako dřív)
--    • vlastní soukromý profil → null (web nabídne nastavení, jako dřív)
-- ---------------------------------------------------------------------
create or replace function public.public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    target public.profiles%rowtype;
begin
    select * into target from public.profiles where lower(username) = lower(p_username);
    if not found then return null; end if;

    if not (target.is_public or public.are_friends(auth.uid(), target.id)) then
        if auth.uid() is null or target.id = auth.uid() then return null; end if;
        return jsonb_build_object(
            'username', target.username,
            'private', true,
            'friendship', public.friendship_state(target.id));
    end if;

    return jsonb_build_object(
        'username', target.username,
        'member_since', target.created_at,
        'is_public', target.is_public,          -- soukromý profil přítele: web skryje „Share“
        'friendship', public.friendship_state(target.id),
        'watches', coalesce((
            select jsonb_agg(
                jsonb_build_object(
                    'tmdb_id', w.tmdb_id,
                    'watched_on', w.watched_on,
                    'created_at', w.created_at,
                    'film', jsonb_build_object(
                        'title', f.title,
                        'poster_path', f.poster_path,
                        'release_date', f.release_date,
                        'runtime', f.runtime
                    )
                )
                order by w.watched_on, w.created_at, w.id
            )
            from public.watches w
            join public.films f on f.tmdb_id = w.tmdb_id
            where w.user_id = target.id
        ), '[]'::jsonb)
    );
end;
$$;

revoke execute on function public.public_profile(text) from public;
grant  execute on function public.public_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Hledání lidí – veřejné profily a přátelé podle části nicku,
--    soukromý účet jen podle PŘESNÉHO nicku (a jen pro přihlášené).
--    member_since je vyplněné jen u profilů, které smím vidět.
-- ---------------------------------------------------------------------
create function public.search_people(p_query text)
returns table (username text, member_since timestamptz, visible boolean, friendship text)
language sql
stable
security definer
set search_path = ''
as $$
    with q as (select lower(btrim(p_query)) as text)
    select p.username,
           case when p.is_public or public.are_friends(auth.uid(), p.id) then p.created_at end,
           p.is_public or public.are_friends(auth.uid(), p.id),
           public.friendship_state(p.id)
    from public.profiles p, q
    where char_length(q.text) >= 2
      and (
          ((p.is_public or public.are_friends(auth.uid(), p.id)) and strpos(lower(p.username), q.text) > 0)
          or (auth.uid() is not null and lower(p.username) = q.text)
      )
    order by (lower(p.username) = q.text) desc, strpos(lower(p.username), q.text), lower(p.username)
    limit 10;
$$;

revoke execute on function public.search_people(text) from public;
grant  execute on function public.search_people(text) to anon, authenticated;

notify pgrst, 'reload schema';

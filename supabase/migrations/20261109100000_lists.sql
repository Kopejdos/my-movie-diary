-- =====================================================================
-- V3.5.3 – vlastní seznamy
--
-- • Seznam si udělá každý přihlášený uživatel – jen z filmů, které už jsou
--   v databázi (tabulka films), bez požadavku.
-- • Název, popis, 1–3 kategorie (kvůli filtru v komunitě, V3.5.4), vlastní pořadí.
-- • Viditelnost: private (jen autor) / friends (autor a jeho přátelé) / public (všichni).
-- • Kdo seznam otevře, vidí v něm svůj postup (počítá web z vlastních zhlédnutí).
-- • Počítadlo zobrazení: jedno na přihlášeného uživatele navždy, nepřihlášený
--   jednou za den (podle náhodného ID prohlížeče); autor se nepočítá.
-- • Název a popis projdou filtrem zakázaných slov (jako nicky).
-- • Limity: 50 seznamů na uživatele, 300 filmů v seznamu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabulky
-- ---------------------------------------------------------------------
create table public.lists (
    id           bigint generated always as identity primary key,
    user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
    title        text not null check (char_length(btrim(title)) between 1 and 80),
    description  text check (char_length(description) <= 500),
    visibility   text not null default 'private' check (visibility in ('private', 'friends', 'public')),
    view_count   integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
create index lists_user_idx on public.lists (user_id);
create index lists_public_idx on public.lists (view_count desc) where visibility = 'public';

create table public.list_items (
    list_id    bigint not null references public.lists (id) on delete cascade,
    tmdb_id    integer not null references public.films (tmdb_id) on delete cascade,
    position   integer not null default 0,
    note       text check (char_length(note) <= 300),
    added_at   timestamptz not null default now(),
    primary key (list_id, tmdb_id)
);
create index list_items_tmdb_idx on public.list_items (tmdb_id);

create table public.list_categories (
    list_id      bigint not null references public.lists (id) on delete cascade,
    category_id  bigint not null references public.categories (id) on delete cascade,
    primary key (list_id, category_id)
);

create table public.list_views (
    list_id     bigint not null references public.lists (id) on delete cascade,
    viewer_key  text not null,               -- 'u:<uuid>' nebo 'a:<id prohlížeče>'
    viewed_on   date not null,               -- přihlášený: pevné datum (počítá se jednou navždy)
    primary key (list_id, viewer_key, viewed_on)
);

comment on table public.lists is 'Vlastní seznamy uživatelů (V3.5.3)';
comment on column public.lists.visibility is 'private = jen autor, friends = autor a přátelé, public = všichni';

-- ---------------------------------------------------------------------
-- 2. Kdo seznam vidí (security definer – používá are_friends, které web volat nesmí)
-- ---------------------------------------------------------------------
create function public.can_view_list(p_owner uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select p_visibility = 'public'
        or p_owner = auth.uid()
        or (p_visibility = 'friends' and public.are_friends(p_owner, auth.uid()))
        or public.is_admin();
$$;
revoke execute on function public.can_view_list(uuid, text) from public;
grant execute on function public.can_view_list(uuid, text) to anon, authenticated;

-- Je seznam můj? (pro pravidla položek a kategorií)
create function public.owns_list(p_list_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.lists l where l.id = p_list_id and l.user_id = auth.uid());
$$;
revoke execute on function public.owns_list(bigint) from public, anon;
grant execute on function public.owns_list(bigint) to authenticated;

-- Smím seznam vidět? (podle id – pro položky a kategorie)
create function public.list_visible(p_list_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.lists l
        where l.id = p_list_id and public.can_view_list(l.user_id, l.visibility)
    );
$$;
revoke execute on function public.list_visible(bigint) from public;
grant execute on function public.list_visible(bigint) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Přístupová pravidla
-- ---------------------------------------------------------------------
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.list_categories enable row level security;
alter table public.list_views enable row level security;      -- jen přes register_list_view

create policy "Read visible lists"
    on public.lists for select to anon, authenticated
    using (public.can_view_list(user_id, visibility));

create policy "Create own lists"
    on public.lists for insert to authenticated
    with check (user_id = auth.uid());

create policy "Edit own lists"
    on public.lists for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "Delete own lists"
    on public.lists for delete to authenticated
    using (user_id = auth.uid() or public.is_admin());

create policy "Read items of visible lists"
    on public.list_items for select to anon, authenticated
    using (public.list_visible(list_id));

create policy "Add items to own lists"
    on public.list_items for insert to authenticated
    with check (public.owns_list(list_id));

create policy "Edit items of own lists"
    on public.list_items for update to authenticated
    using (public.owns_list(list_id))
    with check (public.owns_list(list_id));

create policy "Remove items from own lists"
    on public.list_items for delete to authenticated
    using (public.owns_list(list_id));

create policy "Read categories of visible lists"
    on public.list_categories for select to anon, authenticated
    using (public.list_visible(list_id));

create policy "Set categories of own lists"
    on public.list_categories for insert to authenticated
    with check (public.owns_list(list_id));

create policy "Remove categories of own lists"
    on public.list_categories for delete to authenticated
    using (public.owns_list(list_id));

grant select on public.lists, public.list_items, public.list_categories to anon;
-- Jen vybrané sloupce: počítadlo zobrazení mění jen register_list_view, autor ho nastavit nesmí
grant select, delete on public.lists to authenticated;
grant insert (title, description, visibility) on public.lists to authenticated;
grant update (title, description, visibility) on public.lists to authenticated;
grant select, delete on public.list_items to authenticated;
grant insert (list_id, tmdb_id, position, note) on public.list_items to authenticated;
grant update (position, note) on public.list_items to authenticated;
grant select, insert, delete on public.list_categories to authenticated;

-- ---------------------------------------------------------------------
-- 4. Kontroly: zakázaná slova, limity, nejvýš 3 kategorie, čas úpravy
-- ---------------------------------------------------------------------
-- Text je povolený, když žádné jeho slovo není zakázané:
--   exact    → slovo se rovná zakázanému,
--   contains → slovo zakázané obsahuje (u zakázaných slov kratších než 4 znaky
--              jen celé slovo – ať „ass“ nezablokuje „Assassin“).
create function public.is_text_allowed(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1
        from regexp_split_to_table(lower(coalesce(p_text, '')), '[^[:alnum:]]+') as t(token)
        cross join public.blocked_words b
        where t.token <> ''
          and (
              public.normalize_username(t.token) = public.normalize_username(b.word)
              or (b.match_mode = 'contains'
                  and char_length(b.word) >= 4
                  and strpos(public.normalize_username(t.token), public.normalize_username(b.word)) > 0)
          )
    );
$$;
revoke execute on function public.is_text_allowed(text) from public;
grant execute on function public.is_text_allowed(text) to anon, authenticated;

create function public.check_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    -- Počítadlo zobrazení a čas úpravy (při přidání filmu) se mění bez kontroly textu
    if tg_op = 'UPDATE'
       and row(new.title, new.description, new.visibility) is not distinct from row(old.title, old.description, old.visibility) then
        return new;
    end if;
    if not public.is_text_allowed(new.title) or not public.is_text_allowed(new.description) then
        raise exception 'list_text_not_allowed' using hint = 'The title or description contains a blocked word.';
    end if;
    if tg_op = 'INSERT' and (select count(*) from public.lists l where l.user_id = new.user_id) >= 50 then
        raise exception 'list_limit' using hint = 'You can have at most 50 lists.';
    end if;
    new.title := btrim(new.title);
    new.description := nullif(btrim(coalesce(new.description, '')), '');
    new.updated_at := now();
    return new;
end;
$$;

create trigger lists_check
    before insert or update on public.lists
    for each row execute function public.check_list();

create function public.check_list_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select count(*) from public.list_items i where i.list_id = new.list_id) >= 300 then
        raise exception 'list_items_limit' using hint = 'A list can have at most 300 movies.';
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

create trigger list_items_check
    before insert on public.list_items
    for each row execute function public.check_list_item();

create function public.check_list_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (select count(*) from public.list_categories c where c.list_id = new.list_id) >= 3 then
        raise exception 'list_categories_limit' using hint = 'A list can have at most 3 categories.';
    end if;
    return new;
end;
$$;

create trigger list_categories_check
    before insert on public.list_categories
    for each row execute function public.check_list_category();

revoke execute on function public.check_list() from public, anon, authenticated;
revoke execute on function public.check_list_item() from public, anon, authenticated;
revoke execute on function public.check_list_category() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Zobrazení seznamu (počítadlo)
--    Přihlášený se započítá jednou navždy, nepřihlášený jednou za den
--    (p_anon_id = náhodné ID prohlížeče). Autor se nepočítá.
--    Vrací aktuální počet zobrazení.
-- ---------------------------------------------------------------------
create function public.register_list_view(p_list_id bigint, p_anon_id text default null)
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
    if v_list.id is null or not public.can_view_list(v_list.user_id, v_list.visibility) then
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
revoke execute on function public.register_list_view(bigint, text) from public;
grant execute on function public.register_list_view(bigint, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Čtení pro web (profily jsou jinak vidět jen samému sobě)
-- ---------------------------------------------------------------------
-- Údaje o seznamu včetně přezdívky autora; null = seznam neexistuje nebo ho nesmím vidět
create function public.list_info(p_list_id bigint)
returns json
language sql
stable
security definer
set search_path = ''
as $$
    select json_build_object(
        'id', l.id, 'title', l.title, 'description', l.description, 'visibility', l.visibility,
        'view_count', l.view_count, 'created_at', l.created_at, 'updated_at', l.updated_at,
        'username', p.username, 'is_mine', l.user_id = auth.uid(),
        'categories', coalesce((select json_agg(c.category_id) from public.list_categories c where c.list_id = l.id), '[]'::json)
    )
    from public.lists l
    join public.profiles p on p.id = l.user_id
    where l.id = p_list_id and public.can_view_list(l.user_id, l.visibility);
$$;
revoke execute on function public.list_info(bigint) from public;
grant execute on function public.list_info(bigint) to anon, authenticated;

-- Seznamy uživatele, které smím vidět (profil, moje seznamy); plakáty prvních 4 filmů na obálku
create function public.user_lists(p_username text)
returns table (
    id bigint, title text, description text, visibility text, view_count integer,
    updated_at timestamptz, item_count integer, posters text[], is_mine boolean
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
           l.user_id = auth.uid()
    from public.lists l
    join public.profiles p on p.id = l.user_id
    where lower(p.username) = lower(btrim(p_username))
      and public.can_view_list(l.user_id, l.visibility)
    order by l.updated_at desc;
$$;
revoke execute on function public.user_lists(text) from public;
grant execute on function public.user_lists(text) to anon, authenticated;

-- Moje seznamy pro tlačítko „+ List“ u filmu: je v nich už tenhle film?
create function public.my_lists_for_film(p_tmdb_id integer)
returns table (id bigint, title text, visibility text, item_count integer, has_film boolean)
language sql
stable
security definer
set search_path = ''
as $$
    select l.id, l.title, l.visibility,
           (select count(*)::integer from public.list_items i where i.list_id = l.id),
           exists (select 1 from public.list_items i where i.list_id = l.id and i.tmdb_id = p_tmdb_id)
    from public.lists l
    where l.user_id = auth.uid()
    order by l.updated_at desc;
$$;
revoke execute on function public.my_lists_for_film(integer) from public, anon;
grant execute on function public.my_lists_for_film(integer) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- My Movie Diary – editor kolekce s jedním Save a požadavky s atributy (V4.3.1)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- 1. admin_save_collection – admin panel sbírá změny kolekce (údaje, kategorie, obal, filmy:
--    oddíl, série, popisek, pořadí v příběhu, volitelný, poznámka, pořadí, přidání, odebrání)
--    a uloží je NAJEDNOU v jedné transakci. Běží s právy přihlášeného správce (security
--    invoker) – platí pravidla RLS a triggery z V3.5.2.1 (značka 'admin' / 'app', záznam
--    o odebrání pro sync-seed) fungují stejně jako dřív při ukládání po jednom políčku.
--    Mění se jen řádky, které se opravdu změnily.
-- 2. Požadavky na kolekci: u filmů pořadí, oddíl (Section), série (Series) a popisek (Label);
--    nový druh 'custom' = vlastní kolekce z libovolných filmů (ne jen dílů jedné série TMDB).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Uložení kolekce najednou
--    p_universe   { name, description, color, kind, cover_tmdb_id } – jen změněné údaje, jinak null
--    p_categories ID kategorií (null = beze změny)
--    p_items      všechny filmy kolekce v novém pořadí:
--                 [{ id?, tmdb_id, group_label, franchise, label, story_order, is_optional, note }]
--                 bez id = nový film (musí už být v tabulce films – web ho předtím uloží přes
--                 Edge Function admin, akce add-film)
--    p_removed    ID odebraných položek
-- ---------------------------------------------------------------------
create or replace function public.admin_save_collection(
    p_universe_id bigint,
    p_universe    jsonb,
    p_categories  bigint[],
    p_items       jsonb,
    p_removed     bigint[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_item      jsonb;
    v_position  integer := 0;
    v_updated   integer := 0;
    v_inserted  integer := 0;
    v_removed   integer := 0;
    v_count     integer;
    v_group     text;
    v_franchise text;
    v_label     text;
    v_note      text;
    v_story     integer;
    v_optional  boolean;
begin
    if not public.is_admin() then
        raise exception 'forbidden' using errcode = '42501';
    end if;
    if not exists (select 1 from public.universes u where u.id = p_universe_id) then
        raise exception 'collection_not_found';
    end if;

    -- Údaje kolekce (jen poslané klíče)
    if p_universe is not null and p_universe <> '{}'::jsonb then
        if p_universe ? 'name' and nullif(btrim(p_universe->>'name'), '') is null then
            raise exception 'name_required';
        end if;
        update public.universes u set
            name          = case when p_universe ? 'name' then left(btrim(p_universe->>'name'), 80) else u.name end,
            description   = case when p_universe ? 'description'
                                 then nullif(left(btrim(coalesce(p_universe->>'description', '')), 200), '')
                                 else u.description end,
            color         = case when p_universe ? 'color' then p_universe->>'color' else u.color end,
            kind          = case when p_universe ? 'kind' then p_universe->>'kind' else u.kind end,
            cover_tmdb_id = case when p_universe ? 'cover_tmdb_id' then (p_universe->>'cover_tmdb_id')::integer else u.cover_tmdb_id end
        where u.id = p_universe_id;
    end if;

    -- Kategorie: odebrat nezaškrtnuté, přidat nové (beze změny = žádný zápis)
    if p_categories is not null then
        delete from public.universe_categories uc
        where uc.universe_id = p_universe_id and not (uc.category_id = any (p_categories));
        insert into public.universe_categories (universe_id, category_id)
        select p_universe_id, c.id
        from public.categories c
        where c.id = any (p_categories)
        on conflict do nothing;
    end if;

    -- Odebrané filmy (trigger zapíše záznam pro sync-seed)
    if p_removed is not null and cardinality(p_removed) > 0 then
        delete from public.universe_items i
        where i.universe_id = p_universe_id and i.id = any (p_removed);
        get diagnostics v_removed = row_count;
    end if;

    -- Filmy v novém pořadí: změněné řádky přepsat, nové vložit
    for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
        v_position  := v_position + 1;
        v_group     := nullif(left(btrim(coalesce(v_item->>'group_label', '')), 60), '');
        v_franchise := nullif(left(btrim(coalesce(v_item->>'franchise', '')), 60), '');
        v_label     := nullif(left(btrim(coalesce(v_item->>'label', '')), 60), '');
        v_note      := nullif(left(btrim(coalesce(v_item->>'note', '')), 300), '');
        v_story     := case when (v_item->>'story_order') ~ '^[0-9]{1,3}$' and (v_item->>'story_order')::integer > 0
                            then (v_item->>'story_order')::integer end;
        v_optional  := coalesce((v_item->>'is_optional')::boolean, false);

        if v_item->>'id' is not null then
            update public.universe_items i set
                release_order = v_position,
                group_label   = v_group,
                franchise     = v_franchise,
                label         = v_label,
                story_order   = v_story,
                is_optional   = v_optional,
                note          = v_note
            where i.id = (v_item->>'id')::bigint
              and i.universe_id = p_universe_id
              and row(i.release_order, i.group_label, i.franchise, i.label, i.story_order, i.is_optional, i.note)
                  is distinct from row(v_position, v_group, v_franchise, v_label, v_story, v_optional, v_note);
            get diagnostics v_count = row_count;
            v_updated := v_updated + v_count;
        else
            insert into public.universe_items
                (universe_id, tmdb_id, release_order, group_label, franchise, label, story_order, is_optional, note, is_upcoming)
            select p_universe_id, f.tmdb_id, v_position, v_group, v_franchise, v_label, v_story, v_optional, v_note,
                   coalesce(f.release_date > current_date, true)
            from public.films f
            where f.tmdb_id = (v_item->>'tmdb_id')::integer
            on conflict (universe_id, tmdb_id) do nothing;
            get diagnostics v_count = row_count;
            if v_count = 0 then
                raise exception 'film_not_saved' using hint = 'Movie ' || (v_item->>'tmdb_id') || ' is not in films or already in the collection.';
            end if;
            v_inserted := v_inserted + 1;
        end if;
    end loop;

    return jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'removed', v_removed);
end;
$$;

revoke execute on function public.admin_save_collection(bigint, jsonb, bigint[], jsonb, bigint[]) from public, anon;
grant execute on function public.admin_save_collection(bigint, jsonb, bigint[], jsonb, bigint[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Požadavky na kolekci s atributy a vlastní kolekce
-- ---------------------------------------------------------------------
alter table public.film_requests drop constraint if exists film_requests_kind_check;
alter table public.film_requests
    add constraint film_requests_kind_check check (kind in ('films', 'collection', 'custom'));

-- Vlastní kolekce musí mít název (série ho má z TMDB)
alter table public.film_requests drop constraint if exists film_requests_custom_name_check;
alter table public.film_requests
    add constraint film_requests_custom_name_check
    check (kind <> 'custom' or nullif(btrim(collection_name), '') is not null);

comment on column public.film_requests.kind is
    'films = libovolné filmy, collection = filmy z jedné série TMDB (V3.5.2), custom = vlastní kolekce z libovolných filmů (V4.3.1)';

alter table public.film_request_items
    add column if not exists position    smallint check (position between 1 and 999),
    add column if not exists group_label text check (char_length(group_label) <= 60),
    add column if not exists franchise   text check (char_length(franchise) <= 60),
    add column if not exists label       text check (char_length(label) <= 60);

comment on column public.film_request_items.position is 'Pořadí filmu v požadavku na kolekci (V4.3.1)';
comment on column public.film_request_items.group_label is 'Oddíl (Section) navržený uživatelem (V4.3.1)';
comment on column public.film_request_items.franchise is 'Série (Series) navržená uživatelem (V4.3.1)';
comment on column public.film_request_items.label is 'Popisek (Label) navržený uživatelem (V4.3.1)';

notify pgrst, 'reload schema';

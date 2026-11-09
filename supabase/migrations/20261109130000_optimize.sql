-- =====================================================================
-- V3.6.2 – optimalizace databáze (úklid před kapitolou 4)
--
-- 1. Pravidla RLS: auth.uid() a is_admin() obalené do (select …) – Postgres je pak
--    spočítá jednou za dotaz, ne pro každý řádek (doporučení Supabase „auth_rls_initplan“).
--    Přepíše se automaticky každé pravidlo ve schématu public, které je volá napřímo;
--    význam pravidel se nemění.
-- 2. Indexy pro cizí klíče, podle kterých se hledá nebo maže (film v kolekcích,
--    mazání filmu, nahlášení…).
-- 3. Úklid: sloupec universes.owner_id (nápad „vlastní univerza“ z V1, nahradily ho
--    vlastní seznamy ve V3.5.3) – nikde se nepoužívá.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RLS: (select auth.uid()) a (select public.is_admin())
-- ---------------------------------------------------------------------
do $$
declare
    p record;
    v_qual text;
    v_check text;
    v_sql text;
begin
    for p in
        select schemaname, tablename, policyname, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and (coalesce(qual, '') ~ '(auth\.uid\(\)|is_admin\(\))' or coalesce(with_check, '') ~ '(auth\.uid\(\)|is_admin\(\))')
    loop
        v_qual := p.qual;
        v_check := p.with_check;
        -- jen volání, která ještě nejsou obalená (deparsovaný text: "( SELECT auth.uid() AS uid)")
        if v_qual is not null then
            v_qual := regexp_replace(v_qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
            v_qual := regexp_replace(v_qual, '(?<!SELECT )(public\.)?is_admin\(\)', '(select public.is_admin())', 'g');
        end if;
        if v_check is not null then
            v_check := regexp_replace(v_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
            v_check := regexp_replace(v_check, '(?<!SELECT )(public\.)?is_admin\(\)', '(select public.is_admin())', 'g');
        end if;
        if v_qual is not distinct from p.qual and v_check is not distinct from p.with_check then
            continue;
        end if;
        v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
        if v_qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
        if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
        execute v_sql;
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Indexy pro cizí klíče
-- ---------------------------------------------------------------------
create index if not exists universe_items_tmdb_idx       on public.universe_items (tmdb_id);
create index if not exists watches_tmdb_idx               on public.watches (tmdb_id);
create index if not exists watchlist_tmdb_idx             on public.watchlist (tmdb_id);
create index if not exists universes_cover_idx            on public.universes (cover_tmdb_id);
create index if not exists film_request_items_universe_idx on public.film_request_items (universe_id);
create index if not exists film_request_votes_user_idx    on public.film_request_votes (user_id);
create index if not exists list_categories_category_idx   on public.list_categories (category_id);
create index if not exists list_reports_reporter_idx      on public.list_reports (reporter_id);

-- ---------------------------------------------------------------------
-- 3. Úklid: universes.owner_id
-- ---------------------------------------------------------------------
drop policy if exists "Official and own universes are readable" on public.universes;
drop policy if exists "Universes are readable" on public.universes;
create policy "Universes are readable"
    on public.universes for select to anon, authenticated
    using (true);

alter table public.universes drop column if exists owner_id;

analyze public.watches, public.universe_items, public.films, public.lists, public.list_items;

notify pgrst, 'reload schema';

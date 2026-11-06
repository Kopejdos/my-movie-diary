-- =====================================================================
-- My Movie Diary – hodnocení filmů (fáze 33 – V3.2)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- • Každý uživatel může dát filmu 0,5–5 hvězdiček po půlkách.
--   Ukládá se jako score 1–10 (= hvězdičky × 2), ať se nepracuje s desetinnými čísly.
-- • Vlastní hodnocení vidí a mění jen jeho autor (RLS).
-- • Průměr všech uživatelů je veřejný přes funkci film_rating_stats – vrací jen
--   průměr a počet hlasů, nikdy, kdo jak hodnotil.
-- • Smazání účtu smaže i hodnocení (on delete cascade přes profiles).
-- =====================================================================

create table public.ratings (
    user_id     uuid     not null default auth.uid()
                references public.profiles (id) on delete cascade,
    tmdb_id     integer  not null references public.films (tmdb_id) on delete cascade,
    score       smallint not null check (score between 1 and 10),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    primary key (user_id, tmdb_id)
);

create index ratings_film_idx on public.ratings (tmdb_id);

alter table public.ratings enable row level security;

create policy "Users can read own ratings"
    on public.ratings for select to authenticated using (user_id = auth.uid());
create policy "Users can add own ratings"
    on public.ratings for insert to authenticated with check (user_id = auth.uid());
create policy "Users can change own ratings"
    on public.ratings for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users can remove own ratings"
    on public.ratings for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.ratings to authenticated;

-- Čas poslední změny
create function public.touch_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger ratings_touch
    before update on public.ratings
    for each row execute function public.touch_rating();

-- Průměr a počet hlasů pro seznam filmů (nejvýš 1000 najednou)
create function public.film_rating_stats(p_ids integer[])
returns table (tmdb_id integer, average numeric, votes integer)
language sql
stable
security definer
set search_path = ''
as $$
    select r.tmdb_id,
           round(avg(r.score) / 2.0, 1) as average,
           count(*)::integer            as votes
    from public.ratings r
    where r.tmdb_id = any (p_ids[1:1000])
    group by r.tmdb_id;
$$;

revoke execute on function public.film_rating_stats(integer[]) from public;
grant  execute on function public.film_rating_stats(integer[]) to anon, authenticated;

notify pgrst, 'reload schema';

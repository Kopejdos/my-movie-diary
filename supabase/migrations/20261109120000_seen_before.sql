-- =====================================================================
-- V3.6.1 – přepracování postupu: „Seen before“ (zhlédnutí bez data)
--
-- • watches.seen_before = film jsem viděl dřív, datum nevím. Počítá se do
--   viděných filmů, kolekcí a achievementů podle filmů a kolekcí, ale ne do
--   ničeho časového (Marathon, Screen Time, série dní, grafy po měsících, Wrapped).
--   watched_on u něj = den zápisu (sloupec zůstává povinný).
-- • my_film_counts: poslední zhlédnutí jen z datovaných zhlédnutí
--   (null = film je jen „Seen before“).
-- • public_profile posílá příznak seen_before (statistiky na veřejném profilu).
-- Nové XP a úrovně se počítají v prohlížeči – v databázi se nemění nic dalšího.
-- =====================================================================

alter table public.watches
    add column if not exists seen_before boolean not null default false;

comment on column public.watches.seen_before is
    'Viděno dřív, datum neznámé – počítá se do filmů a kolekcí, ne do časových statistik (V3.6.1)';

create or replace view public.my_film_counts
with (security_invoker = true) as
select
    w.tmdb_id,
    count(*)                                              as watch_count,
    max(w.watched_on) filter (where not w.seen_before)   as last_watched_on
from public.watches w
where w.user_id = auth.uid()
group by w.tmdb_id;

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
                    'seen_before', w.seen_before,       -- V3.6.1: bez data, jen se počítá
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
        ), '[]'::jsonb),
        -- Hodnocení jen pro přátele (V3.4.2 – porovnání); cizím zůstávají soukromá
        'ratings', case when public.are_friends(auth.uid(), target.id) then coalesce((
            select jsonb_agg(jsonb_build_object('tmdb_id', r.tmdb_id, 'score', r.score))
            from public.ratings r
            where r.user_id = target.id
        ), '[]'::jsonb) end
    );
end;
$$;

revoke execute on function public.public_profile(text) from public;
grant  execute on function public.public_profile(text) to anon, authenticated;

notify pgrst, 'reload schema';

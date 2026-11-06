-- =====================================================================
-- V3.4.2 – porovnání s kamarádem
--
-- public_profile nově vrací i hodnocení (score 1–10) – ale JEN PŘÍTELI.
-- Veřejný profil cizímu dál hodnocení neukazuje (ratings = null).
-- Porovnání samo se počítá v prohlížeči z dat, která už web má
-- (vlastní zhlédnutí + profil přítele) – žádná další tabulka ani funkce.
-- =====================================================================

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

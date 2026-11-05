-- =====================================================================
-- My Movie Diary – veřejné profily a hledání uživatelů (fáze 18 – V2.0)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Zásady:
-- • Profil je SOUKROMÝ, dokud ho uživatel sám nezveřejní (is_public).
-- • Ostatní nedostávají přístup k tabulkám profiles ani watches – pravidla
--   RLS zůstávají „jen vlastní řádky“. Veřejná data vrací jen dvě funkce níže
--   a jen u veřejných profilů.
-- • Ven jde jen: nickname, datum registrace a zhlédnutí (film + datum).
--   Nikdy: e-mail, id účtu, admin, watchlist, hodnocení a poznámky ke zhlédnutí.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Volba „veřejný profil“ (výchozí = soukromý)
-- ---------------------------------------------------------------------
alter table public.profiles
    add column is_public boolean not null default false;

-- Uživatel smí měnit jen nick a viditelnost (is_admin dál jen správce přes SQL)
grant update (is_public) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. Veřejný profil podle nicku (velikost písmen nehraje roli)
--    Vrací JSON { username, member_since, watches: [...] }, nebo null,
--    když profil neexistuje nebo je soukromý (obojí vypadá stejně –
--    nedá se zjistit, jestli soukromý účet existuje).
--    Jeden JSON místo řádků = žádný limit 1000 řádků v API.
-- ---------------------------------------------------------------------
create function public.public_profile(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'username', p.username,
        'member_since', p.created_at,
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
            where w.user_id = p.id
        ), '[]'::jsonb)
    )
    from public.profiles p
    where lower(p.username) = lower(p_username)
      and p.is_public;
$$;

revoke execute on function public.public_profile(text) from public;
grant  execute on function public.public_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Hledání veřejných profilů podle části nicku
--    Od 2 znaků, nejvýš 10 výsledků; nick začínající dotazem je první.
--    strpos místo LIKE – podtržítko v nicku tak není zástupný znak.
-- ---------------------------------------------------------------------
create function public.search_public_profiles(p_query text)
returns table (username text, member_since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    select p.username, p.created_at
    from public.profiles p
    where p.is_public
      and char_length(btrim(p_query)) >= 2
      and strpos(lower(p.username), lower(btrim(p_query))) > 0
    order by strpos(lower(p.username), lower(btrim(p_query))), lower(p.username)
    limit 10;
$$;

revoke execute on function public.search_public_profiles(text) from public;
grant  execute on function public.search_public_profiles(text) to anon, authenticated;

-- PostgREST (API) si načte nové funkce a sloupec
notify pgrst, 'reload schema';

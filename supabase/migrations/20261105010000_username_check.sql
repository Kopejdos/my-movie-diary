-- =====================================================================
-- My Movie Diary – kontrola nicku při registraci (fáze 2)
-- Spouští se jednou v Supabase → SQL Editor.
-- =====================================================================

-- Nickname je unikátní bez ohledu na velikost písmen ("Kopec" = "kopec")
create unique index profiles_username_lower_idx
    on public.profiles (lower(username));

-- Je nickname volný? Registrační formulář se ptá dřív, než účet založí.
-- security definer: nepřihlášený uživatel tabulku profiles číst nesmí,
-- funkce mu ale prozradí jen ano / ne.
create function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1
        from public.profiles
        where lower(username) = lower(p_username)
    );
$$;

revoke execute on function public.is_username_available(text) from public;
grant  execute on function public.is_username_available(text) to anon, authenticated;

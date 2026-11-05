-- =====================================================================
-- My Movie Diary – přihlášení nickem (fáze 2c)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Supabase umí přihlásit jen e-mailem. Edge Function "login" proto
-- k nicku dohledá e-mail touto funkcí a přihlásí uživatele na serveru.
-- Funkci smí volat JEN service_role – kdyby ji mohl volat kdokoli,
-- dalo by se z nicku zjistit cizí e-mail.
-- =====================================================================

create function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select u.email
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(p.username) = lower(p_username)
    limit 1;
$$;

revoke execute on function public.email_for_username(text) from public, anon, authenticated;
grant  execute on function public.email_for_username(text) to service_role;

notify pgrst, 'reload schema';

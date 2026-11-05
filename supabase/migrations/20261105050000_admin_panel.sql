-- =====================================================================
-- My Movie Diary – admin panel (fáze 5)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Správce smí z webu zakládat, upravovat a mazat univerza a jejich filmy.
-- Uživatele a hledání v TMDB obsluhuje Edge Function "admin"
-- (potřebuje serverový klíč a TMDB token, které do prohlížeče nepatří).
-- =====================================================================

-- Je přihlášený uživatel správce?
-- security definer: funkce smí přečíst příznak i tam, kam by pravidla RLS nepustila.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(
        (select p.is_admin from public.profiles p where p.id = auth.uid()),
        false
    );
$$;

revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Univerza
-- ---------------------------------------------------------------------
create policy "Admins can create universes"
    on public.universes for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update universes"
    on public.universes for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can delete universes"
    on public.universes for delete
    to authenticated
    using (public.is_admin());

-- ---------------------------------------------------------------------
-- Filmy v univerzech
-- ---------------------------------------------------------------------
create policy "Admins can add universe items"
    on public.universe_items for insert
    to authenticated
    with check (public.is_admin());

create policy "Admins can update universe items"
    on public.universe_items for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

create policy "Admins can remove universe items"
    on public.universe_items for delete
    to authenticated
    using (public.is_admin());

-- Oprávnění pro Data API – pravidla výše je omezí jen na správce
grant insert, update, delete on public.universes      to authenticated;
grant insert, update, delete on public.universe_items to authenticated;

notify pgrst, 'reload schema';

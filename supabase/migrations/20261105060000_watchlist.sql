-- =====================================================================
-- My Movie Diary – watchlist (fáze 7)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Tabulka watchlist existuje od fáze 1a (pravidla RLS i oprávnění).
-- Tady jen: film označený jako viděný sám zmizí z watchlistu.
-- =====================================================================

create function public.remove_watched_from_watchlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.watchlist
    where user_id = new.user_id
      and tmdb_id = new.tmdb_id;
    return new;
end;
$$;

create trigger on_watch_added
    after insert on public.watches
    for each row execute function public.remove_watched_from_watchlist();

-- Watchlist se řadí od naposledy přidaného
create index watchlist_user_added_idx on public.watchlist (user_id, added_at desc);

notify pgrst, 'reload schema';

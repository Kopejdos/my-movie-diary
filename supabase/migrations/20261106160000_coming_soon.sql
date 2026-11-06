-- =====================================================================
-- V3.3 – Coming soon
--
-- Oznámené filmy, které ještě nevyšly (Avatar 4, Toy Story 5…), se nově
-- importují do kolekcí s příznakem is_upcoming. Na webu jsou v oddílu
-- „Coming soon“ dole v kolekci a NEPOČÍTAJÍ se do počtu filmů ani do postupu.
-- Import je bere jen do konce roku (letos + 5); po premiéře je další import
-- přepne na běžné filmy (is_upcoming = false).
-- =====================================================================

alter table public.universe_items
    add column if not exists is_upcoming boolean not null default false;

comment on column public.universe_items.is_upcoming is
    'Film ještě nevyšel (oddíl Coming soon) – nepočítá se do postupu. Nastavuje import.';

-- Postup v kolekcích: kromě volitelných filmů se nepočítají ani chystané.
-- (create or replace – sloupce i jejich pořadí zůstávají stejné)
create or replace view public.universe_progress
with (security_invoker = true) as
select
    u.id   as universe_id,
    u.slug,
    count(ui.id) filter (where not ui.is_optional and not ui.is_upcoming) as total_count,
    count(ui.id) filter (
        where not ui.is_optional
          and not ui.is_upcoming
          and exists (
              select 1
              from public.watches w
              where w.tmdb_id = ui.tmdb_id
                and w.user_id = auth.uid()
          )
    ) as watched_count
from public.universes u
left join public.universe_items ui on ui.universe_id = u.id
group by u.id, u.slug;

grant select on public.universe_progress to anon, authenticated;

notify pgrst, 'reload schema';

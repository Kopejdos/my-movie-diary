-- =====================================================================
-- V3.3.1 – chystaný film se po premiéře přepne sám
--
-- Dřív zůstal film v Coming soon (is_upcoming = true), dokud ho další import
-- nepřepnul. Teď se v den premiéry (films.release_date <= dnešek) počítá jako
-- vydaný automaticky – do postupu i do počtu filmů. Import pak jen obnoví údaje
-- z TMDB (délka, plakát) a příznak srovná.
--
-- Pravidlo „chystaný“ = is_upcoming a zároveň premiéra ještě nebyla
-- (nebo datum není známé). Stejné pravidlo používá web (data.js → isUpcoming).
-- =====================================================================

create or replace view public.universe_progress
with (security_invoker = true) as
select
    u.id   as universe_id,
    u.slug,
    count(ui.id) filter (where not ui.is_optional and not coalesce(upcoming.flag, false)) as total_count,
    count(ui.id) filter (
        where not ui.is_optional
          and not coalesce(upcoming.flag, false)
          and exists (
              select 1
              from public.watches w
              where w.tmdb_id = ui.tmdb_id
                and w.user_id = auth.uid()
          )
    ) as watched_count
from public.universes u
left join public.universe_items ui on ui.universe_id = u.id
left join public.films f on f.tmdb_id = ui.tmdb_id
-- chystaný = příznak z importu a premiéra je až po dnešku (nebo ještě bez data)
left join lateral (
    select ui.is_upcoming and (f.release_date is null or f.release_date > current_date) as flag
) upcoming on true
group by u.id, u.slug;

grant select on public.universe_progress to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- V3.3.2 – chystaný film podle data premiéry, ne podle stavu v TMDB
--
-- TMDB občas přepne stav na „Released“ dřív, než film vyjde (Hunger Games:
-- Sunrise on the Reaping měl 6. 11. stav Released a premiéru 18. 11.).
-- Proto teď rozhoduje datum:
--   • datum je známé  → chystaný, dokud premiéra nebyla (release_date > dnešek),
--   • datum není      → rozhodne příznak is_upcoming z importu (stav v TMDB).
-- Stejné pravidlo používá web (data.js → isUpcoming).
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
-- chystaný = premiéra až po dnešku; bez data rozhodne příznak z importu
left join lateral (
    select case
        when f.release_date is not null then f.release_date > current_date
        else ui.is_upcoming
    end as flag
) upcoming on true
group by u.id, u.slug;

grant select on public.universe_progress to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- V3.5.2 – požadavky na kolekce
--
-- Požadavek má nově druh:
--   • films      – libovolné filmy (jako ve V3.5.1),
--   • collection – filmy JEN z jedné série TMDB (belongs_to_collection);
--                  správce z něj jedním klikem vytvoří oficiální kolekci.
-- Kontrolu „jen jedna série“ dělá Edge Function "requests" (díly série bere
-- z TMDB) – web ji obejít nemůže, zápis do tabulek jde jen přes funkci.
--
-- Navíc: universe_items.source – filmy z požadavků import nemaže a do seedu
-- je dopíše skript scripts/sync-seed.sh (Edge Function tmdb, action=seed-sync).
-- =====================================================================

alter table public.film_requests
    add column if not exists kind text not null default 'films' check (kind in ('films', 'collection')),
    add column if not exists tmdb_collection_id integer check (tmdb_collection_id > 0),
    add column if not exists collection_name text check (char_length(collection_name) <= 120);

-- Požadavek na kolekci musí mít sérii, požadavek na filmy ne
alter table public.film_requests
    add constraint film_requests_series_check
    check ((kind = 'collection') = (tmdb_collection_id is not null));

create index if not exists film_requests_collection_idx
    on public.film_requests (tmdb_collection_id) where tmdb_collection_id is not null;

comment on column public.film_requests.kind is 'films = libovolné filmy, collection = filmy z jedné série TMDB (V3.5.2)';
comment on column public.film_requests.tmdb_collection_id is 'Série TMDB u požadavku na kolekci';

-- ---------------------------------------------------------------------
-- Filmy přidané z požadavků se už nemusí ručně kopírovat do seedu
--   source = 'seed'    – položka ze seedu; import ji smaže, když v seedu chybí
--   source = 'request' – přidal ji správce z požadavku (nebo kolekce ze série);
--                        import ji nechá být a skript scripts/sync-seed.sh ji
--                        sám dopíše do supabase/seed/universes.json.
--                        Dalším importem se z ní stane obyčejná položka 'seed'.
-- ---------------------------------------------------------------------
alter table public.universe_items
    add column if not exists source text not null default 'seed' check (source in ('seed', 'request'));

comment on column public.universe_items.source is 'seed = ze seedu, request = z požadavku (import ji nemaže, sync-seed ji dopíše do seedu) – V3.5.2';

-- Filmy už přijaté z požadavků (V3.5.1) → 'request', ať je příští import nesmaže.
-- Výjimka: RoboCop 2 a 3 v 80s Action – mají vlastní kolekci RoboCop, z 80s Action
-- je má příští import odebrat.
update public.universe_items ui
set source = 'request'
where exists (
        select 1 from public.film_request_items i
        where i.tmdb_id = ui.tmdb_id and i.universe_id = ui.universe_id and i.status = 'added'
    )
  and not (
        ui.tmdb_id in (5549, 5550)
        and ui.universe_id in (select u.id from public.universes u where u.slug = 'action-80s')
    );

notify pgrst, 'reload schema';

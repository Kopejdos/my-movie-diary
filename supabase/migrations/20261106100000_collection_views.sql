-- =====================================================================
-- My Movie Diary – pohledy na kolekci (fáze 26 – V3.0.1)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Kolekce jde zobrazit třemi způsoby:
--   Release – podle roku vydání (výchozí, má ho každá kolekce); nadpisy oddílů
--             z group_label (MCU Phase 1–6, Disney Golden Age…),
--   Story   – pořadí v příběhu (story_order, jen kde je vyplněné),
--   Groups  – po sériích (nový sloupec franchise: Iron Man, Hulk… / Toy Story, Cars…).
-- Nový sloupec label = krátký popisek filmu v kolekci (Episode IV, Part 2…),
-- protože samotný název z TMDB nemusí stačit (první Star Wars je jen „Star Wars“).
-- =====================================================================

alter table public.universe_items
    add column franchise text
    check (franchise is null or char_length(franchise) between 1 and 60);

alter table public.universe_items
    add column label text
    check (label is null or char_length(label) between 1 and 60);

comment on column public.universe_items.franchise is
    'Série uvnitř kolekce pro pohled Groups (Iron Man, Toy Story…). Prázdná = film bez série (na konci).';
comment on column public.universe_items.label is
    'Krátký popisek filmu v kolekci (Episode IV, Part 2…) – zobrazuje se u názvu.';

-- Práva: select (anon, authenticated) a insert / update / delete (správce přes RLS)
-- jsou na celé tabulce, takže platí i pro nové sloupce – žádný nový grant.

notify pgrst, 'reload schema';

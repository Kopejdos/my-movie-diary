-- =====================================================================
-- My Movie Diary – zrušení kolekce Shrek (fáze 27 – V3.0.2)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Všechny filmy ze Shreka jsou v DreamWorks jako série „Shrek“ (pohled By series),
-- samostatná kolekce je tak zbytečná. Import kolekce nemaže (jen přidává a
-- aktualizuje), proto se smaže tady.
--
-- Smaže se jen kolekce: její položky (universe_items) a kategorie
-- (universe_categories) díky on delete cascade. Filmy (films) i zhlédnutí
-- a watchlist uživatelů zůstávají – patří k filmu, ne ke kolekci.
-- =====================================================================

delete from public.universes where slug = 'shrek';

notify pgrst, 'reload schema';

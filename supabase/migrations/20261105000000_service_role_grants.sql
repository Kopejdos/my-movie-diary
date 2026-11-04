-- =====================================================================
-- My Movie Diary – oprávnění pro service_role (fáze 1b)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- Automatické zpřístupnění tabulek je vypnuté, takže ani service_role
-- (klíč, pod kterým zapisuje Edge Function) nemá k tabulkám oprávnění.
-- RLS sice obchází, ale oprávnění GRANT potřebuje.
-- =====================================================================

-- Stávající tabulky, pohledy a sekvence
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Totéž automaticky pro všechno, co vznikne v budoucích migracích
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

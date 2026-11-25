-- =====================================================================
-- My Movie Diary – nicky agentů (V4.4.6.1)
-- Spouští se jednou v Supabase → SQL Editor. Jde spustit i opakovaně.
--
-- Zakázaná slova mají dva druhy:
--   • urážky a vulgarity – nesmí je mít nikdo, ani agent (správce),
--   • vyhrazená slova (reserved) – chrání před vydáváním se za tým webu (admin, agent,
--     moderator, staff, official…). Běžný uživatel je mít nesmí, agent ano (Agent_F, Admin_F).
-- Vyhrazená slova se nekontrolují v názvech a popisech seznamů („Official MCU order“ projde).
-- Podtržítko a pomlčka v nicku byly povolené vždy; při porovnání se slovy se jen vynechají.
-- =====================================================================

alter table public.blocked_words add column if not exists reserved boolean not null default false;

comment on column public.blocked_words.reserved is
    'Vyhrazené slovo (V4.4.6.1) – zakázané běžným uživatelům, agenti (správci) ho v nicku mít smí';

-- Výchozí slova proti vydávání se za tým webu jsou vyhrazená; nové „agent“ k nim
update public.blocked_words
set reserved = true
where word in ('admin', 'moderator', 'mymoviediary', 'support', 'mod', 'mmd', 'staff',
               'root', 'system', 'official', 'owner');

insert into public.blocked_words (word, match_mode, reserved)
values ('agent', 'contains', true)
on conflict (word) do update set reserved = true;

-- Agent smí slovo přepnout mezi zakázaným a vyhrazeným (dřív šlo jen přidat a smazat)
drop policy if exists "Admins can change blocked words" on public.blocked_words;
create policy "Admins can change blocked words"
    on public.blocked_words for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (reserved, match_mode) on public.blocked_words to authenticated;

-- ---------------------------------------------------------------------
-- Kontrola nicku: p_staff = nick agenta (smí vyhrazená slova)
-- ---------------------------------------------------------------------
create or replace function public.username_allowed(p_username text, p_staff boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_generated_username(p_username) or not exists (
        select 1
        from public.blocked_words b
        where not (b.reserved and coalesce(p_staff, false))
          and ((b.match_mode = 'contains'
                and strpos(public.normalize_username(p_username), public.normalize_username(b.word)) > 0)
            or (b.match_mode = 'exact'
                and public.normalize_username(p_username) = public.normalize_username(b.word)))
    );
$$;

-- Volá ji i kontrola při uložení nicku (běží pod účtem, který nick mění). Prozradí jen, jestli
-- by nick prošel – stejně jako is_username_allowed, takže ji smí volat kdokoli.
revoke execute on function public.username_allowed(text, boolean) from public;
grant  execute on function public.username_allowed(text, boolean) to anon, authenticated;

-- Pro web (registrace, změna nicku): agent přihlášený na svém účtu smí vyhrazená slova
create or replace function public.is_username_allowed(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.username_allowed(p_username, public.is_admin());
$$;

revoke execute on function public.is_username_allowed(text) from public;
grant  execute on function public.is_username_allowed(text) to anon, authenticated;

-- Kontrola při uložení nicku – podle toho, jestli je účet agent (i v jednom update s is_admin)
create or replace function public.check_username_allowed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if (tg_op = 'INSERT' or new.username is distinct from old.username)
       and not public.username_allowed(new.username, new.is_admin) then
        raise exception 'username_not_allowed' using hint = 'Choose a different nickname.';
    end if;
    return new;
end;
$$;

-- Nicky porušující pravidla (admin panel, Users): jen běžní uživatelé
create or replace function public.flagged_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select p.id from public.profiles p
    where not p.is_admin and not public.username_allowed(p.username, false);
$$;

revoke execute on function public.flagged_profile_ids() from public, anon, authenticated;
grant  execute on function public.flagged_profile_ids() to service_role;

-- Texty seznamů: jen urážky a vulgarity, vyhrazená slova ne
create or replace function public.is_text_allowed(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1
        from regexp_split_to_table(lower(coalesce(p_text, '')), '[^[:alnum:]]+') as t(token)
        cross join public.blocked_words b
        where t.token <> ''
          and not b.reserved
          and (
              public.normalize_username(t.token) = public.normalize_username(b.word)
              or (b.match_mode = 'contains'
                  and char_length(b.word) >= 4
                  and strpos(public.normalize_username(t.token), public.normalize_username(b.word)) > 0)
          )
    );
$$;

revoke execute on function public.is_text_allowed(text) from public;
grant execute on function public.is_text_allowed(text) to anon, authenticated;

notify pgrst, 'reload schema';

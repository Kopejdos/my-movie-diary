-- =====================================================================
-- My Movie Diary – nicky a moderace (fáze 21 – V2.3)
-- Spouští se jednou v Supabase → SQL Editor.
--
-- • Zakázaná slova v nickách (tabulka blocked_words, spravuje admin).
-- • Kontrola běží v databázi – nedá se obejít voláním API mimo web.
-- • Nick se před porovnáním normalizuje: malá písmena, náhrady čísel a znaků
--   za písmena (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, @→a, $→s, !→i, |→i),
--   bez ostatních znaků (_ - a zbylých číslic) a se sloučenými opakovanými
--   písmeny (fuuuck → fuck). Totéž se udělá se zakázaným slovem.
-- • Režim slova: contains = kdekoli v nicku, exact = celý nick
--   (pro slova, která by jinak blokovala nevinné nicky: grape, Picasso…).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Zakázaná slova
-- ---------------------------------------------------------------------
create table public.blocked_words (
    id          bigint generated always as identity primary key,
    word        text not null unique check (word ~ '^[a-z0-9]{2,30}$'),
    match_mode  text not null default 'contains' check (match_mode in ('contains', 'exact')),
    created_at  timestamptz not null default now()
);

alter table public.blocked_words enable row level security;

-- Seznam vidí a mění jen správce (ostatní se dozví jen ano / ne přes funkci)
create policy "Admins can read blocked words"
    on public.blocked_words for select to authenticated using (public.is_admin());
create policy "Admins can add blocked words"
    on public.blocked_words for insert to authenticated with check (public.is_admin());
create policy "Admins can remove blocked words"
    on public.blocked_words for delete to authenticated using (public.is_admin());

grant select, insert, delete on public.blocked_words to authenticated;

-- ---------------------------------------------------------------------
-- 2. Normalizace a kontrola nicku
-- ---------------------------------------------------------------------
create function public.normalize_username(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
    select regexp_replace(
        regexp_replace(
            translate(lower(coalesce(p_text, '')), '0134578@$!|', 'oieastbasii'),
            '[^a-z]', '', 'g'),
        '(.)\1+', '\1', 'g');
$$;

-- Automaticky vygenerovaný nick (Google, reset adminem) je vždy povolený
create function public.is_generated_username(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(p_username ~ '^user_[0-9a-f]{8}$', false);
$$;

create function public.is_username_allowed(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_generated_username(p_username) or not exists (
        select 1
        from public.blocked_words b
        where (b.match_mode = 'contains'
               and strpos(public.normalize_username(p_username), public.normalize_username(b.word)) > 0)
           or (b.match_mode = 'exact'
               and public.normalize_username(p_username) = public.normalize_username(b.word))
    );
$$;

revoke execute on function public.is_username_allowed(text) from public;
grant  execute on function public.is_username_allowed(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Kontrola při každém uložení nicku (registrace, změna v profilu, API)
-- ---------------------------------------------------------------------
create function public.check_username_allowed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if (tg_op = 'INSERT' or new.username is distinct from old.username)
       and not public.is_username_allowed(new.username) then
        raise exception 'username_not_allowed' using hint = 'Choose a different nickname.';
    end if;
    return new;
end;
$$;

create trigger profiles_username_allowed
    before insert or update of username on public.profiles
    for each row execute function public.check_username_allowed();

-- Registrace: nepovolený nebo obsazený nick z formuláře → automatický nick
-- (účet vznikne, uživatel si pak musí zvolit jiný – web ho pošle do profilu)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    wanted    text := nullif(new.raw_user_meta_data ->> 'username', '');
    generated text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
begin
    if wanted is null
       or wanted !~ '^[A-Za-z0-9_-]{3,24}$'
       or not public.is_username_allowed(wanted)
       or exists (select 1 from public.profiles where lower(username) = lower(wanted)) then
        wanted := generated;
    end if;
    insert into public.profiles (id, username) values (new.id, wanted);
    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Nicky, které porušují pravidla (pro seznam uživatelů v adminu)
--    Správci se neoznačují (účet „admin“ vznikl před zavedením pravidel).
-- ---------------------------------------------------------------------
create function public.flagged_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
    select p.id from public.profiles p
    where not p.is_admin and not public.is_username_allowed(p.username);
$$;

revoke execute on function public.flagged_profile_ids() from public, anon, authenticated;
grant  execute on function public.flagged_profile_ids() to service_role;

-- ---------------------------------------------------------------------
-- 5. Výchozí seznam (anglicky a česky) – dál se spravuje v admin panelu
-- ---------------------------------------------------------------------
insert into public.blocked_words (word, match_mode) values
    -- vulgarity a sexuální výrazy
    ('fuck', 'contains'), ('shit', 'contains'), ('cunt', 'contains'), ('bitch', 'contains'),
    ('whore', 'contains'), ('slut', 'contains'), ('pussy', 'contains'), ('penis', 'contains'),
    ('vagina', 'contains'), ('porn', 'contains'), ('blowjob', 'contains'), ('dildo', 'contains'),
    ('dick', 'exact'), ('cock', 'exact'), ('cum', 'exact'), ('sex', 'exact'), ('anal', 'exact'),
    ('tits', 'exact'), ('boobs', 'exact'),
    -- nenávist a urážky
    ('nigger', 'contains'), ('nigga', 'contains'), ('faggot', 'contains'), ('retard', 'contains'),
    ('nazi', 'contains'), ('hitler', 'contains'), ('rapist', 'contains'), ('pedofil', 'contains'),
    ('pedophile', 'contains'), ('fag', 'exact'), ('rape', 'exact'), ('pedo', 'exact'),
    -- česky
    ('kurva', 'contains'), ('kokot', 'contains'), ('curak', 'contains'), ('zmrd', 'contains'),
    ('mrdka', 'contains'), ('mrdat', 'contains'), ('sukat', 'contains'), ('prdel', 'contains'),
    ('hovno', 'contains'), ('buzna', 'contains'), ('buzerant', 'contains'), ('negr', 'contains'),
    ('cigan', 'contains'), ('cikan', 'contains'), ('pica', 'exact'),
    -- vydávání se za správce / aplikaci
    ('admin', 'contains'), ('moderator', 'contains'), ('mymoviediary', 'contains'),
    ('support', 'contains'), ('mod', 'exact'), ('mmd', 'exact'), ('staff', 'exact'),
    ('root', 'exact'), ('system', 'exact'), ('official', 'exact'), ('owner', 'exact')
on conflict (word) do nothing;

notify pgrst, 'reload schema';

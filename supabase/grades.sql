-- Bolles Planner: grades sent straight from the browser extension.
-- Run this once after schema.sql: SQL Editor -> New query -> paste -> Run.
--
-- The extension checks the student's Schoology grades every 30 minutes and
-- sends them here, so the planner on their phone stays up to date even if
-- the planner isn't open on the laptop. The planner gives the extension a
-- private link key that can do exactly one thing: save grades to that
-- student's account. Only a hash of the key is stored.

create table if not exists public.grades (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint grades_size check (pg_column_size(data) < 400000)
);

create table if not exists public.grade_links (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz
);
create index if not exists grade_links_user on public.grade_links (user_id);

alter table public.grades enable row level security;
alter table public.grade_links enable row level security;

drop policy if exists "Read own grades" on public.grades;
create policy "Read own grades" on public.grades
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.grades, public.grade_links from anon, authenticated;
grant select on public.grades to authenticated;

create or replace function public.grade_token_hash(token text)
returns text
language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(coalesce(token, ''), 'UTF8')), 'hex'); $$;

-- Signed-in student: make a link key for this browser's extension.
-- Keeps the 5 newest links (one per laptop, roughly).
create or replace function public.link_grades_extension()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  insert into public.grade_links (token_hash, user_id) values (public.grade_token_hash(token), uid);
  delete from public.grade_links l where l.user_id = uid and l.token_hash not in (
    select l2.token_hash from public.grade_links l2 where l2.user_id = uid order by l2.created_at desc limit 5);
  return token;
end;
$$;

-- Signed-in student: stop syncing grades and remove the ones saved here.
create or replace function public.clear_synced_grades()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.grade_links l where l.user_id = auth.uid();
  delete from public.grades g where g.user_id = auth.uid();
$$;

-- The extension (no sign-in, just the link key): save the latest grades.
-- Older readings never replace newer ones.
create or replace function public.submit_grades(token text, grades jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid;
  read timestamptz;
begin
  select l.user_id into uid from public.grade_links l where l.token_hash = public.grade_token_hash(token);
  if uid is null then raise exception 'unknown link' using errcode = '28000'; end if;
  if jsonb_typeof(grades) is distinct from 'object' or jsonb_typeof(grades -> 'courses') is distinct from 'array'
     or jsonb_typeof(grades -> 'readAt') is distinct from 'number' or jsonb_array_length(grades -> 'courses') > 20 then
    raise exception 'not a grades reading' using errcode = '22023';
  end if;
  read := least(to_timestamp((grades ->> 'readAt')::double precision / 1000), now());
  insert into public.grades as g (user_id, data, read_at) values (uid, grades, read)
    on conflict (user_id) do update set data = excluded.data, read_at = excluded.read_at, updated_at = now()
    where g.read_at < excluded.read_at;
  update public.grade_links l set last_used = now() where l.token_hash = public.grade_token_hash(token);
  return 'saved';
end;
$$;

revoke execute on function
  public.grade_token_hash(text), public.link_grades_extension(), public.clear_synced_grades(), public.submit_grades(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.link_grades_extension(), public.clear_synced_grades() to authenticated;
grant execute on function public.submit_grades(text, jsonb) to anon, authenticated;

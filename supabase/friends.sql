-- Rotation Planner: friends and schedule comparing.
-- Run this once after schema.sql: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again.
--
-- Privacy model:
--   * Students find each other only by friend code (no searching by name or email).
--   * A friend request must be accepted before anything is shared.
--   * Friends see only your display name and class schedule (periods, class
--     names, teachers, rooms, lunch order). Never assignments, tests or email.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  friend_code text not null unique,
  schedule jsonb not null default '{}'::jsonb check (pg_column_size(schedule) < 20000),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

-- Clients may only change their own name and schedule directly. Everything
-- else (creating a profile, friend codes, requests) goes through the
-- functions below.
revoke all on public.profiles, public.friendships from anon, authenticated;
grant select on public.profiles, public.friendships to authenticated;
grant update (display_name, schedule, updated_at) on public.profiles to authenticated;

create or replace function public.is_friend(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = (select auth.uid()) and f.addressee = other)
        or (f.addressee = (select auth.uid()) and f.requester = other))
  );
$$;

drop policy if exists "See own and friends' profiles" on public.profiles;
create policy "See own and friends' profiles" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "See own friendships" on public.friendships;
create policy "See own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- ---------------------------------------------------------------------------

create or replace function public.require_uid()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return uid;
end;
$$;

-- Turn on friends (or rename). Returns the student's friend code.
create or replace function public.enable_friends(name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := public.require_uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  bytes bytea;
  code text;
  existing text;
  i int;
begin
  select friend_code into existing from public.profiles where user_id = uid;
  if existing is not null then
    update public.profiles set display_name = btrim(name), updated_at = now() where user_id = uid;
    return existing;
  end if;
  loop
    bytes := uuid_send(gen_random_uuid());
    code := '';
    foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10] loop
      code := code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  insert into public.profiles (user_id, display_name, friend_code) values (uid, btrim(name), code);
  return code;
end;
$$;

-- Send a friend request by code. If they already asked you, this accepts it.
-- Returns {status: requested | accepted | already | not_found | self | no_profile, name}.
create or replace function public.request_friend(code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := public.require_uid();
  target public.profiles%rowtype;
  clean text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not exists (select 1 from public.profiles where user_id = uid) then
    return jsonb_build_object('status', 'no_profile');
  end if;
  select * into target from public.profiles where friend_code = clean;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if target.user_id = uid then return jsonb_build_object('status', 'self'); end if;

  if exists (select 1 from public.friendships where requester = target.user_id and addressee = uid and status = 'pending') then
    update public.friendships set status = 'accepted' where requester = target.user_id and addressee = uid;
    return jsonb_build_object('status', 'accepted', 'name', target.display_name);
  end if;
  if exists (select 1 from public.friendships
             where (requester = uid and addressee = target.user_id) or (requester = target.user_id and addressee = uid)) then
    return jsonb_build_object('status', 'already', 'name', target.display_name);
  end if;
  insert into public.friendships (requester, addressee) values (uid, target.user_id);
  return jsonb_build_object('status', 'requested', 'name', target.display_name);
end;
$$;

-- Pending requests to and from you, with names only (no schedules).
create or replace function public.friend_requests()
returns table (user_id uuid, display_name text, direction text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.display_name,
         case when f.requester = (select public.require_uid()) then 'outgoing' else 'incoming' end,
         f.created_at
  from public.friendships f
  join public.profiles p
    on p.user_id = case when f.requester = (select public.require_uid()) then f.addressee else f.requester end
  where f.status = 'pending'
    and (select public.require_uid()) in (f.requester, f.addressee)
  order by f.created_at;
$$;

-- Accept or decline a request someone sent you.
create or replace function public.respond_friend(other uuid, accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.require_uid();
begin
  if accept then
    update public.friendships set status = 'accepted'
    where requester = other and addressee = uid and status = 'pending';
  else
    delete from public.friendships where requester = other and addressee = uid and status = 'pending';
  end if;
end;
$$;

-- Unfriend, or cancel a request you sent.
create or replace function public.remove_friend(other uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.require_uid();
begin
  delete from public.friendships
  where (requester = uid and addressee = other) or (requester = other and addressee = uid);
end;
$$;

-- Stop sharing: delete your profile and every friendship.
create or replace function public.leave_friends()
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.require_uid();
begin
  delete from public.friendships where uid in (requester, addressee);
  delete from public.profiles where user_id = uid;
end;
$$;

revoke execute on function
  public.is_friend(uuid), public.require_uid(), public.enable_friends(text), public.request_friend(text),
  public.friend_requests(), public.respond_friend(uuid, boolean), public.remove_friend(uuid), public.leave_friends()
  from public, anon;
grant execute on function
  public.is_friend(uuid), public.require_uid(), public.enable_friends(text), public.request_friend(text),
  public.friend_requests(), public.respond_friend(uuid, boolean), public.remove_friend(uuid), public.leave_friends()
  to authenticated;

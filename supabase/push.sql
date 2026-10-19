-- Bolles Planner push notifications.
-- Run this once after schema.sql: SQL Editor -> New query -> paste -> Run.
--
-- How it works: each student's planner works out their upcoming reminders
-- (night before a test, morning letter day, ...) and saves them to
-- push_queue. The `push` Edge Function runs every few minutes, sends the
-- reminders that are due to the student's devices, and marks them sent.
-- Students can only touch their own rows, and only through the functions
-- below. The sending side (keys, the whole queue) is for the server only.

-- Devices that agreed to get notifications. The endpoint is the address the
-- browser's push service gave this device.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 30),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- Reminders waiting to be sent. `key` names the reminder (e.g. eve-2026-11-04)
-- so the same one is never sent twice.
create table if not exists public.push_queue (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9-]{1,60}$'),
  send_at timestamptz not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) <= 300),
  url text not null default '#/today' check (url ~ '^#/[A-Za-z0-9/_-]{0,80}$'),
  sent_at timestamptz,
  primary key (user_id, key)
);
create index if not exists push_queue_due on public.push_queue (send_at) where sent_at is null;

-- The server's push keys and the secret the scheduler uses. One row, made
-- here; the Edge Function fills in the keys the first time it runs.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text,
  private_jwk jsonb,
  cron_secret text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;

alter table public.push_subscriptions enable row level security;
alter table public.push_queue enable row level security;
alter table public.push_config enable row level security;

drop policy if exists "Read own devices" on public.push_subscriptions;
create policy "Read own devices" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Read own reminders" on public.push_queue;
create policy "Read own reminders" on public.push_queue
  for select to authenticated using ((select auth.uid()) = user_id);

-- No direct writes for students, and nothing at all from push_config.
revoke all on public.push_subscriptions, public.push_queue, public.push_config from anon, authenticated;
grant select on public.push_subscriptions, public.push_queue to authenticated;

-- ---------------------------------------------------------------------------
-- For students (signed in)

-- Only real browser push services, so the server never posts anywhere else.
create or replace function public.is_push_endpoint(endpoint text)
returns boolean
language sql immutable set search_path = ''
as $$
  select char_length(endpoint) <= 1000 and endpoint ~ ('^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com'
    || '|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[^\s]+$');
$$;

-- Save this device. If another account used it before, it moves to this one.
create or replace function public.save_push_subscription(endpoint text, p256dh text, auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.is_push_endpoint(endpoint) then raise exception 'not a push service address' using errcode = '22023'; end if;
  insert into public.push_subscriptions as s (endpoint, user_id, p256dh, auth)
    values (endpoint, uid, p256dh, auth)
    on conflict on constraint push_subscriptions_pkey
    do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  -- At most 10 devices per student.
  delete from public.push_subscriptions s
    where s.user_id = uid and s.endpoint not in (
      select s2.endpoint from public.push_subscriptions s2 where s2.user_id = uid order by s2.created_at desc limit 10);
end;
$$;

create or replace function public.remove_push_subscription(endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions s where s.endpoint = remove_push_subscription.endpoint and s.user_id = auth.uid();
$$;

-- Replace this student's unsent reminders with a fresh list (JSON array of
-- {key, send_at, title, body, url}). Reminders already sent are kept, so
-- re-saving never sends one twice. Returns how many are now waiting.
create or replace function public.replace_push_queue(items jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  waiting int;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 200 then
    raise exception 'expected a list of at most 200 reminders' using errcode = '22023';
  end if;
  delete from public.push_queue q where q.user_id = uid and (q.sent_at is null or q.sent_at < now() - interval '40 days');
  insert into public.push_queue (user_id, key, send_at, title, body, url)
    select uid, x.key, x.send_at, x.title, coalesce(x.body, ''), coalesce(nullif(x.url, ''), '#/today')
    from jsonb_to_recordset(items) as x(key text, send_at timestamptz, title text, body text, url text)
    where x.send_at > now() and x.send_at < now() + interval '35 days'
    on conflict on constraint push_queue_pkey do nothing;
  select count(*) into waiting from public.push_queue q where q.user_id = uid and q.sent_at is null;
  return waiting;
end;
$$;

-- Turning notifications off for the account: drop everything waiting.
create or replace function public.clear_push_queue()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_queue q where q.user_id = auth.uid() and q.sent_at is null;
$$;

-- ---------------------------------------------------------------------------
-- For the push Edge Function (service role only)

create or replace function public.get_push_config()
returns table (public_key text, private_jwk jsonb, cron_secret text)
language sql stable security definer set search_path = ''
as $$
  select c.public_key, c.private_jwk, c.cron_secret from public.push_config c where c.id = 1;
$$;

-- Save the server's keys the first time; if two runs race, the first wins.
create or replace function public.set_push_keys(new_public_key text, new_private_jwk jsonb)
returns table (public_key text, private_jwk jsonb)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.push_config c set public_key = new_public_key, private_jwk = new_private_jwk
    where c.id = 1 and c.public_key is null;
  return query select c.public_key, c.private_jwk from public.push_config c where c.id = 1;
end;
$$;

-- Take the reminders that are due (marking them sent), with each student's
-- devices. Reminders more than 3 hours late are dropped instead of sent.
create or replace function public.claim_due_pushes(max_items int default 500)
returns table (user_id uuid, key text, title text, body text, url text, devices jsonb)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.push_queue q set sent_at = now()
    where q.sent_at is null and q.send_at < now() - interval '3 hours';
  return query
    with due as (
      select q.user_id, q.key from public.push_queue q
      where q.sent_at is null and q.send_at <= now()
      order by q.send_at
      limit greatest(1, least(max_items, 1000))
      for update skip locked
    ), claimed as (
      update public.push_queue q set sent_at = now()
      from due where q.user_id = due.user_id and q.key = due.key
      returning q.user_id, q.key, q.title, q.body, q.url
    )
    select c.user_id, c.key, c.title, c.body, c.url,
      coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                from public.push_subscriptions s where s.user_id = c.user_id), '[]'::jsonb)
    from claimed c;
end;
$$;

-- The push service said this device is gone (uninstalled, permission removed).
create or replace function public.drop_push_endpoint(endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions s where s.endpoint = drop_push_endpoint.endpoint;
$$;

revoke execute on function
  public.is_push_endpoint(text), public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.replace_push_queue(jsonb), public.clear_push_queue(),
  public.get_push_config(), public.set_push_keys(text, jsonb), public.claim_due_pushes(int), public.drop_push_endpoint(text)
  from public, anon, authenticated;
grant execute on function
  public.is_push_endpoint(text), public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.replace_push_queue(jsonb), public.clear_push_queue()
  to authenticated;
grant execute on function
  public.get_push_config(), public.set_push_keys(text, jsonb), public.claim_due_pushes(int), public.drop_push_endpoint(text)
  to service_role;

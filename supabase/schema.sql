-- Rotation Planner database setup.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.

-- One row per student, holding their whole planner (classes, assignments,
-- activities, settings) as JSON.
create table if not exists public.planners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: a student can only ever see or change their own row.
-- The app's public "anon" key can't read anything without a signed-in user.
alter table public.planners enable row level security;

drop policy if exists "Read own planner" on public.planners;
create policy "Read own planner" on public.planners
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own planner" on public.planners;
create policy "Create own planner" on public.planners
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own planner" on public.planners;
create policy "Update own planner" on public.planners
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own planner" on public.planners;
create policy "Delete own planner" on public.planners
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Keep a single planner from growing without bound (about 1 MB).
alter table public.planners drop constraint if exists planners_data_size;
alter table public.planners add constraint planners_data_size
  check (pg_column_size(data) < 1000000);

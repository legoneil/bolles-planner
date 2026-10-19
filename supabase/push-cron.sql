-- Rotation Planner: send due reminders every 5 minutes.
-- Run this once, after push.sql and after deploying the `push` Edge Function.
-- If your project's address isn't fknaqhlakprrbfhmzsqf, change it below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace the job if it already exists.
select cron.unschedule(jobid) from cron.job where jobname = 'bolles-planner-push';

select cron.schedule(
  'bolles-planner-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://fknaqhlakprrbfhmzsqf.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select cron_secret from public.push_config where id = 1)
    ),
    body := '{"action": "send"}'::jsonb
  );
  $$
);

-- To check it's running: select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it: select cron.unschedule('bolles-planner-push');

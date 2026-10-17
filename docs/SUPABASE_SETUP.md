# Turning on accounts (Supabase)

Accounts let students sign in and see the same planner on their phone and laptop. The planner uses [Supabase](https://supabase.com) for this, and the free plan is enough. Setup takes about 10 minutes and you only do it once.

Until it's set up, the app still works but saves everything on each device only.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up (signing in with GitHub is easiest).
2. Click **New project**.
   - **Name:** `bolles-planner`
   - **Database password:** click *Generate*, then save it somewhere safe. The app doesn't need it.
   - **Region:** East US (closest to Jacksonville).
3. Wait a minute or two for it to finish setting up.

## 2. Create the database table

1. In the left sidebar, open **SQL Editor** and click **New query**.
2. Copy everything in [`supabase/schema.sql`](../supabase/schema.sql), paste it in, and click **Run**. It should say *Success. No rows returned*.

This creates a `planners` table with one private row per student. Row-level security means each student can only read and change their own planner, even though the app's key is public.

## 3. Set up sign-in

1. Open **Authentication → Sign In / Providers** (on older dashboards: *Providers → Email*).
   - Make sure **Email** is enabled.
   - Leave **Confirm email** on. Students click a link in their email before their first sign-in, which stops people signing up with someone else's address.
   - Set the minimum password length to **8**.
2. Open **Authentication → URL Configuration**.
   - **Site URL:** the address of the live planner, e.g. `https://legoneil.github.io/bolles-planner/`
   - **Redirect URLs:** add the same address, plus `http://localhost:4173/` for testing.

## 4. Connect the app

1. Open **Project Settings → API Keys** (older dashboards: *API*).
2. Copy the **Project URL** and the **publishable** key (`sb_publishable_...`). On older projects, the **anon / public** key works the same way.
3. Paste them into [`js/config.js`](../js/config.js):

   ```js
   export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```

   You can also paste them to Claude and it will do this step for you.

> **Never** put the secret key (`sb_secret_...`, or the legacy `service_role` key) in the app or send it to anyone. It bypasses all the privacy rules. The publishable key is the only one the app needs.

## Before lots of students sign up

- **Email limits:** Supabase's built-in email sender only sends a few emails per hour and is meant for testing. Once more than a handful of people are signing up, connect a free email service under **Authentication → Emails → SMTP Settings** (for example [Resend](https://resend.com), whose free tier is plenty).
- **Paused projects:** free projects pause after about a week with no activity (for example over summer). Resume it from the dashboard. No data is lost.
- **Younger students:** some Middle School students are under 13. Accounts are optional, and the app works fully without one. If you want to promote accounts to Middle School students, check with a parent or the school first.

## How sync works

- Each student's planner is one row in `planners` (`user_id`, `data`, `updated_at`).
- The app merges this device's copy with the account copy item by item, so edits on the phone and the laptop don't overwrite each other. Deleted items are remembered, so they don't come back.
- Sync runs a moment after each change, when the app is reopened, and when the device comes back online.
- Signing out offers to remove the planner from that device (recommended on shared or school computers).

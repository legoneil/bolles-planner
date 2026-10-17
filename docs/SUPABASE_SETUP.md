# Turning on accounts (Supabase)

Accounts let students sign in and see the same planner on their phone and laptop. The planner uses [Supabase](https://supabase.com) for this, and the free plan is enough. Setup takes about 20 minutes, including email (see *Before lots of students sign up*), and you only do it once.

> **This project's live setup:** the site is at https://legoneil.github.io/bolles-planner/ (GitHub Pages from the `claude/zealous-fermat-gt2k97` branch; the repo is public because free GitHub Pages requires it). Supabase uses a publishable key and Gmail SMTP from `bollesplanner@gmail.com`.

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

3. Do the same with [`supabase/friends.sql`](../supabase/friends.sql). This turns on comparing schedules with friends.

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

## 5. Turn on Schoology sync

Browsers aren't allowed to read Schoology calendar links directly, so the planner fetches them through a small Supabase Edge Function.

1. In the Supabase dashboard, open **Edge Functions** and choose **Deploy a new function → Via Editor**.
2. Name it exactly `schoology-ical`.
3. Replace the sample code with everything in [`supabase/functions/schoology-ical/index.ts`](../supabase/functions/schoology-ical/index.ts) and click **Deploy**.
4. Open the function's **Details** (or settings) and turn **off** "Verify JWT" / "Enforce JWT verification". The function checks the signed-in student itself, and the built-in check doesn't work with the new publishable keys.
5. Test it: sign in to the planner, paste your Schoology calendar link under **Settings → Schoology** and click **Sync now**. Your assignments should appear in **To-Do**.

What the function does:

- It only answers signed-in planner users, so it isn't an open proxy.
- It only fetches `https://*.schoology.com` links, including any redirects.
- It stores nothing: the calendar goes straight back to the student's device.
- It only allows the live site and `http://localhost:4173`. If the site's address changes, update `ALLOWED_ORIGINS` at the top of the file and deploy again.

Grades aren't in Schoology's calendar feed. Grades would need Schoology's official API, which Bolles has turned off for students.

## Before lots of students sign up

### Email (needed before anyone outside the project can sign up)

Supabase's built-in email sender only delivers to people on the Supabase project's team. Everyone else gets *"Email address not authorized"*, so students can't confirm their accounts until custom SMTP is set up.

**What this project uses: Gmail SMTP**

1. A separate Gmail account just for the app: `bollesplanner@gmail.com`.
2. On that account, turn on **2-Step Verification**, then create an **app password** (Google Account → Security → App passwords) named "Supabase".
3. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on **custom SMTP** and enter:

   | Setting | Value |
   | --- | --- |
   | Sender email | `bollesplanner@gmail.com` |
   | Sender name | `Bolles Planner` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | `bollesplanner@gmail.com` |
   | Password | the app password (store it only in Supabase, never in the repo) |

4. Save, then test it: send yourself a password-reset email from the app's sign-in screen and check that it arrives.

Turning on custom SMTP raises Supabase's limit to 30 emails an hour. You can change that under **Authentication → Rate Limits**.

**Limits to keep in mind**

- Gmail sends about 500 emails a day, and a brand-new account may start lower.
- Changing the Gmail account's password deletes its app passwords. Sign-up and password-reset emails stop until you make a new app password and paste it into Supabase.
- Some confirmation emails may land in spam. Tell students to check there.

**Switching to Resend later.** [Resend](https://resend.com) is the better long-term setup, but it needs a domain you own (for example `bollesplanner.com`, about $10–15 a year). On the free plan, without a verified domain, Resend only sends to your own address. A `github.io` address can't be verified. Once you have a domain, verify it in Resend, then swap the SMTP settings above for Resend's.

### Other things to know

- **Paused projects:** free projects pause after about a week with no activity (for example over summer). Resume it from the dashboard. No data is lost.
- **Younger students:** some Middle School students are under 13. Accounts are optional, and the app works fully without one. If you want to promote accounts to Middle School students, check with a parent or the school first.

## How sync works

- Each student's planner is one row in `planners` (`user_id`, `data`, `updated_at`).
- The app merges this device's copy with the account copy item by item, so edits on the phone and the laptop don't overwrite each other. Deleted items are remembered, so they don't come back.
- Sync runs a moment after each change, when the app is reopened, and when the device comes back online.
- Signing out offers to remove the planner from that device (recommended on shared or school computers).

## How friends work

- `profiles` holds a student's display name, friend code and the schedule they share (campus, grade, and each class's period, name, teacher, room and lunch order). It never includes assignments.
- `friendships` holds requests (`pending`) and friends (`accepted`).
- A student can read a profile only if it's their own or an accepted friend's. Requests show names only. There is no way to search for students; you need their friend code.
- Creating profiles, friend codes, requests and accepting all go through database functions, so nobody can make themselves someone's friend or pick a friend code.
- `npm test` checks all of this against a real Postgres with these exact SQL files (`tests/friends-sql.test.js`).

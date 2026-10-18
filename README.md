# Bolles Planner

A student-made planner for The Bolles School. It knows every 2026-27 letter day, bell schedule and school event for both the **Upper School (San Jose)** and **Middle School (Bartram)**, and puts each student's own classes, homework and tests on top of it.

> Not an official Bolles School app. Schedules are transcribed from the 2026-27 student planners; always check official school communications for changes.

## What it does

- **Today:** the letter day, what's happening now, your next class and room, what's due in each class, and anything overdue.
- **Week:** Monday through Friday, with each class in the order it meets that day and assignments attached to the class period they're due in.
- **Month:** letter days, holidays, exams and test load at a glance.
- **To-Do:** everything due, grouped by when, filterable by class or "tests & quizzes".
- **Plan:** every assignment gets a time estimate (a sensible default by type, or your own). Homework is planned for a free period or the evening before it's due; tests, quizzes, essays and projects are spread over the days before, around practices and activities. Today shows tonight's plan and the total time, the Plan page shows the week, and a night that doesn't fit your usual study time is flagged. Check off study sessions as you go.
- **Test load:** 2 tests on one day is marked a *heavy day*. 3 or more triggers an alert up to a week ahead so the student can ask a teacher to move one. It also warns when a test lands on a "no quizzes or tests" day.
- **"Due next class":** picks the next date the class actually meets, skipping holidays and letter days without that period.
- **Upper School lunch:** 3rd-block lunch order (lunch first or class first) is suggested from the planner's teacher list.
- **Schoology:** paste your Schoology calendar (iCal) link once and assignments sync every time you open the planner (signed-in students), or upload the `.ics` file. Tests and quizzes are recognised from their titles and matched to your classes.
- **Grades:** the *Bolles Planner Grades* Chrome extension reads your own Schoology grades page on your laptop and brings course grades, quarter grades and assignment scores into the planner (and to your phone). Private to you. See [docs/EXTENSION.md](docs/EXTENSION.md).
- **Sports and clubs:** recurring or one-time activities show up on the schedule.
- **Unplanned closures:** mark a hurricane day and that day's letter is skipped, as the school does.
- **Calendar export:** a `.ics` file for Google/Apple Calendar (assignments, letter days, events, and optionally every class meeting).
- **Accounts (optional):** sign in with email and password to save the planner online and use it on a phone and a laptop. Edits on different devices merge item by item. See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
- **Friends:** add friends by private friend code (requests must be accepted) and compare schedules: classes together, lunch together, free periods in common, and where each friend is right now. Friends see only your name and classes, never your homework.
- Dark mode, works offline, and can be added to an iPhone home screen.

## Running it

It's a static site with no build step and no dependencies.

```sh
npm start        # serves at http://localhost:4173
npm install      # once: installs PGlite, used to test the database rules
npm test         # unit tests (Node 20+)
```

To publish it, turn on **GitHub Pages** for this repository (Settings → Pages → *Deploy from a branch*, pick the branch with the app code and the `/ (root)` folder). Students open the link on their phone and tap **Share → Add to Home Screen**.

## Accounts

Accounts use [Supabase](https://supabase.com) (free plan). Follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) to create the project, run `supabase/schema.sql`, and paste the project URL and publishable (or legacy anon) key into `js/config.js`. With those left empty, the planner works on each device without accounts.

## Schoology sync

Browsers aren't allowed to read `bolles.schoology.com` links directly. For signed-in students the app fetches the calendar link through the `schoology-ical` Supabase Edge Function (`supabase/functions/schoology-ical/index.ts`; deploy steps in [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)). Signed-out students can upload the downloaded `.ics` file. If accounts are turned off entirely, `workers/schoology-proxy.js` is an optional self-hosted Cloudflare Worker you can point the app at under *Settings → Schoology → Advanced*.

## Project layout

| Path | What's in it |
| --- | --- |
| `js/data/bolles-2026-27.js` | Bell schedules, alt-schedule days, events, lunch teacher lists, rotation |
| `js/data/letters-2026-27.js` | The official letter for every class day, per campus |
| `js/schedule.js` | Builds a day: letter, status and blocks with the student's classes |
| `js/workload.js` | Heavy-day and 3-test alerts |
| `js/study.js` | Time estimates, free-period detection and the work plan |
| `js/ical.js` | Schoology/iCal import and `.ics` export |
| `js/store.js` | Saved data (localStorage), with every change stamped for syncing |
| `js/sync-merge.js` | Merges this device's planner with the account copy |
| `js/account.js` | Sign-in and sync with Supabase |
| `js/config.js` | Supabase project URL and publishable key |
| `js/compare.js` | Classes, lunch and free time in common with a friend |
| `js/friends.js` | Friend codes, requests and sharing your schedule |
| `supabase/schema.sql` | Planner table and privacy rules |
| `supabase/friends.sql` | Friends tables, privacy rules and functions |
| `supabase/functions/schoology-ical/` | Edge Function that fetches Schoology calendar links |
| `extension/` | Chrome extension that reads your Schoology grades page for the planner |
| `js/grades.js` | Receives grades from the extension and matches courses to your classes |
| `tests/support/supabase-sim.js` | Local Postgres stand-in for Supabase used by the tests |
| `js/views/*` | Today/Day, Week, Month, To-Do, Settings, onboarding |

### Updating for a new school year

Add a new pair of data files for the year (letters, bell schedules, special days, events) and point `js/schedule.js` at them. The tests in `tests/schedule.test.js` check that letter days only fall on weekdays and follow the A-G rotation.

## Not built yet

- Push notifications (export to your phone's calendar for reminders in the meantime).
- Sharing assignments with classmates.
- Grades on phones without a laptop (the extension needs Chrome on a computer).

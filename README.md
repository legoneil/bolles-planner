# Bolles Planner

A student-made planner for The Bolles School. It knows every 2026-27 letter day, bell schedule and school event for both the **Upper School (San Jose)** and **Middle School (Bartram)**, and puts each student's own classes, homework and tests on top of it.

> Not an official Bolles School app. Schedules are transcribed from the 2026-27 student planners; always check official school communications for changes.

## What it does

- **Today:** the letter day, what's happening now, your next class and room, what's due in each class, and anything overdue.
- **Week:** Monday through Friday, with each class in the order it meets that day and assignments attached to the class period they're due in.
- **Month:** letter days, holidays, exams and test load at a glance.
- **To-Do:** everything due, grouped by when, filterable by class or "tests & quizzes".
- **Test load:** 2 tests on one day is marked a *heavy day*. 3 or more triggers an alert up to a week ahead so the student can ask a teacher to move one. It also warns when a test lands on a "no quizzes or tests" day.
- **"Due next class":** picks the next date the class actually meets, skipping holidays and letter days without that period.
- **Upper School lunch:** 3rd-block lunch order (lunch first or class first) is suggested from the planner's teacher list.
- **Schoology:** import assignments from a Schoology calendar (iCal) link or `.ics` file. Tests and quizzes are recognised from their titles.
- **Sports and clubs:** recurring or one-time activities show up on the schedule.
- **Unplanned closures:** mark a hurricane day and that day's letter is skipped, as the school does.
- **Calendar export:** a `.ics` file for Google/Apple Calendar (assignments, letter days, events, and optionally every class meeting).
- Dark mode, works offline, and can be added to an iPhone home screen.

## Running it

It's a static site with no build step and no dependencies.

```sh
npm start        # serves at http://localhost:4173
npm test         # unit tests (Node 20+)
```

To publish it, turn on **GitHub Pages** for this repository (Settings → Pages → deploy from the `main` branch, root folder). Students open the link on their phone and tap **Share → Add to Home Screen**.

## Schoology sync

Browsers aren't allowed to read `bolles.schoology.com` links directly, so the app first tries the link and, if that's blocked, uses a small sync server. `workers/schoology-proxy.js` is a free Cloudflare Worker for this. Deploy it and paste its URL under *Settings → Schoology → Advanced*. Without it, students can still upload the downloaded `.ics` file.

## Project layout

| Path | What's in it |
| --- | --- |
| `js/data/bolles-2026-27.js` | Bell schedules, alt-schedule days, events, lunch teacher lists, rotation |
| `js/data/letters-2026-27.js` | The official letter for every class day, per campus |
| `js/schedule.js` | Builds a day: letter, status and blocks with the student's classes |
| `js/workload.js` | Heavy-day and 3-test alerts |
| `js/ical.js` | Schoology/iCal import and `.ics` export |
| `js/store.js` | Saved data (localStorage) |
| `js/views/*` | Today/Day, Week, Month, To-Do, Settings, onboarding |

### Updating for a new school year

Add a new pair of data files for the year (letters, bell schedules, special days, events) and point `js/schedule.js` at them. The tests in `tests/schedule.test.js` check that letter days only fall on weekdays and follow the A-G rotation.

## Not built yet

- Accounts and sync between devices (data currently lives on each device; use *Backup* to move it).
- Push notifications (export to your phone's calendar for reminders in the meantime).
- Comparing schedules with friends and sharing assignments with classmates.
- Grades from Schoology.

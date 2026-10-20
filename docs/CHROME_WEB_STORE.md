# Publishing the extension to the Chrome Web Store

Publishing lets students install **Rotation Planner Grades** in one click (Chrome and Edge, on Windows, Mac and Chromebooks) and get updates automatically. Everything below is ready to copy and paste.

## 1. One-time: developer account

1. Sign in to Google with the account that should own the listing. Using **bollesplanner@gmail.com** keeps it separate from personal accounts.
2. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and register: accept the developer agreement and pay the one-time **$5** fee. If the agreement requires you to be 18, a parent should register and you can be added to help manage it.
3. When asked whether you're a **trader** (EU rules), choose **non-trader**: the extension is free and not a business.

## 2. Upload

1. Get the zip: `rotation-planner-grades-1.0.0.zip` (built from the `extension/` folder with `manifest.json` at the top level of the zip).
2. Dashboard → **New item** → upload the zip.

## 3. Store listing tab

**Description** (paste as is):

```
Rotation Planner Grades brings your own Schoology grades into Rotation Planner (https://legoneil.github.io/rotation-planner/), a free planner made by a Bolles School student for Bolles students.

What it does
• Reads your own Schoology grades page (bolles.schoology.com) using the Schoology login already in your browser. It never sees your password.
• Shows course, semester, category and assignment grades in your planner, next to your class schedule and homework.
• Checks for new grades every 30 minutes while your browser is open. Opening any Schoology page also refreshes them.
• If you're signed in to Rotation Planner, sends your grades to your private planner account, so your phone shows them too.

Privacy
• Only reads bolles.schoology.com, and only your own grades page.
• Sends grades only to your own Rotation Planner account. Nobody else, including your friends in the planner, can see them.
• No ads, no analytics, no tracking. Nothing is sold.
• Remove your grades anytime: Rotation Planner → Settings → Grades → Remove grades from my planner.

Privacy policy: https://legoneil.github.io/rotation-planner/privacy.html

Student-made. Not affiliated with or endorsed by The Bolles School, Schoology or PowerSchool.
```

- **Category:** Education
- **Language:** English
- **Store icon:** `extension/icons/128.png`
- **Screenshots (1280×800):** `docs/store/1-grades.png`, `docs/store/2-updates.png`, `docs/store/3-phone.png`
- **Small promo tile (440×280):** `docs/store/promo-440x280.png`
- **Homepage URL:** `https://legoneil.github.io/rotation-planner/`
- **Support URL:** `mailto:bollesplanner@gmail.com` (or leave blank)

## 4. Privacy practices tab

**Single purpose:**
```
Shows the student's own Schoology grades in Rotation Planner, their personal school planner, and keeps them up to date.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the latest grades reading, when it was read, and the private link to the student's planner account, so the planner and the popup can show them. |
| `alarms` | Re-checks the student's grades every 30 minutes while the browser is open. |
| `offscreen` | The background service worker can't read HTML, so an offscreen document parses the grades page when the extension checks in the background. |
| Host: `bolles.schoology.com` | Reads the student's own grades page (/grades/grades) at their school's Schoology site, using the login already in their browser. Nothing else on Schoology is read or changed. |
| Host: `fknaqhlakprrbfhmzsqf.supabase.co` | Sends the grades to the student's own Rotation Planner account (the planner's server), so they appear on the student's phone. |
| Content script on `legoneil.github.io/rotation-planner` | Hands the grades to the Rotation Planner website when the student opens it. |

**Remote code:** No, I am not using remote code.

**Data usage:**
- Check **Website content** (the grades shown on the student's own Schoology grades page). Leave everything else unchecked.
- Check all three certifications: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.
- **Privacy policy URL:** `https://legoneil.github.io/rotation-planner/privacy.html`

## 5. Distribution tab

- **Visibility: Unlisted.** Only people with the link can install it; it won't appear in search. (Switch to Public later if you want.)
- **Regions:** all regions is fine.

## 6. Submit

Click **Submit for review**. The first review usually takes a few days; extensions that read a site's pages can take longer. You'll get an email at the account's address. If it's rejected, the email says why: send it to Claude.

Once it's approved, the store page has the install link. Share that instead of the zip, and add it to the planner (Settings → Grades, and `docs/EXTENSION.md`).

## Updating later

1. Bump `version` in `extension/manifest.json` (for example `1.0.1`).
2. Zip the `extension/` folder (with `manifest.json` at the top level).
3. Dashboard → the item → **Package** → **Upload new package** → **Submit for review**.

Installed copies update automatically within a few hours of approval.

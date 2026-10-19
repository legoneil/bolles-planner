# Rotation Planner Grades (Chrome extension)

Bolles turns off Schoology's API for students, so the planner can't fetch grades directly. This small Chrome extension works around that without anyone's approval: it reads **your own** Schoology grades page, the same page you see when you're logged in, and hands it to your planner.

- It only runs on Schoology pages and on the Rotation Planner website.
- It never sees or stores your Schoology password.
- Grades go only to your own planner account (using a private link key the planner gives the extension, which can do nothing except save your grades), so your phone shows them too. Friends never see them.
- Student-made, not affiliated with Bolles or Schoology.

## Install (about 2 minutes, on a laptop with Chrome)

1. Download the planner's code: open https://github.com/legoneil/rotation-planner, switch to the `claude/zealous-fermat-gt2k97` branch, click **Code → Download ZIP**, and unzip it.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the **`extension`** folder inside the unzipped code.
5. Pin it: click the puzzle-piece icon in Chrome's toolbar, then the pin next to **Rotation Planner Grades**.

School-managed laptops sometimes block step 3. If the Developer mode switch is greyed out, use a personal computer.

## Use

1. Log in to Schoology in Chrome as usual, and stay logged in.
2. Open the planner (https://legoneil.github.io/rotation-planner/) in Chrome once while signed in to your planner account. This links the extension to your account.

That's it. From then on:

- **Grades update on their own** every 30 minutes while Chrome is open, without opening Schoology. Opening **Grades** in Schoology refreshes them right away, and so does **Check Schoology now** (in the planner's Settings, or the extension's toolbar button).
- **New grades go straight to your account**, so your phone shows them even if the planner isn't open on the laptop.
- If you get logged out of Schoology, the extension says so; log back in and it picks up again.

The extension's toolbar button shows when it last read your grades and when it last sent them to your account. Signing out of the planner, or **Remove grades from my planner**, stops it sending to your account.

**Letters, not percentages.** The extension shows exactly what your Schoology grades page shows. At Bolles that's letter grades only (course, semester, category and assignment), so the planner shows letters too. The "(50%)" next to a semester or category is how much it counts toward the grade, not a score. Exact percentages are only available through Schoology's official API, which needs an API key from a teacher or administrator.

## If it says it couldn't read your grades

Schoology's page layout isn't documented and can change. If the extension can't find your courses:

1. Click the extension's toolbar button.
2. Click **Copy debug info for Claude** and paste it into the chat.

The debug info is only the page's layout (tag and class names), not your grades, names or any text from the page.

## Updating

Download the new code, then in `chrome://extensions` click **Remove** on **Rotation Planner Grades** and **Load unpacked** the new `extension` folder. Check the version number matches. Version 0.2.0 asks for two new permissions: running in the background (to check every 30 minutes) and talking to the planner's account server.

## Sharing with friends

Friends can install it the same way. To make it a one-click install, it would need to be published on the Chrome Web Store (one-time $5 developer fee, plus a short privacy policy).

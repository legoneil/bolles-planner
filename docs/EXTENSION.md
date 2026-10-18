# Bolles Planner Grades (Chrome extension)

Bolles turns off Schoology's API for students, so the planner can't fetch grades directly. This small Chrome extension works around that without anyone's approval: it reads **your own** Schoology grades page, the same page you see when you're logged in, and hands it to your planner.

- It only runs on Schoology pages and on the Bolles Planner website.
- It never sees or stores your Schoology password.
- Grades go only into your own planner, then sync to your account so your phone shows them too. Friends never see them.
- Student-made, not affiliated with Bolles or Schoology.

## Install (about 2 minutes, on a laptop with Chrome)

1. Download the planner's code: open https://github.com/legoneil/bolles-planner, switch to the `claude/zealous-fermat-gt2k97` branch, click **Code → Download ZIP**, and unzip it.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the **`extension`** folder inside the unzipped code.
5. Pin it: click the puzzle-piece icon in Chrome's toolbar, then the pin next to **Bolles Planner Grades**.

School-managed laptops sometimes block step 3. If the Developer mode switch is greyed out, use a personal computer.

## Use

1. Log in to Schoology in Chrome as usual. Visiting any Schoology page refreshes your grades in the background (at most every 30 minutes). Opening **Grades** in Schoology refreshes them right away.
2. Open the planner (https://legoneil.github.io/bolles-planner/) in Chrome on the same laptop. Your grades appear on **Today** and under **Grades**, and sync to your phone if you're signed in.

The extension's toolbar button shows when it last read your grades.

**Letters, not percentages.** The extension shows exactly what your Schoology grades page shows. At Bolles that's letter grades only (course, semester, category and assignment), so the planner shows letters too. The "(50%)" next to a semester or category is how much it counts toward the grade, not a score. Exact percentages are only available through Schoology's official API, which needs an API key from a teacher or administrator.

## If it says it couldn't read your grades

Schoology's page layout isn't documented and can change. If the extension can't find your courses:

1. Click the extension's toolbar button.
2. Click **Copy debug info for Claude** and paste it into the chat.

The debug info is only the page's layout (tag and class names), not your grades, names or any text from the page.

## Updating

After pulling new code, go to `chrome://extensions` and click the reload icon on **Bolles Planner Grades**.

## Sharing with friends

Friends can install it the same way. To make it a one-click install, it would need to be published on the Chrome Web Store (one-time $5 developer fee, plus a short privacy policy).

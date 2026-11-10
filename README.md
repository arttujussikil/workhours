# Work Hours

Track your working hours on different jobs from your iPhone.

This repo has two versions of the app:

| Folder | What it is | How it gets on the phone |
|---|---|---|
| `web/` | **Web app (the one in use).** Plain HTML/CSS/JS with no dependencies. Works offline. | Hosted on GitHub Pages, then *Share → Add to Home Screen* in Safari |
| `WorkHours/` + `WorkHours.xcodeproj` | Native SwiftUI/SwiftData app (iOS 17+) | Needs a Mac with Xcode 16+ |

## Features

- **Timer**: tap a job to start the clock and tap Stop when you're done. Tapping another job switches to it. Shows a live clock, earnings so far, and today's total.
- **Entries**: every work session grouped by day, with daily totals. Tap one to edit its start, end, break or note, or add hours you forgot to time.
- **Summary**: hours and earnings per week, month or year, with a stacked bar chart and per-job totals. The share button exports the period as CSV.
- **Jobs**: name, optional hourly rate and color. Also has the currency setting and backup/restore.

## Web app

### Install on iPhone

1. Open the GitHub Pages URL in **Safari** (it must be Safari).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open *Work Hours* from the home screen. It runs full-screen and works offline.

Data is stored only on the phone, in the home-screen app's own storage.
Use **Jobs → Save backup file** now and then and keep the file in iCloud Drive.
**Restore from backup…** brings it back on a new phone.

### Run locally

```bash
python -m http.server 8765 --directory web
```

Then open http://localhost:8765.

### Deploying

`.github/workflows/pages.yml` publishes `web/` to GitHub Pages on every push to `main` that changes it.
After you change a file in `web/`, bump `CACHE` in `web/sw.js` (e.g. `workhours-v2`).
Installed copies pick up the new version the next time they're opened (sometimes it takes two launches).

## Native iOS app

Open `WorkHours.xcodeproj` in Xcode 16+, set your signing team and a unique bundle ID, and press ⌘R.
A free Apple ID works, but the app must be reinstalled every 7 days.

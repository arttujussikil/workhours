# Work Hours

An iPhone app for tracking working hours across different jobs.
Built with SwiftUI and SwiftData (iOS 17+). All data stays on the phone.

## Features

- **Timer**: tap a job to start the clock and tap Stop when you're done. Starting another job stops the current one. Shows a live clock, earnings so far, and today's total.
- **Entries**: every work session grouped by day, with daily totals. Tap one to edit its start, end, break or note, or tap **+** to add hours you forgot to time. Swipe left to delete.
- **Summary**: hours and earnings per week, month or year, with a stacked bar chart and per-job totals. The share button exports the period as CSV, which you can open in Excel or Numbers.
- **Jobs**: add jobs with a name, an optional hourly rate and a color.

## Running it

You need a Mac with **Xcode 16 or newer**.

1. Open `WorkHours.xcodeproj`.
2. Select the **WorkHours** target → *Signing & Capabilities* → choose your Team (a free Apple ID works). Change the bundle ID `com.example.WorkHours` to something unique, e.g. `com.yourname.WorkHours`.
3. Plug in your iPhone (with Developer Mode on) or pick a simulator, then press ⌘R.

With a free Apple ID, apps installed on a device expire after 7 days. Just run it from Xcode again to reinstall it. Your data is kept.

## Project layout

```
WorkHours/
  WorkHoursApp.swift   app entry + tab bar
  Models.swift         Job and WorkEntry (SwiftData)
  TimerView.swift      start/stop timer
  EntriesView.swift    list of entries by day
  EntryEditView.swift  add/edit an entry
  JobsView.swift       manage jobs
  SummaryView.swift    totals, chart, CSV export
  Formatting.swift     duration/money formatting, colors
```

# 1. Reminder scheduling model

Date: 2026-06-30

## Status

Accepted

## Context

Reminders are evaluated by an in-app polling loop (`startReminderLoop` in
`src/lib/reminders.ts`), which runs a `tick()` every 60 seconds while the app
process is alive. Each tick finds tasks whose reminder is due (`isReminderDue`:
`nextFireAt <= now`, not dismissed, task still open) and surfaces them — a native
OS notification when the window is unfocused, an in-app toast (Snooze/Dismiss)
when focused — then advances the reminder (`advanceAfterFire`).

The loop only runs while the app is running. The app is designed to stay
resident: it minimizes to the system tray on close (the `closeBehavior` setting)
and can launch on login via autostart (`--minimized`). When the app is fully
quit, no reminders are evaluated. On next launch `checkMissedReminders` runs
once, advances any reminders that came due while the app was closed, and surfaces
a single grouped "You have N missed reminders" toast (it does not replay each as
a separate notification).

The alternative considered was **OS-level scheduling** — a Windows scheduled task
or scheduled/persistent OS notifications that fire without the app running.

## Decision

Ratify the **best-effort-while-running** in-app polling model. Reminders fire on
a ~60s cadence whenever the app is running (foreground, or resident in the tray),
and reminders missed while closed are reconciled on next launch via
`checkMissedReminders`.

We explicitly do **not** adopt OS-level scheduling, because:

- It is the heaviest path — a second scheduling surface to build, test, and keep
  in sync with the SQLite reminder state.
- Tauri v2 feasibility for app-independent scheduled notifications is unverified.
- The app is designed to sit in the tray (autostart + close-to-tray), so in
  practice it is almost always running; the residual gap is small.

For a single-user local desktop app, this trade-off is acceptable.

## Consequences

- **Limitation (stated plainly):** if the user fully **quits** the app (not just
  closes it to the tray), reminders are **dormant** — nothing fires until the app
  is reopened.
- `checkMissedReminders` is a **mitigation, not a guarantee**: on relaunch it
  advances and surfaces missed reminders, but they fire **late** (at relaunch),
  and a repeating reminder's intermediate fires that elapsed while the app was
  quit are **collapsed, not replayed**.
- The ~60s poll means a reminder can fire up to ~1 minute after its `nextFireAt`.
  This is the model's resolution and is accepted.
- Reminder reliability **depends on the app being resident**, so autostart and
  close-to-tray are load-bearing for correctness, not merely conveniences.
- The limitation is communicated where the user chooses close behavior: the
  first-run prompt (`CloseBehaviorDialog`) and the Settings → Window & startup
  copy both state that quitting stops reminders until the app is reopened.

## Notes

A small, optional discoverability hardening (making the "reminders only fire
while the app is running" limitation legible on the reminders-management surface)
is tracked with this work item. It does not change this decision; see the
work-item report for the ruling on whether to ship it.

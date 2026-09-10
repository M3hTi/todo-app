# CONTEXT.md — Todo App

Shared mental model for future sessions. Pairs with **CLAUDE.md** (agent
instructions / commands) and **docs/adr/** (decisions). This file is domain
language + current direction — it does not duplicate CLAUDE.md.

## What it is
Local-first **Windows desktop** todo app. Tauri v2 (Rust) native shell wrapping
a React 18 + TypeScript (strict) frontend; all persistence in SQLite via
`@tauri-apps/plugin-sql`. Single user, offline.

## Architecture (strictly one-directional)
UI (`src/components`, `src/features`) → Zustand stores (`src/store`) → typed
query modules (`src/lib/queries`) → SQLite. Stores never mutate in-memory state
without a corresponding DB write. Rust (`src-tauri/src/lib.rs`) owns **only** the
native shell — tray icon/menu/tooltip, close-to-tray, single-instance,
`update_tray`/`quit_app`. No business logic in Rust; the frontend computes tray
state and pushes it in.

## Ubiquitous language
- **Task** — core entity. `status` (Not Started / In Progress / Completed /
  Cancelled), `priority`, `dueDate` (YYYY-MM-DD) + `dueTime` (HH:mm), category,
  `tags[]`, `subtasks[]`, `reminder?`, `recurringRule?`, `sortOrder`, `notes`.
- **Subtask** — ordered child of a task; completable; drag-reorderable.
- **Category** — named+colored bucket; deleting **detaches** tasks (FK SET NULL).
- **Tag** — free-form label; auto-created on use, auto-pruned when unreferenced.
- **Reminder** — one flexible reminder per task. `mode` = `relative`
  (minutesBefore the due time) or `absolute` (`at`). Optional `repeatMinutes`.
  Lifecycle: `nextFireAt`, `lastFiredAt`, `dismissedAt`. "Due" when
  `nextFireAt <= now` AND not dismissed AND task is open. `advanceAfterFire`:
  repeating → reschedule from now; one-shot → dismiss.
- **RecurringRule** — `frequency` (Daily/Weekly/Monthly/Yearly) + `interval`,
  optional `daysOfWeek` / `dayOfMonth` / `endDate`. Completing a recurring task
  rolls the **same record** forward (status → Not Started, dueDate → next,
  completedAt → null) **and writes a Completion row** — the record holds only the
  *next* occurrence, so the log is the only per-day history. An expired rule (next
  occurrence > endDate) is cleared and the task stays Completed.
  A **missed** occurrence moves the due date too: at startup and at midnight,
  `rollForwardMissedRecurring` catches every open recurring task up to its first
  occurrence **on or after today** (whole rule-steps, so the cycle keeps its
  phase; no completion rows written, so the misses stay missed). Expired rules
  are skipped and stay overdue. See ADR-0004.
- **Completion** — one row in `task_completions` = "this task was done on this
  local day". **No row means not done that day**; misses are never written.
  Credited to the day the user clicked, *not* the occurrence satisfied, so days
  are independent (miss Monday, complete Tuesday → Monday stays missed). See
  ADR-0003. Carries `task_title` (snapshot — history survives deleting the task,
  `task_id` goes null) and `prev_due_date` / `prev_reminder_json` (undo snapshot).
  Written for one-off tasks too, so the heatmap has one source.
  Since v0.8.0 a **past** day is correctable from the history strip
  (`retroActionFor`): a `missed` cell writes a row for that `occurrence_date`, a
  recorded cell deletes one, and neither touches `status`, `dueDate`, the
  reminder or the roll-forward. A clear **ignores** the row's
  `prev_due_date`/`prev_reminder_json` — the anchor has moved on, and
  re-anchoring the live schedule to fix history is the worse bug. Today is never
  editable there; the checkbox owns it, side effects included. See ADR-0005.
- **Done today** — `isDoneToday(task, todayDone)` = one-off Completed **or** a log
  row for today. Drives checkbox state and the done visual **only**; filtering,
  sorting and the status badge still read `status`, because a recurring task
  genuinely is Not Started for tomorrow.
- **Occurrence** — `isOccurrenceOn(rule, date, anchorDueDate)` replays a rule
  backwards from the due date, so a history view can tell a genuinely **missed**
  day from one that was **never scheduled** (a Mon/Wed task owes nothing on
  Tuesday). Days before the task's `createdAt` are never "missed".
- **Due-date patch** (`dueDatePatch` in `src/lib/reminder.ts`) — the only
  sanctioned way to move or clear a due date. `updateTask` does not touch
  reminders, so a bare `{ dueDate }` write would leave a *relative* reminder
  ("30 min before due") firing against the old date; an absolute one keeps its
  own date and is left alone.
- **Reminder loop** (`src/lib/reminders.ts`) — 60s in-app poll. Native
  notification when the window is unfocused, in-app toast (Snooze/Dismiss) when
  focused. `checkMissedReminders` catches up on launch. **App must be running**
  (autostart + close-to-tray keep it alive).
- **Tray payload** (`src/lib/tray.ts`) — frontend computes today/upcoming/overdue
  + tooltip and pushes to Rust via `update_tray` (debounced).
- **Day key** — every occurrence date is a **local** `yyyy-MM-dd` from date-fns
  `format`, never `toISOString().slice(0,10)` (UTC), which misfiles evening work
  by a day. The app is built to run for days, so "today" is not resolved once:
  `useCompletionStore.dayKey` is re-checked on the existing 60s reminder tick
  (`refreshIfDayChanged`, above the loop's early return) and reloads at midnight.
- **Activity heatmap** (`src/components/shared/ActivityHeatmap.tsx`) — 53-week
  GitHub-style grid on the dashboard, counting Completion rows per day. Pure CSS
  grid, no chart library. Fixed intensity buckets (`0 / 1–2 / 3–5 / 6–9 / 10+`)
  via `--heat-0…4` tokens, so a square keeps its colour as history grows. The
  dashboard **streak** reads the same log — the old `completedAt` scan counted
  zero days for recurring tasks.
- **Habit stats** (`habitStats` in `src/lib/completions.ts`) — streak, adherence
  and recent misses for one recurring task, derived from the completion log and
  the rule; **no schema, no query of its own**. Window is
  `HABIT_WINDOW_DAYS` = 30. *Scheduled* = `isOccurrenceOn` and on/after the
  task's creation day; *missed* = scheduled, past, no row; *pending* days count
  as neither (a streak must not expire at 00:01). An **off-schedule completion**
  counts in neither side of adherence — it satisfied nothing the rule asked for
  — though the strip still shows it. The streak walk **skips** unscheduled days
  rather than breaking on them (a Mon/Wed habit keeps its streak over Tuesday)
  and is bounded at `STREAK_LOOKBACK_DAYS` = 366. A repeat with **no due date**
  has no anchor, so stats are `null`, not zero. Read by the detail strip, the
  `N missed` row badge and `/habits`. Spec:
  `docs/superpowers/specs/2026-09-08-habit-depth.md`. Correcting a past day
  re-runs all of it: the strip's effect watches `completionsByTask`, so an
  in-strip write reloads the squares and the numbers together.
- **Close behavior** — `ask` / `tray` / `quit` setting; first-run dialog.
- **Command palette** (`CommandPalette.tsx`) — Ctrl+K; tasks (matched on title,
  tags and notes) plus New task and view navigation.
- **Task row context menu** (`TaskContextMenu.tsx`) — right-click a `TaskCard`:
  complete/uncomplete, priority, quick due date, delete. Marks its target with
  `data-state=open` styling but does **not** select the row. WebView2's own menu
  is suppressed app-wide in production except in text fields (`AppShell`).
- **Quick-add hotkey** — system-wide Ctrl+Alt+A, owned by Rust; emits the same
  `tray://add-task` event the tray menu does.
- **Backups** — every launch snapshots the DB + WAL sidecars into
  `%APPDATA%\com.asus.todo-app\backups\<timestamp>\`, newest 5 kept.
- **Update check** (`src/lib/updater.ts`) — once per launch against the GitHub
  release feed; offers download-install-restart. Silent on failure.

## Current state (2026-09)
v0.8.0 is the current release — the history strip's past days are **editable**.
v0.7 made misses visible in three places and left no way to say "I did that one,
I just forgot to tick it"; now a click on a red square records the day and a
click on a recorded one clears it. The write is the completion log and nothing
else (ADR-0005), so adherence, the streak, the `N missed` badge and the
dashboard heatmap all follow from the same rows with no extra code — no
migration, no new query, no new store field. v0.7.0 delivered habit depth:
`habitStats` (streak / adherence / misses over a 30-day window), the stats line
under the strip, the `N missed` row badge and the `/habits` page. v0.7.1 stopped
the calendar painting past occurrences of recurring tasks.
v0.6.1 — the calendar no longer paints a recurring
task across every cell ahead of it. A daily rule genuinely does recur every
day, so grading the whole future was accurate and unreadable; the past keeps
its full done/missed history and exactly **one** occurrence is projected past
today, taken from `upcomingDueDate` so the grid and Upcoming cannot disagree
about what comes next. The cap follows each rule's own step, so a monthly
repeat still reaches into next month. `endDate` is not consulted for display —
`Until` says when a habit stops, not how it is drawn — and `occurrencesFor`
now agrees with `buildDayStrip` on every past day, which it briefly did not.
v0.6.0 made recurring tasks tracked per
*occurrence*: the calendar grades every projected occurrence against the
completion log (done/missed/pending) instead of showing only the one date the
record is parked on, and Upcoming lists the next occurrence whether or not
today's is done. A repeat rule with **no due date** has no anchor and therefore
schedules nothing — `isOccurrenceOn` previously fell back to anchoring on the
day under test, which matched every day for every frequency and invented a
missed history; such tasks now show only the days they were actually completed,
and completing one no longer silently assigns it a due date.
v0.5.2 made the native Windows title bar follow the
app theme (`window.setTheme()` in `applyTheme`). v0.5.1 caught missed recurring
tasks up to today; v0.5.0 added the task-row context menu (spec:
`docs/superpowers/specs/2026-08-29-context-menus.md`). v0.4.x shipped per-day
completions + the activity heatmap (migration **v3**, `task_completions`). This closed a real gap — a
recurring task previously kept *no* completion history at all, so days could not
be tracked independently and the streak never counted a habit. Plan:
`docs/superpowers/plans/2026-08-26-per-day-completions-heatmap.md`; decision:
ADR-0003. Verified against the real database (migration, backfill incl. the
UTC→local correction, undo snapshot, export/reset/import round-trip).

v0.2.3 was the first release this project's automation delivered
end-to-end (tagged, built, published). v0.3.0 adds the engineering floor and the
product ceiling from `docs/ROADMAP.md`: CI on push/PR, the in-app auto-updater,
a WebDriver E2E smoke suite, launch-time DB backups, the Ctrl+K palette, the
global quick-add hotkey and search across notes/tags/subtasks.

Before that, the **hardening pass landed** — recurrence
due-date anchor (ADR-0002), truthful reload-failure reporting, split
import parse-vs-schema errors, `assembleTasks` scoped SELECTs, `recurrence.test.ts`,
3 dead query fns removed, and `fs:scope` narrowed `**` → `$HOME`/`$APPDATA`/`$DOWNLOAD`
(**defense-in-depth only** — the dialog plugin auto-grants picked paths, so
import/export are NOT gated by `fs:scope`).

Four ADRs are written and ratified: `docs/adr/0001-reminder-scheduling-model.md`
(in-app 60s polling, not OS scheduling),
`docs/adr/0002-recurrence-rollforward-anchor.md` (due-date anchor, skip missed)
`docs/adr/0003-completion-day-anchor.md` (completions credited to the day the
work happened; a row means done, absence means not done) and
`docs/adr/0004-catch-up-missed-recurring-due-dates.md` (a missed recurring task
catches up to today at startup / midnight).

## Roadmap
**`docs/ROADMAP.md`** — correcting the record (post-v0.7): the history strip's
past days become clickable, so a day you did but forgot to tick can be recorded
(and a wrong one cleared) without touching `dueDate`, reminders or status.
Decision `docs/adr/0005-retroactive-completion.md`, spec
`docs/superpowers/specs/2026-09-10-retroactive-check-off.md`, plan
`docs/superpowers/plans/2026-09-10-retroactive-check-off.md`. **Landed in
v0.8.0**, which retired the retroactive-check-off non-goal. The habit-depth pass
it replaces (all of it in v0.7.0) is kept as a record at the bottom of the same
file.

## Standing non-goals
- **Cloud sync / multi-device** — contradicts local-first single-user; a
  rearchitecture, not a feature.
- **OS-level reminder scheduling** — ADR-0001 ratified in-app polling.
- `fs:scope` is NOT a lever to restrict import/export locations (dialog overrides
  it); that would need app-level path-allowlist validation.
- Vestigial `reminder_at` / `reminder_shown_at` columns left as-is (SQLite
  DROP COLUMN out of scope).
- **SQLite FTS5** — search is a substring scan over the in-memory task list.
  Revisit only if a list outgrows a per-keystroke scan (see ROADMAP item 8).
- **One task row per occurrence** — rejected in ADR-0003. The completion log
  gives per-day history without unbounded row growth or rewriting every query.
- **Treating recurrence as an obligation ledger** — a missed occurrence now
  advances the due date (ADR-0004), so the app shows the next cadence date, not
  a count of what was skipped. Misses live in the completion log, the history
  strip and — since v0.7.0 — the `N missed` badge on the task row.
- **Logging work on days the rule never scheduled** — the strip can correct a
  scheduled day or a recorded one (ADR-0005), but a past day the rule never asked
  for stays read-only. "Log arbitrary work" is a different feature from
  "correct the record".
- **Bulk catch-up** ("mark the whole week") — same write as the per-day
  correction, so it is a UI decision, not an architectural one. Not built until
  someone hits a backlog the strip is too fiddly for.
- **A `retroactive` flag on a completion row** — no reader. `completed_at` says
  when it was typed, `occurrence_date` which day it credits; a column nothing
  reads is a migration for nothing.
- **Per-habit targets** ("3× a week") — a second schedule competing with the
  rule. The rule is the schedule.

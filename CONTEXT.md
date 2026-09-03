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

## Current state (2026-08)
v0.5.0 is the current release — the task-row context menu (spec:
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
**`docs/ROADMAP.md`** — now a completed record of the post-v0.2 pass, kept until
a new roadmap replaces it. This file no longer carries a roadmap section.

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
  a count of what was skipped. Misses live in the completion log and the history
  strip. An "N missed" badge is the upgrade path, not shipped.
- **Adherence metrics** ("4 of 7 scheduled days") — derivable via
  `isOccurrenceOn`, not shipped. The heatmap is an *activity* view by design.

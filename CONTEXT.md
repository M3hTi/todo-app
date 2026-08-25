# CONTEXT.md — Todo App

Shared mental model for future sessions. Pairs with **CLAUDE.md** (agent
instructions / commands) and **docs/adr/** (decisions). This file is domain
language + current direction — it does not duplicate CLAUDE.md.

## What it is
Local-first **Windows desktop** todo app. Tauri v2 (Rust) native shell wrapping
a React 18 + TypeScript (strict) frontend; all persistence in SQLite via
`@tauri-apps/plugin-sql`. Single user, offline, **feature-complete as of v0.2**.

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
  completedAt → null). An expired rule (next occurrence > endDate) is cleared and
  the task stays Completed.
- **Reminder loop** (`src/lib/reminders.ts`) — 60s in-app poll. Native
  notification when the window is unfocused, in-app toast (Snooze/Dismiss) when
  focused. `checkMissedReminders` catches up on launch. **App must be running**
  (autostart + close-to-tray keep it alive).
- **Tray payload** (`src/lib/tray.ts`) — frontend computes today/upcoming/overdue
  + tooltip and pushes to Rust via `update_tray` (debounced).
- **Close behavior** — `ask` / `tray` / `quit` setting; first-run dialog.

## Current state (2026-08)
v0.2.3, feature-complete. The **hardening pass is done and landed** — recurrence
due-date anchor (ADR-0002), truthful reload-failure reporting, split
import parse-vs-schema errors, `assembleTasks` scoped SELECTs, `recurrence.test.ts`,
3 dead query fns removed, and `fs:scope` narrowed `**` → `$HOME`/`$APPDATA`/`$DOWNLOAD`
(**defense-in-depth only** — the dialog plugin auto-grants picked paths, so
import/export are NOT gated by `fs:scope`).

Both ADRs are written and ratified: `docs/adr/0001-reminder-scheduling-model.md`
(in-app 60s polling, not OS scheduling) and
`docs/adr/0002-recurrence-rollforward-anchor.md` (due-date anchor, skip missed).

## Roadmap
Post-v0.2 direction lives in **`docs/ROADMAP.md`** — ship/CI/updater first, then
E2E + backups, then product features (global hotkey, FTS5 search, command
palette). This file no longer carries a roadmap section.

## Standing non-goals
- **Cloud sync / multi-device** — contradicts local-first single-user; a
  rearchitecture, not a feature.
- **OS-level reminder scheduling** — ADR-0001 ratified in-app polling.
- `fs:scope` is NOT a lever to restrict import/export locations (dialog overrides
  it); that would need app-level path-allowlist validation.
- Vestigial `reminder_at` / `reminder_shown_at` columns left as-is (SQLite
  DROP COLUMN out of scope).

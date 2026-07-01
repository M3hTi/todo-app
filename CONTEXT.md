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

## Current state (2026-06)
v0.2.0, feature-complete per the architecture review. Cleanup landed on branch
`chore/review-cleanups`: added `recurrence.test.ts`; removed 3 dead query fns +
support cast; narrowed `fs:scope` `**` → `$HOME`/`$APPDATA`/`$DOWNLOAD`
(**defense-in-depth only** — the dialog plugin auto-grants picked paths, so
import/export are NOT gated by `fs:scope`).

## Decisions in flight (ADRs to be written — see roadmap)
- **ADR-001 Reminder scheduling model** — ratify in-app 60s polling (best-effort
  while running), document the one caveat (fully quit → missed until relaunch,
  mitigated by `checkMissedReminders`), + one small hardening. Not OS scheduling.
- **ADR-002 Recurrence roll-forward anchor** — change from **completion-time**
  anchor to **due-date** anchor (roll forward to the next *future* occurrence).
  Today `getNextDueDate` is called with `completedAt`; intent is to anchor on
  `dueDate`.

## Active roadmap — HARDENING ONLY (no new features), weekend / incremental
Ordered: ADRs first, then implementation.
1. **ADR-001** reminder scheduling model (+ small hardening)
2. **ADR-002** recurrence roll-forward anchor
3. **Recurrence due-date anchor** — implement + tests (gated by ADR-002)
4. **Uncaught reload rejections** — try/catch + toast on `loadTasks` + cascade reloads
5. **Import error clarity** — split JSON-parse vs Zod-shape toast messages
6. **assembleTasks over-read** — scope the subtask/tag SELECTs by task id
- **Cut:** browser-dev DB throw (`npm run dev` without Tauri) — desktop-only by design.

## Non-goals (this pass)
- No new user-facing features.
- No OS-level reminder scheduling.
- `fs:scope` is NOT a lever to restrict import/export locations (dialog overrides
  it); that would need app-level path-allowlist validation.
- Vestigial `reminder_at` / `reminder_shown_at` columns left as-is (SQLite
  DROP COLUMN out of scope).

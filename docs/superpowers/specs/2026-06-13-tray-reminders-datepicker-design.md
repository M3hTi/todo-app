# Design: System Tray, Smarter Reminders, and a Real Date Picker

- **Date:** 2026-06-13
- **Status:** Approved (ready for implementation planning)
- **App:** Todo App — Tauri v2 + React 18/TypeScript, SQLite via `@tauri-apps/plugin-sql`

## Overview

Four user-facing upgrades to the Windows desktop Todo App:

1. **Close-to-tray** — the window's "X" minimizes to the system tray (IDM-style) instead of quitting, governed by a setting with a first-run prompt.
2. **Tray menu** — right-clicking the tray icon lists today's and upcoming tasks plus quick actions; the tray also shows a tooltip and an overdue badge.
3. **Smarter reminders** — one flexible reminder per task that can be relative ("30 min before due") or absolute ("Jun 20, 10:00"), with an optional repeat (every 15 min / hourly) that stops when the task is done or the reminder is dismissed.
4. **Date picker** — a themed calendar popover with quick chips replaces the native `<input type="date">`.

Plus three companion features: **launch on startup**, **tray tooltip + overdue badge**, and a **notification "Snooze 15 min" action**.

## Goals

- Keep the app resident in the tray so reminders (including repeating ones) actually fire in the background.
- Preserve the project convention: **all app/data logic stays in the React frontend; Rust only owns the native tray/window shell** (`CLAUDE.md`).
- Extend the existing data model with minimal, migration-safe schema changes.

## Non-Goals

- **OS-scheduled reminders.** Reminders fire **only while the app is running** (tray-resident counts). If the user fully **Quits**, no reminders fire until the next launch, at which point missed reminders surface as a grouped toast (existing behavior, preserved). True OS-level scheduling (Windows Task Scheduler / a background service) is explicitly out of scope for this round. This must be documented in-app/settings copy so the trade-off is clear.
- **Rich tray panel UI.** The tray menu is a native, text-only Windows menu (task titles as menu items), not a custom mini-window. A custom anchored window is a possible future upgrade.
- **Multiple reminders per task.** One flexible reminder rule per task this round.
- Mobile targets. Tray and autostart are desktop-only and guarded accordingly.

## Architecture Decision: Frontend-Driven Tray (Approach A)

Rust creates and owns the **native tray icon, tooltip, menu, and the window close-interception**, but holds **no task logic**. The React frontend remains the single source of truth (SQLite) and:

- **pushes** tray state (tooltip text, today/upcoming task lists, overdue count) into Rust via an `update_tray` command whenever the task store changes (debounced — see below);
- **receives** events from Rust (`close-requested`, `tray://open-task`, `tray://add-task`) and decides what to do.

Rejected alternatives: a custom anchored mini-window (much more work — positioning, hide-on-blur, second-window lifecycle), and having Rust read SQLite directly (duplicates data logic in Rust, violates the convention).

## Frontend ↔ Rust Contract

### Commands (JS → Rust)

- `update_tray(payload: TrayPayload)` — rebuild the tray menu, set the tooltip, and select the icon variant.
  ```ts
  interface TrayMenuItem { id: string; label: string }   // label includes time/day suffix
  interface TrayPayload {
    tooltip: string;                  // e.g. "Today: 3 · Overdue: 1"
    overdue: number;                  // drives the icon-variant swap
    today: TrayMenuItem[];
    upcoming: TrayMenuItem[];
  }
  ```
- `quit_app()` — calls `app_handle.exit(0)`. (A custom command avoids pulling in `tauri-plugin-process`.)

Window show/hide/focus is done from JS via `@tauri-apps/api/window` (`getCurrentWindow().hide()/show()/setFocus()/unminimize()`), not custom commands.

### Events (Rust → JS)

- `close-requested` — emitted when the user clicks "X"; the frontend decides (prompt / hide / quit).
- `tray://open-task` `{ id: string }` — a task menu item was clicked.
- `tray://add-task` — the "Add task…" item was clicked.

"Show Todo App" and "Quit" menu items, and left-click on the tray icon, are handled in Rust directly (show+focus the window; `quit_app` semantics).

## Section 1 — Close-to-Tray + Quit (backbone)

### Rust (`src-tauri/src/lib.rs`)
- Add a window event handler: on `WindowEvent::CloseRequested`, call `api.prevent_close()` and emit `close-requested` to the frontend. Rust never decides close behavior itself.
- Add the `quit_app` command and register it in the invoke handler.

### Frontend
- New hook `src/hooks/useCloseBehavior.ts` (mounted once in `App`): listens for `close-requested` and:
  - `closeBehavior === 'ask'` → open the first-run dialog;
  - `closeBehavior === 'tray'` → `getCurrentWindow().hide()`;
  - `closeBehavior === 'quit'` → `invoke('quit_app')`.
- New component `src/components/layout/CloseBehaviorDialog.tsx` — the IDM-style prompt: "Keep Todo App running in the tray?" with a "Remember my choice" checkbox and **Minimize to tray** / **Quit** buttons. On choice (with remember checked) it persists `closeBehavior` and acts immediately.
- **Settings** ("When I close the window"): radio between *Minimize to tray* and *Quit*, writing `closeBehavior`.

### Settings additions
Settings are key-value JSON rows (no schema migration needed). Add to `AppSettings` (and the mirrored `DEFAULTS`/`DEFAULT_SETTINGS` in `src/types/index.ts`, `src/store/useSettingsStore.ts`, `src/lib/queries/settings.ts`, `src/lib/db.ts`):
- `closeBehavior: 'ask' | 'tray' | 'quit'` (default `'ask'`)
- `launchOnStartup: boolean` (default `false`)

## Section 2 — Tray Icon, Menu, Tooltip, Badge

### Rust
- Enable the `tray-icon` feature on the `tauri` crate (tray is built into core in v2 — no extra plugin).
- Build the tray on setup using the existing `icon.ico`; add one "alert" icon variant asset for the overdue state.
- **Left-click** → show + focus the window. **Right-click** → context menu.
- `update_tray` rebuilds the `Menu` from the payload:
  ```
  Todo App
  ─────────────────────
  Today (N)
    <task label>            (one MenuItem per task; id = task id)
    …
  Upcoming
    <task label>
    …
  ─────────────────────
  + Add task…
  Show Todo App
  Quit
  ```
  - Task menu-item clicks emit `tray://open-task { id }`. "Add task…" emits `tray://add-task`. "Show"/"Quit" handled in Rust.
  - Set the tooltip from `payload.tooltip`; swap to the alert icon when `payload.overdue > 0`, else the normal icon.
  - Empty sections are omitted; cap each list at a reasonable length (e.g. 10) with a trailing "…" item if truncated.

### Frontend
- New module `src/lib/tray.ts`: builds a `TrayPayload` from the task store (today = due today or created today, matching `TodayView`; upcoming = open tasks with a future due date, matching `UpcomingView`; overdue via `isTaskOverdue`), and calls `update_tray`.
- New hook `src/hooks/useTray.ts` (mounted once in `App`):
  - subscribes to the task store; **debounces** `update_tray` pushes (~250–300 ms trailing) so bulk task updates rebuild the menu once, not repeatedly;
  - listens for `tray://open-task` → `getCurrentWindow().show()/setFocus()` then navigate to the task / open its detail;
  - listens for `tray://add-task` → show window + open the TaskForm.
- Desktop-only guards so this is inert under non-desktop builds.

### Permissions (`src-tauri/capabilities/default.json`)
Add: `core:tray:default` (and menu permissions if required by the version), `core:window:allow-hide`, `core:window:allow-show`, `core:window:allow-set-focus`, `core:window:allow-unminimize`.

## Section 3 — Launch on Startup

- Add `tauri-plugin-autostart` (Cargo + `@tauri-apps/plugin-autostart`), initialized to launch the app **minimized to the tray**.
- The Settings toggle calls the plugin's `enable()/disable()` and persists `launchOnStartup`.
- Permissions: `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled`.
- On autostart launch, start with the window hidden (tray only).

## Section 4 — Reminder Rework

### Data model (`src/types/index.ts`)
```ts
export interface Reminder {
  mode: 'relative' | 'absolute';
  minutesBefore?: number;   // relative: minutes before due
  at?: string;              // absolute: ISO datetime
  repeatMinutes?: number;   // undefined/0 = fire once; else 15 | 30 | 60 | 120 | 1440
  nextFireAt: string;       // runtime: next scheduled fire (ISO)
  lastFiredAt?: string;
  dismissedAt?: string;     // set on Dismiss → stops repeats
}
```
`Task` gains `reminder?: Reminder`. The legacy `reminderAt` / `reminderShownAt` fields are deprecated (kept on the type only as long as needed for migration mapping, then removed from active use).

### Storage + migration (`src/lib/db.ts`, `src/lib/queries/tasks.ts`)
- Store `reminder` as a JSON blob in a new `tasks.reminder_json` column, mirroring the existing `recurring_rule_json` pattern (parse on read, stringify on write in `mapTask`/`createTask`/`updateTask`).
- **Migration v2** (append to `MIGRATIONS`):
  - `ALTER TABLE tasks ADD COLUMN reminder_json TEXT`
  - Backfill rows where `reminder_at IS NOT NULL` into `{ mode:'absolute', at:reminder_at, nextFireAt:reminder_at }` via `json_object(...)` (SQLite JSON1).
  - For rows where `reminder_shown_at IS NOT NULL`, set the migrated reminder's `dismissedAt = reminder_shown_at` (separate `UPDATE`, using `json_set`) so already-fired reminders never re-fire.
  - Old `reminder_at` / `reminder_shown_at` columns are left in place (unused) — avoids a risky column drop on SQLite.

### Loop rework (`src/lib/reminders.ts`)
- **Due** when: `reminder` exists, `dismissedAt` unset, task not `Completed`/`Cancelled`, and `nextFireAt <= now`.
- **On fire:** send the OS notification, set `lastFiredAt = now`, then:
  - if `repeatMinutes` → `nextFireAt = now + repeatMinutes`;
  - else clear the reminder's scheduling (one-shot complete; set `dismissedAt = now` so it won't refire).
- **Stop conditions:** task done/cancelled OR dismissed (no end-time, no fixed count — per decision).
- **Snooze (15 min):** `nextFireAt = now + 15m`. **Dismiss:** `dismissedAt = now`.
- **Missed-while-closed:** preserve the grouped-toast summary for one-shot reminders; repeating reminders simply reschedule `nextFireAt` forward to the next future slot.
- Helper to compute the initial `nextFireAt` from the rule: relative → `due − minutesBefore` (due defaults to 09:00 when no time, as today); absolute → `at`.

### Notifications
- Where Windows supports toast actions, attach **"Snooze 15 min"** and **"Dismiss"** action buttons.
- Reliable fallback regardless of platform support: the in-app **sonner toast** carries Snooze/Dismiss buttons, and the **task detail panel** always exposes both. (Best-effort native actions, per decision.)

### UI
- New shared `src/components/tasks/ReminderEditor.tsx`, replacing the simple reminder `Select` in `TaskForm` ([TaskForm.tsx:247](../../../src/components/tasks/TaskForm.tsx)) and reused in `TaskDetail`:
  - mode toggle: **X before due** / **At a date & time**;
  - the value control (minutes-before select, or a date+time picker for absolute);
  - a **"Repeat every…"** select (Off / 15 min / 30 min / Hourly / Every 2 h / Daily).
- Replace `computeReminderAt` with a `buildReminder(...)` helper producing a `Reminder` object.

## Section 5 — Calendar Popover + Quick Chips

- Add dependencies: `react-day-picker` and `@radix-ui/react-popover` (`date-fns` already present).
- New shadcn-style primitives: `src/components/ui/calendar.tsx` (react-day-picker, themed with existing CSS-variable tokens) and `src/components/ui/popover.tsx` (Radix).
- New `src/components/shared/DatePicker.tsx`: a popover calendar with quick chips — **Today / Tomorrow / This weekend / Next week** — and a matching time popover.
- Replace native `type="date"` inputs in `TaskForm`, `TaskDetail`, and the recurrence **"Until"** field ([TaskForm.tsx:482](../../../src/components/tasks/TaskForm.tsx)). Output stays `YYYY-MM-DD` (and `HH:mm` for time) so the existing zod schema and DB shape are unchanged.

## Build Order

1. **Tray backbone** — `tray-icon` feature, tray creation, `CloseRequested` interception + `close-requested` event, `quit_app` command, `useCloseBehavior`, `CloseBehaviorDialog`, `closeBehavior` setting + Settings radio.
2. **Tray menu/tooltip/badge** — `update_tray` command + menu rebuild, `src/lib/tray.ts`, `useTray` (debounced), open-task/add-task events, tooltip + overdue icon swap, permissions.
3. **Launch on startup** — autostart plugin + Settings toggle + start-hidden behavior.
4. **Reminder rework** — types, migration v2, query mapping, loop rework, `ReminderEditor`, snooze/dismiss.
5. **Date picker** — primitives + `DatePicker` + chips, swap in the three usages.

Items 4 and 5 are independent of 1–3; the order above is the default unless implementation reveals a reason to swap.

## Dependencies & Permissions Summary

- **Cargo:** `tauri` `features = ["tray-icon"]`; add `tauri-plugin-autostart = "2"`.
- **npm:** `react-day-picker`, `@radix-ui/react-popover`, `@tauri-apps/plugin-autostart`.
- **Capabilities:** tray + window hide/show/focus/unminimize + autostart permissions (listed per section).

## Testing

- **Reminder logic** is the highest-value unit-test target (pure functions): due detection, repeat rescheduling, snooze/dismiss transitions, stop-on-done, initial `nextFireAt` from relative/absolute rules, missed-while-closed handling.
- **Migration v2**: verify backfill maps legacy `reminder_at`/`reminder_shown_at` correctly and is idempotent.
- **Tray payload builder** (`src/lib/tray.ts`): today/upcoming/overdue selection matches the existing views.
- Manual verification for the native pieces (close interception, tray menu clicks, autostart, notification actions) since they cross the Rust/OS boundary.

## Risks / Notes

- **Notification action support on Windows** is uneven across Tauri/WebView2 versions — hence the in-app Snooze/Dismiss fallback is mandatory, not optional.
- **Reminders depend on the app running** — must be clearly surfaced in settings copy (see Non-Goals).
- **Settings `DEFAULTS` are duplicated** across four files today; adding `closeBehavior`/`launchOnStartup` means updating all four. (Out of scope to refactor, but noted.)
- **First close before a choice is made:** because Rust always prevents close and delegates to the frontend, the very first "X" reliably shows the prompt rather than quitting.

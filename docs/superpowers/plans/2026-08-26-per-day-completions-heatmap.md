# Per-Day Completions + Activity Heatmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status:** grilled 2026-08-26. Every decision in the table below is settled — implement it, don't re-open it.

**Goal:** (1) Record a task's completion **independently per day**, so a missed Monday stays missed and Tuesday's completion stands on its own. (2) Add a GitHub-style **Activity Heatmap** of daily completion volume.

**The bug today:** completing a recurring task rewrites the *same* record — `status → 'Not Started'`, `dueDate → next`, `completedAt → null` (`src/hooks/useTasks.ts:doToggle`). Two consequences: a recurring task has **zero completion history** (the dashboard streak at `DashboardView.tsx:50` has never counted one), and Tuesday's check-off silently consumes Monday's overdue occurrence.

**Architecture:** one table, `task_completions`. **A row means "done that day". No row means "not done that day".** That single rule gives independent per-day status with no backfill of misses, no per-occurrence task rows, and no change to what the `tasks` table means (it still holds only the *next* occurrence). It is also the heatmap's sole data source.

**Stack:** unchanged — React 18 + TS strict, Zustand, `@tauri-apps/plugin-sql`, date-fns, Tailwind + CSS-variable tokens, Vitest. **No new dependencies.**

---

## Settled decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Wall-clock anchoring.** A completion is credited to the day you clicked, not the occurrence it satisfies. | This is the requirement, literally: complete on Tuesday → Tuesday's row, Monday stays empty. Makes it an **activity** log, not an adherence log. Consequence: for non-daily rules a completion can land on an unscheduled day, so the Phase 3 strip needs a `done, off-schedule` state. |
| 2 | **Undo restores a snapshot.** `prev_due_date` + `prev_reminder_json` are captured on the row. | Phase 2.2 is what *creates* an undo path (today a recurring task can never render checked). Without a snapshot, complete-then-undo silently rewrites `dueDate` (to today, not to the missed day it actually had) and leaves a re-anchored reminder in place. Undo is a data-loss path — not a place to be lazy. |
| 3 | **`dueDate` still goes stale.** No auto-roll past missed occurrences. | Out of scope. A daily task missed since Monday keeps reading "Overdue — Mon"; the requirement is only that Monday is never *marked complete*. Auto-roll is now cheap to add later — revisit after living with the heatmap. |
| 4 | **History survives task deletion.** `task_id` nullable `ON DELETE SET NULL`, `task_title` snapshotted on the row. | A grid that rewrites its own past is a view, not a record. Deleting a two-year habit must not silently erase 600 squares with no in-app recovery. |
| 5 | **Midnight handled on the existing 60s tick.** | The app is built to run for days (close-to-tray + autostart), so "today" can't be resolved once. `startReminderLoop` (`reminders.ts:102`) already ticks every minute — reuse it, add no timer. |
| 6 | **Count all task completions**, one-off and recurring alike; `Cancelled` excluded. | Matches "amount of task completion". One write path, one query, no filter UI. Inbox-heavy days will out-rank habit days; the Phase 3 strip is where per-habit truth lives. |
| 7 | **Backfill with `date(completed_at,'localtime')`.** | `completed_at` is `toISOString()` → UTC. Bare `date()` misfiles every evening completion by a day east of UTC. One word fixes it. |
| 8 | **Full-width dashboard card, 53 weeks**, own `overflow-x-auto`. | Closest to "similar to GitHub"; no new route or nav. The dashboard scroll container is `overflow-x-hidden` (`DashboardView.tsx:93`), so the card must own its scroll context. |

**Explicit non-goals:** exploding recurring tasks into one row per occurrence (row explosion, breaks every existing query, buys nothing the log doesn't); retroactively editing a past day; week/month zoom; per-category filtering; counting subtask ticks; a "missed occurrences" report.

---

## Phase 1 — Data layer: the completion log

### Task 1.1: Migration v3

**Files:** Modify `src/lib/db.ts`

- [ ] **Step 1:** Append migration `version: 3` to `MIGRATIONS`. Note the **surrogate PK** — with `task_id` nullable, `PRIMARY KEY (task_id, occurrence_date)` would enforce nothing (SQLite permits NULLs in a non-INTEGER primary key), so uniqueness moves to a UNIQUE index. Orphans still coexist because UNIQUE treats NULLs as distinct.

```sql
CREATE TABLE IF NOT EXISTS task_completions (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  task_title         TEXT NOT NULL,          -- snapshot; the row outlives its task
  occurrence_date    TEXT NOT NULL,          -- local YYYY-MM-DD, the day credited
  completed_at       TEXT NOT NULL,          -- ISO datetime of the click
  prev_due_date      TEXT,                   -- undo snapshot (recurring only)
  prev_reminder_json TEXT                    -- undo snapshot (recurring only)
)
```
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_completions_unique
  ON task_completions(task_id, occurrence_date)
```
```sql
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(occurrence_date)
```

- [ ] **Step 2:** Backfill existing one-off completions (recurring history is unrecoverable — it was never stored). `crypto.randomUUID()` isn't available in SQL, hence `randomblob`. The `IS NOT NULL` guard matters: `occurrence_date` is `NOT NULL`, so an unparseable timestamp would fail the migration and **brick launch** — this skips the row instead.

```sql
INSERT OR IGNORE INTO task_completions
  (id, task_id, task_title, occurrence_date, completed_at)
SELECT lower(hex(randomblob(16))), id, title,
       date(completed_at, 'localtime'), completed_at
  FROM tasks
 WHERE status = 'Completed'
   AND completed_at IS NOT NULL
   AND date(completed_at, 'localtime') IS NOT NULL
```

- [ ] **Step 3:** Add `"task_completions"` to the `resetAllData()` table list, **before** `"tasks"`.

### Task 1.2: Query module

**Files:** Create `src/lib/queries/completions.ts`

- [ ] Each function `withDb`-wrapped, typed, throwing `DbError` per repo convention:
  - `logCompletion(row: NewCompletion)` — `INSERT ... ON CONFLICT(task_id, occurrence_date) DO NOTHING`. Takes the title and both `prev_*` snapshots.
  - `getCompletion(taskId, occurrenceDate)` — reads the snapshot back for undo.
  - `deleteCompletion(taskId, occurrenceDate)`.
  - `getCompletionsInRange(fromDate, toDate): Promise<DailyCount[]>` — `SELECT occurrence_date, COUNT(*) AS count ... GROUP BY occurrence_date`. The heatmap's only read.
  - `getCompletionDatesForTask(taskId, fromDate): Promise<string[]>` — feeds the Phase 3 strip.
- [ ] Add `DailyCount { date: string; count: number }` to `src/types/index.ts` (shared types live there only).

### Task 1.3: Store slice

**Files:** Create `src/store/useCompletionStore.ts`

- [ ] Zustand store: `completionsByDate: Record<string, number>`, `todayDone: Set<string>` (task ids credited today), `dayKey: string`, `load()`, `markDone(...)`, `unmarkDone(...)`. Mutators write the DB first, then patch memory — the one-directional rule from CONTEXT.md.
- [ ] Load alongside `useTaskStore.load()` on boot (`App.tsx`).

**Phase 1 gate:** `npx tsc --noEmit` clean. No UI change yet.

---

## Phase 2 — Completion semantics (this phase satisfies the reported requirement)

### Task 2.1: Rewrite `doToggle`

**Files:** Modify `src/hooks/useTasks.ts`

- [ ] `const today = format(new Date(), "yyyy-MM-dd")` — local, never `toISOString().slice(0,10)`.
- [ ] **Recurring, checking on:** `logCompletion` **first**, capturing `prev_due_date: task.dueDate` and `prev_reminder_json: JSON.stringify(task.reminder)`, then the existing roll-forward (`nextDueDateAfterCompletion` + `reminderForNextOccurrence`) unchanged. An expired rule still logs the row before the rule is cleared.
- [ ] **Recurring, checking off:** read the row, restore `dueDate` and `reminder` from the snapshot, then `deleteCompletion`. Note `updateTask` skips `undefined` keys (`tasks.ts:263`), so an **absolute** reminder is left *unchanged* (stale, anchored to the old occurrence) rather than cleared — the snapshot restores its original value either way.
- [ ] **Non-recurring, checking on:** existing `status`/`completedAt` write **plus** `logCompletion` (no `prev_*`).
- [ ] **Non-recurring, checking off:** existing write plus `deleteCompletion(task.id, format(parseISO(task.completedAt), "yyyy-MM-dd"))`.
- [ ] All of it inside the existing `try/catch → toast.error` wrapper.

### Task 2.2: "Done today" drives the checkbox

**Files:** Create `src/lib/completions.ts`; modify `TaskCard.tsx`, `DashboardView.tsx`

> `TaskDetail.tsx` turned out to need **no change**: it has no checkbox, only a status pill, and decision #1 leaves the status badge honest. "Done today" surfaces there via the Phase 3 day strip instead.

- [ ] Pure helper `isDoneToday(task, todayDone: Set<string>): boolean` → `task.status === "Completed" || todayDone.has(task.id)`.
- [ ] Replace `task.status === "Completed"` **only where it feeds a checkbox's `checked` prop**. Filtering, sorting and the status badge stay as they are — a recurring task is genuinely "Not Started" for tomorrow.
- [ ] Fixes the existing wart where a just-completed recurring task instantly re-renders unchecked.

### Task 2.3: Midnight rollover

**Files:** Modify `src/lib/reminders.ts`

- [ ] In `tick()`, compare `format(new Date(), "yyyy-MM-dd")` against a module-scoped `lastSeenDate`; on change, call `useCompletionStore.load()` and set `dayKey`.
- [ ] **Place it above the `if (due.length === 0) return;` early return at line 110**, or it never runs on a quiet tick.
- [ ] While here, make `DashboardView`'s `GREETING` read from `dayKey` instead of module scope, and add `dayKey` to the `stats` memo deps — both are already stale-across-midnight today.

### Task 2.4: Tests

**Files:** Create `src/lib/completions.test.ts`

- [ ] The exact reported scenario: daily task due Monday, not completed; on Tuesday toggle → Tuesday has a row, **Monday has none**, `dueDate` is Wednesday.
- [ ] Undo round-trip restores `dueDate` to Monday (not Tuesday) and restores an absolute reminder verbatim.
- [ ] `isDoneToday` truth table (recurring done-today, recurring not-done, one-off completed, one-off open).
- [ ] Date-change detection fires exactly once per rollover.

**Phase 2 gate:** `npm test` green, `npx tsc --noEmit` clean.

---

## Phase 3 — Visible per-day history

### Task 3.1: Day strip in task detail

**Files:** Modify `src/components/tasks/TaskDetail.tsx`; modify `src/lib/recurrence.ts`

- [ ] For a task with a `recurringRule`, render the last 14 days, fed by `getCompletionDatesForTask`. **Five states**, because decision #1 makes off-schedule completions possible:

| State | Condition |
|---|---|
| done, on schedule | row exists, day is an occurrence |
| done, off schedule | row exists, day is **not** an occurrence |
| missed | no row, day is an occurrence, day < today |
| pending | no row, day is an occurrence, day >= today |
| not scheduled | no row, day is not an occurrence |

- [ ] Add pure `isOccurrenceOn(rule, date, anchorDueDate)` to `src/lib/recurrence.ts`, with tests in the existing `recurrence.test.ts`.

**Phase 3 gate:** `npm test` green.

---

## Phase 4 — Activity heatmap

### Task 4.1: The component

**Files:** Create `src/components/shared/ActivityHeatmap.tsx`

- [ ] Props: `data: DailyCount[]`, `weeks?: number` (default 53), `endDate?: Date`.
- [ ] Layout: `grid-flow-col`, `grid-rows-7`, `gap-[3px]`, ~11px cells, Sunday-first columns — CSS grid does the whole GitHub layout, no positioning math.
- [ ] Fixed buckets, exported as pure `intensityLevel(count): 0|1|2|3|4` (`0 / 1–2 / 3–5 / 6–9 / 10+`) so it's testable without rendering.
- [ ] Colors: **new CSS-variable tokens** `--heat-0 … --heat-4` in `src/styles/globals.css`, light and dark (under the `dark` class). No hardcoded hex in the component — repo convention.
- [ ] Month labels across the top, weekday labels (Mon/Wed/Fri) down the left, a `Less ▪▪▪▪ More` legend.
- [ ] **Accessibility is not a lazy-away item:** every cell carries `title` **and** `aria-label` (`"3 tasks completed on Aug 26, 2026"`), the grid is `role="grid"`, and a caption ("412 completions in the last year") means the data is never colour-only.

### Task 4.2: Wire into the dashboard

**Files:** Modify `src/features/dashboard/DashboardView.tsx`

- [ ] Own full-width card below the `grid-cols-[1.35fr_1fr]` row, same `rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5` chrome.
- [ ] `overflow-x-auto` on the grid wrapper — the page container is `overflow-x-hidden`, so the card must own its scroll context.
- [ ] **Rewire the streak** (`DashboardView.tsx:47–56`) to `completionsByDate` instead of the `completedAt` scan. Same walk-backwards loop, new source. Expect the displayed streak to jump on first launch — today's number is blind to recurring tasks.

### Task 4.3: Tests

**Files:** Create `src/components/shared/ActivityHeatmap.test.ts`

- [ ] `intensityLevel` boundaries (0, 1, 2, 3, 5, 6, 9, 10, 99).
- [ ] Grid builder yields exactly `weeks × 7` cells, ends on `endDate`, zero-fills days absent from `data`.

**Phase 4 gate:** `npm test` green, `npx tsc --noEmit` clean.

---

## Phase 5 — Export/import + verification

### Task 5.1: Don't let backup destroy the history

**Files:** Modify `src/features/settings/SettingsView.tsx`

- [ ] Add `completions: z.array(...).optional()` to `exportFileSchema` — **optional**, so v0.3.0 export files still import.
- [ ] Export completions in the JSON payload; restore with `INSERT OR IGNORE`.
- [ ] **Keep orphan rows** (`task_id` null, or pointing at a task not in the file). Decision #4 means deleted-task history is real history; dropping unmatched rows on import would re-destroy exactly what #4 preserves.
- [ ] Without this, every export → reset → import round trip erases the entire activity history.

### Task 5.2: Verify

- [ ] `npx tsc --noEmit` and `npm test` — both clean.
- [ ] `npm run e2e:build && npm run test:e2e` — confirms migration v3 applies on a fresh DB and persistence still works.
- [ ] **Manual GUI pass, then stop.** Migration against a real populated DB is what automation can't cover. Hand the user this checklist and wait for confirmation before building anything on top:
  1. Launch on the existing `%APPDATA%\com.asus.todo-app` DB — no migration error, tasks intact, heatmap shows backfilled one-off completions.
  2. **Timezone check:** find a task completed late one evening and confirm its square is on *that* local day, not the day before. This is the one thing `'localtime'` could get wrong.
  3. Daily task due **yesterday**, left undone. Today, check it off → **today** lights up, yesterday stays empty, due date moves to tomorrow.
  4. Un-check it → today's square empties, due date returns to **yesterday** (not today), and a relative reminder is back on its original anchor.
  5. Complete 3 tasks today → today's square darkens a bucket.
  6. Delete a task that has completions → its squares **remain**, tooltip still names it.
  7. Dashboard streak counts a recurring-only day (the old code did not).
  8. Settings → Export, Reset, Import → the heatmap comes back, orphans included.
  9. Leave the app open across midnight → next morning the checkbox is unchecked, the grid has a new column, and the greeting says "Good morning".

---

## Risk notes

- **Timezone.** Every occurrence key is local `yyyy-MM-dd` via date-fns `format`, never `toISOString().slice(0, 10)`. The one-time SQL backfill uses `'localtime'` for the same reason. Mixing the two puts late-evening completions on the wrong day.
- **Migration is additive.** No destructive DDL, so an older build still runs against the upgraded DB; it just ignores the table.
- **Row growth** is one row per task per day — a decade of heavy use is tens of thousands of rows, indexed on `occurrence_date`. Not a concern.
- **`task_title` drifts.** Rename a task and old rows keep the old title. That is deliberate (it's what the row was called when you did it) but will look like a bug to someone eventually.

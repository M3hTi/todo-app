# 3. Completion-day anchor for the per-day completion log

Date: 2026-08-26

## Status

Accepted

## Context

ADR-0002 settled how a recurring task's **next** occurrence is computed. It left
untouched a consequence of the roll-the-same-record-forward model: a recurring
task keeps **no history at all**. Completing one sets `status` → Not Started,
`dueDate` → next and `completedAt` → **null**, so the record only ever describes
the next occurrence. Nothing anywhere recorded that Monday happened, or didn't.

Two problems followed.

1. **Days were not independent.** A daily task due Monday and missed still showed
   Monday as its due date on Tuesday. Ticking it on Tuesday consumed Monday's
   occurrence — the user could not record "I did it Tuesday" without the app
   treating Monday as satisfied.
2. **The dashboard streak was structurally blind to habits.** It scanned
   `completedAt` over live tasks (`DashboardView.tsx`), and recurring tasks clear
   `completedAt` on every roll-forward — so the one category of task a streak is
   meant to measure contributed zero days to it, permanently.

An activity heatmap was also requested, and it needs the same missing data.

The storage question has a well-known wrong answer: materialise one task row per
occurrence. That multiplies rows without bound, breaks every existing query that
assumes one row per task, and buys nothing a log table does not.

The genuinely open question was **which day a completion belongs to** when the
day the user clicked is not the occurrence being satisfied.

## Decision

Add an append-only `task_completions` table. **A row means "done that day"; the
absence of a row means "not done that day".** No rows are written for misses.

**A completion is credited to the local calendar day the user performed it —
never to the occurrence it satisfies.**

```
Weekly Mon+Wed. Monday missed. Completed Tuesday.
  -> row on TUESDAY.   Monday has no row and stays missed.
```

This makes the feature an **activity** log ("when did work happen") rather than
an **adherence** log ("which scheduled occurrences were met"). Adherence remains
derivable, because the rule can be replayed against any date —
`isOccurrenceOn(rule, date, anchorDueDate)` does exactly that — but it is
computed at read time, not baked into the stored day.

Supporting decisions, ratified together:

- **Occurrence keys are local `yyyy-MM-dd`** via date-fns `format`, never
  `toISOString().slice(0,10)`. The one-time backfill of pre-existing one-off
  completions uses SQLite's `date(completed_at,'localtime')` for the same reason:
  `completed_at` is stored as UTC, and bare `date()` misfiles every evening
  completion by a day east of UTC.
- **History outlives its task.** `task_id` is nullable with `ON DELETE SET NULL`
  and `task_title` is snapshotted onto the row. A grid whose past silently
  rewrites itself when an old habit is deleted is not a record.
- **Undo restores a snapshot.** `prev_due_date` and `prev_reminder_json` are
  captured on the row before roll-forward, so un-checking restores the task's
  actual prior due date rather than setting it to today.
- **Uniqueness is a UNIQUE index, not the primary key.** With `task_id` nullable,
  `PRIMARY KEY (task_id, occurrence_date)` would enforce nothing — SQLite permits
  NULLs in a non-INTEGER primary key. A surrogate `id` is the PK; uniqueness lives
  in `UNIQUE(task_id, occurrence_date)`, which also lets orphan rows coexist
  because UNIQUE treats NULLs as distinct.
- **`status` is still the truth for one-off tasks**; the log is the truth for
  "was this done today". `isDoneToday()` composes the two, and is used **only**
  for checkbox state and the done visual — never for filtering, sorting or the
  status badge, where a recurring task genuinely is Not Started for tomorrow.

## Consequences

- **Days are independent.** The reported scenario works: miss Monday, complete
  Tuesday, Monday stays incomplete, and nothing forces the user to back-mark.
- **A completion can land on an unscheduled day.** For non-daily rules the grid
  will show a filled square where the rule asked for nothing. This is accepted as
  the honest reading — the work did happen that day — and the per-task history
  strip carries a distinct `done, off-schedule` state so it is never mistaken for
  a scheduled hit.
- **Adherence percentages are not free.** Anything of the form "you hit 4 of 7
  scheduled days" must join the rows against a replayed rule. `isOccurrenceOn`
  exists for this; no such metric is shipped today.
- **Missed occurrences remain implicit.** They are the absence of a row, which
  also means "the task did not exist yet". Consumers must bound their reading by
  the task's `createdAt` — `buildDayStrip` does, or a task created today would
  display a fortnight of fabricated failures.
- **`dueDate` still goes stale** on missed occurrences; this ADR does not change
  overdue behavior. Auto-rolling a missed recurring task forward is now *possible*
  without losing information (the misses are logged), and is deliberately deferred.
- **The streak changed meaning** and its value will jump for existing users: it
  now counts days in the log rather than `completedAt` on live tasks.
- **Export/import must carry the table**, or a backup round-trip erases the whole
  activity history. Orphan rows are preserved on import rather than dropped.
- **One row per task per day** — tens of thousands of rows after a decade of
  heavy use, indexed on `occurrence_date`. Not a scaling concern.
- **A rule that expires on the completion that clears it cannot be undone** —
  `recurringRule` is not snapshotted, only `dueDate` and `reminder`. Narrow, known,
  marked in code.

## Notes

Scope: this ADR governs **which day a completion is recorded against** and the
shape of the log. It does not change `getNextDueDate` / `isRuleExpired` or the
roll-forward anchor (ADR-0002), the reminder model (ADR-0001), or overdue
semantics. Implemented across migration v3, `src/lib/queries/completions.ts`,
`src/store/useCompletionStore.ts`, `src/lib/completions.ts` and
`src/components/shared/ActivityHeatmap.tsx`; plan in
`docs/superpowers/plans/2026-08-26-per-day-completions-heatmap.md`.

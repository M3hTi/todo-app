# Spec: Retroactive check-off — correcting a day you already lived

- **Date:** 2026-09-10
- **Status:** Proposed. Plan: `docs/superpowers/plans/2026-09-10-retroactive-check-off.md`
- **Decision:** `docs/adr/0005-retroactive-completion.md` — read it first; the
  write rules are settled there.
- **App:** Todo App — Tauri v2 + React 18/TS, SQLite. Current release v0.7.1.

## Goal

v0.4 recorded per-day truth, v0.5 caught missed tasks up, v0.6 graded every
occurrence, v0.7 put streaks, adherence and a `N missed` badge on the screen. The
app now tells you a habit is going badly — and gives you no way to say **"no, I
did that one, I just forgot to tick it."**

One interaction closes it: **click a red square in the history strip and it turns
green.** Click a green one and it clears. That is the whole feature.

## The one architectural claim

**No migration, no new query function, no new store field, no new component.**
Everything this needs already exists and is already correct:

| Need | Already there |
|---|---|
| Write a completion for an arbitrary day | `logCompletion` — keyed `(task_id, occurrence_date)`, `ON CONFLICT DO NOTHING` |
| Delete one | `deleteCompletion`, via the store's `unmarkDone` |
| Keep the heatmap, badge and stats in sync | `markDone` / `unmarkDone` already update `completionsByDate`, `completionsByTask` and (date-guarded) `todayDone` |
| Know which day is which | `buildDayStrip` already grades every cell `done` / `done-off-schedule` / `missed` / `pending` / `not-scheduled` |
| Somewhere to click | `HistoryStrip`, rendered in the task detail **and** on every `/habits` row |

If a phase in the plan reaches for SQL, a migration or a new store field, it has
gone wrong.

## What a click does

For a cell on local day `d`, with `today` = the store's `dayKey`:

| Cell state | `d < today` | `d >= today` |
|---|---|---|
| `missed` | **mark done** — one row, that date | — (a `pending` day is not missed yet) |
| `done` / `done-off-schedule` | **clear** — delete that row | today: not editable, the checkbox owns it |
| `not-scheduled` | not editable | not editable |
| `pending` | — | not editable |

**Mark done** writes `{ taskId, taskTitle: task.title, occurrenceDate: d,
completedAt: now }` — no `prevDueDate`, no `prevReminder`, because nothing is
being rolled forward. **Clear** deletes the row and ignores any snapshot on it
(ADR-0005: the anchor has moved on; re-anchoring it days later is the worse bug).

Neither path touches `status`, `dueDate`, `reminder` or the recurring rule. A
task missed all last week and marked up today is still due today.

## Deliverables

**1. `retroActionFor(cell, today)` — one pure function, in
`src/lib/completions.ts`.** Returns `"add" | "clear" | null` from the table
above. It is the only branch in the feature, so it is the only thing that needs
a test file entry.

**2. `HistoryStrip` cells become buttons where an action exists.** Same 30
squares, same grading, same stats line. An actionable cell renders a `<button>`
with a real hit area and an imperative label ("Mark Mon Sep 8 as done", "Clear
Mon Sep 8"); a non-actionable one stays the `div` it is today, at the same
height, so the row does not jag.

**3. The strip refetches on any completion change, not just today's.** Its effect
currently depends on `todayDone`, which does not move when a *past* day is
written. Depend on `completionsByTask` instead — it gets a fresh `Map` identity
from `markDone` and `unmarkDone` alike (`withCompletionDay`), and from `load`.
One dependency swapped, one round trip, and the squares and the numbers still
describe a single read.

**4. Discoverability: one line in the strip header.** `LAST 30 DAYS` on the left,
a muted `click a day to fix it` on the right, rendered only when at least one
cell is actionable. An 11px square with a hidden action is not a feature.

**5. `/habits` and the task detail get it for free.** Both already render
`HistoryStrip`; neither file changes. This is the payoff for the v0.7 decision to
put one component in both places.

## Deliberately out

- **One-off tasks.** The strip only renders for recurring tasks, and a one-off's
  record is its `status` + `completedAt`, which is a different write path.
- **Editing past days the rule never scheduled.** "Log arbitrary work" is a
  bigger feature than "correct the record". The rule is the schedule.
- **Editing beyond 30 days.** The strip's window is the editing window.
- **A confirm dialog.** The action is one click and its inverse is the same
  click; a modal for that is friction, not safety.
- **Marking a retroactive row as retroactive.** No reader (ADR-0005).
- **Any effect on `dueDate`, reminders or the tray.** The point of the decision.
- **Bulk "catch me up" / "mark the whole week".** If the strip proves fiddly for
  a real backlog, that is the upgrade path — and it reuses this same write.

## Definition of done

- `npx tsc --noEmit` clean, `npm test` green including the new `retroActionFor`
  cases.
- `npm run test:e2e` green — this writes to the database, which is the suite's
  release gate (CLAUDE.md).
- Verified in the **real Tauri window** (not `npm run dev`): click a missed day →
  square turns green, the stats line, the row badge and the dashboard heatmap all
  move; click it again → back to red. Verified against the on-disk DB **with its
  WAL sidecar**, not the `.db` alone.
- `CONTEXT.md` updated: the retroactive-check-off non-goal is gone, the strip's
  new behaviour and ADR-0005 are in the domain language.
- Released as **v0.8.0**.

# Spec: Habit depth — adherence, streaks and misses per task

- **Date:** 2026-09-08
- **Status:** Proposed. Plan: `docs/superpowers/plans/2026-09-08-habit-depth.md`
- **App:** Todo App — Tauri v2 + React 18/TS, SQLite. Current release v0.6.1.

## Goal

v0.4 started recording per-day truth (`task_completions`), v0.5 caught missed
recurring tasks up to today, v0.6 made the calendar grade every occurrence. The
data is on disk and correct — the app just never **tells you how a habit is
going**. Answer three questions for each recurring task:

1. Am I on a streak, and how long?
2. What share of the days this task asked for did I actually do?
3. How many did I miss recently?

## The one architectural claim

**No new table, no migration, no new query, no new dependency.** Every number
below derives from two things that already exist: the rows in `task_completions`
and `isOccurrenceOn(rule, date, anchorDueDate)`. The three existing reads
(`getCompletionDatesForTask`, `getTaskCompletionsInRange`, and the store's
`load`) cover every screen. If a phase in the plan reaches for SQL, it has gone
wrong.

This is only possible because of ADR-0004. Catch-up moves a missed task's
`dueDate` forward, so `dueDate` alone can no longer show you a miss — but
`isOccurrenceOn` replays the rule *backwards* from the current anchor and keeps
the cycle's phase, so the past stays reconstructible. Misses are visible again;
they just live in a derived count instead of an overdue badge.

## Definitions (settle these once — every screen reads them)

For a task with a `recurringRule` and a `dueDate` anchor, on local day `d`:

- **Scheduled** — `isOccurrenceOn(rule, d, dueDate)` and `d >= createdAt`'s day.
  Days before the task existed are never scheduled (a habit made yesterday must
  not paint a year of failure), and `endDate` is honoured because
  `isOccurrenceOn` already applies it.
- **Done** — a `task_completions` row exists for `(task, d)`.
- **Missed** — scheduled, `d < today`, not done.
- **Pending** — scheduled, `d >= today`, not done. Never counted as a miss.
- **Off-schedule completion** — done on an unscheduled day. Shown by the strip
  (`done-off-schedule`), but counted in **neither** side of adherence: it was
  real work, and it satisfied nothing the rule asked for. Counting it as a hit
  would let a Mon/Wed habit hit 300%.
- **Adherence** — `done / (done + missed)` over the trailing
  **`HABIT_WINDOW_DAYS` = 30**, pending days excluded from both sides. `null`
  when the denominator is 0 (nothing was owed) — render nothing, not "0%".
- **Streak** — consecutive **scheduled** days done, walking back from today.
  Unscheduled days are skipped: they neither extend nor break it (a Mon/Wed
  habit must not lose its streak every Tuesday). Today counts when done and is
  **skipped when still pending** — a streak should not expire at 00:01. The walk
  stops at the first missed scheduled day, at the task's creation day, or at
  **`STREAK_LOOKBACK_DAYS` = 366**, whichever comes first.
- **A repeat rule with no due date has no anchor**, so nothing is ever scheduled
  and none of the above is defined. These tasks get no stats and no badge —
  the same rule v0.6.0 already applies to the calendar. Not a bug: a dateless
  repeat is an ongoing habit that owes no particular day.

## Deliverables

**1. `habitStats()` — one pure function, the single source of all three numbers.**
`src/lib/completions.ts`, next to `buildDayStrip`, which it reuses for the
window counts. Returns `null` for anything without a rule *and* an anchor.

**2. Stats on the task detail history strip.** The strip already fetches every
completion date for the task; it currently spends them on 14 squares and a
`n done · m missed` count. Same data, one more line:
`🔥 5-day streak · 12 of 14 scheduled days · 86%`. The strip widens 14 → 30 days
so every number on screen describes the same window.

**3. `N missed` badge on the task row.** The one thing the list cannot show
today: post-ADR-0004 a habit missed all week reads as a perfectly healthy task
due today. Needs per-task completion dates in the completion store (one extra
call to the existing range query in `load`), then each `TaskCard` derives its
own count with the same `habitStats`.

**4. A `/habits` view.** Every task with a `recurringRule`, each row showing its
strip and its stats — the answer to "how are my habits doing" without opening
seven tasks. Reuses `HistoryStrip` per row; no new data layer.

## Explicit non-goals

- **Retroactive check-off** ("I did it yesterday"). The natural next ask once
  misses are visible, and deliberately not in this pass: it is a write path that
  must not roll `dueDate` or re-anchor a reminder the way today's toggle does,
  which is a decision (and probably an ADR), not a feature. Upgrade path: a
  click on a `missed` strip cell → `logCompletion` with that `occurrenceDate`
  and no snapshot.
- **Per-habit targets** ("3× a week"). That is a second schedule competing with
  the rule. The rule is the schedule.
- **Streak notifications, badges, gamification.** The number is the feedback.
- **Adherence for one-off tasks.** No schedule, nothing to adhere to.
- **Changing what the heatmap counts.** It stays an *activity* view per ADR-0003;
  adherence lives per task, where it means something.
- **Backfilling missed rows.** ADR-0003's rule holds: no row means not done.

## Risks

| Risk | Mitigation |
|---|---|
| Per-row `habitStats` on a long list is `O(tasks × 30)` `isOccurrenceOn` calls per render | `useMemo` keyed on the task, its completion set and `dayKey`. Ceiling named in a `ponytail:` comment; batch or precompute in the store only if it shows. |
| Store's per-task map drifts from the DB after a toggle | `markDone` / `unmarkDone` already mutate two derived fields; the map is a third, updated in the same `set`. Covered by a test. |
| Streak walk runs away on a rule with a far-past anchor | Hard-bounded at 366 days and at the creation day. |
| Two different windows on screen (14-day strip, 30-day stats) | Strip moves to 30. One window, `HABIT_WINDOW_DAYS`, used everywhere. |

## Verification

Unit tests for `habitStats` (the only real logic) and for the store map staying
in sync. Then the standing rule for this project: **run the real app against the
real database and look at it** — a recurring task with a deliberate gap must
show a streak, an adherence figure and a missed badge that agree with each
other and with the calendar. Screenshot the Tauri window with
`PrintWindow(PW_RENDERFULLCONTENT)`; copy the `-wal` sidecar with any `.db` you
inspect, or you will be reading stale rows.

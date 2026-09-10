# 5. Retroactive completion of a past occurrence

Date: 2026-09-10

## Status

Accepted, implemented in v0.8.0. Retired the **retroactive check-off** standing
non-goal in `CONTEXT.md`. Builds directly on ADR-0003
(completions are credited to the day the work happened) and ADR-0004 (a missed
recurring task catches its due date up to today).

## Context

ADR-0003 made a completion a row keyed on `(task_id, occurrence_date)`, and the
absence of a row the only record of a miss. ADR-0004 then moved a missed task's
`dueDate` forward so the app shows the next cadence date instead of a stale one.
v0.7.0 finished the loop and made those misses *visible* — the 30-day strip, the
`N missed` row badge, the `/habits` page.

Visible and permanent. A day you genuinely did but forgot to tick is now a red
square, in three places, forever, and the only way to correct it is to open
SQLite by hand. The current checkbox cannot do it:

- it is bound to `format(new Date(), "yyyy-MM-dd")` — today, by construction;
- for a recurring task it also rolls the record forward and re-anchors the
  reminder (`useTasks.ts:doToggle`). Those are today's side effects, and they are
  exactly wrong for a day three weeks gone.

So the write for "I did it on the 3rd" is not the same write as "I did it".

## Decision

**A past day in the history strip can be corrected in place, and the correction
touches nothing but the completion log.**

- **Mark a past day done** — insert exactly one `task_completions` row with that
  `occurrence_date`. No `status`, no `dueDate`, no `reminder`, no roll-forward,
  no snapshot columns written.
- **Clear a past day** — delete that row and nothing else. If the row carries a
  roll-forward snapshot (`prev_due_date` / `prev_reminder_json`) that snapshot is
  **ignored, not applied**.
- **Today is not editable from the strip.** The checkbox owns today, including
  the roll-forward, and one day must not have two write paths.
- **Only days the rule asked for** (`missed`) and days already recorded (`done`,
  `done-off-schedule`) are editable. A past day the rule never scheduled stays
  read-only.

## Consequences

- History becomes correctable, and every derived number — adherence, streak, the
  missed badge, the dashboard heatmap and streak — follows from the same log with
  no extra code. That is the whole point of ADR-0003 paying off.
- **No schema change, no new query, no new store field.** `logCompletion` and
  `deleteCompletion` are already keyed on `(task, occurrence_date)`, and the
  store's `markDone` / `unmarkDone` already accept an arbitrary date; only
  `todayDone` is date-guarded, correctly.
- **A retroactive clear never restores a due date.** The anchor has moved on,
  possibly many steps; re-anchoring the live schedule days later to fix a
  historical record is a worse bug than the record. Undo of *today's* completion
  still restores the snapshot — that is the checkbox's job and it is unchanged.
- **Marking yesterday done does not satisfy today.** Days are independent
  (ADR-0003); a filled square never lifts an obligation, and the tray, Today and
  Overdue keep reading `dueDate`.
- **A retroactive row is indistinguishable from a live one.** `completed_at`
  records when it was typed, `occurrence_date` the day credited. No `retroactive`
  flag, because nothing reads one. Add the column when a surface has to say
  "recorded late" — not before.
- **The strip's 30 days (`HABIT_WINDOW_DAYS`) is the entire editing window.**
  Older history stays read-only, which is a bound, not an oversight.

## Alternatives rejected

- **A "log a completion for…" dialog with a date picker.** A second entry point
  and a new component, to pick a date the strip is already displaying under the
  cursor.
- **Making the checkbox date-aware.** The checkbox owns the roll-forward;
  threading a date through it is how a reminder gets re-anchored by accident.
- **A `retroactive` column / audit trail.** No reader. Migration for nothing.
- **Editing unscheduled past days too.** That is "log arbitrary work", a
  different and larger feature. The rule is the schedule — the same line that
  rejects per-habit targets.
- **Backfilling misses as rows.** Rejected in ADR-0003 and still rejected: no
  row means not done, and inverting that would rewrite every read.

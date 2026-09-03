# 4. Catching missed recurring tasks up to today

Date: 2026-09-03

## Status

Accepted. Lifts the deferral recorded in ADR-0003 ("`dueDate` still goes stale on
missed occurrences … deliberately deferred") and retires the matching standing
non-goal in `CONTEXT.md`.

## Context

Roll-forward only ever happened on **completion** (ADR-0002). A recurring task
that was simply *not done* kept its stale `dueDate` forever.

Reported case: a daily habit ("study Head First SQL, 5 pages per day") last
completed on 2026-08-30 and rolled forward to 2026-08-31. It was missed on the
31st and over the weekend. Opened on 2026-09-03 it still read **Aug 31** — it sat
in Overdue, was absent from Today, and its relative reminder was anchored to a
date four days gone. The user reads that as "tasks pending from last month",
which is exactly what it looks like.

ADR-0003 made the fix safe: misses are now recorded as the **absence** of a
completion-log row, so advancing `dueDate` no longer destroys the only evidence
that a day was missed.

## Decision

On startup and on midnight rollover, every **open** task with a recurring rule
whose `dueDate` is before today is moved to the first occurrence **on or after
today**.

```
next = dueDate
while (next < today) next = getNextDueDate(rule, next)
```

`catchUpDueDate` in `src/lib/recurrence.ts`; the sweep is
`rollForwardMissedRecurring` in `src/hooks/useTasks.ts`, called from the startup
effect in `App.tsx` (before first paint) and from the existing minute tick in
`src/lib/reminders.ts` when `refreshIfDayChanged()` reports a new day.

Supporting decisions:

- **On or after today, not strictly after.** Unlike
  `nextDueDateAfterCompletion`, nothing was completed, so today's occurrence is
  still owed. A daily task lands on **today** and appears under Today; a
  fortnightly Monday missed on the 24th lands on the next scheduled Monday, not
  on today.
- **Whole rule-steps from the stale date**, never "jump to today". This
  preserves the occurrence lattice, so `isOccurrenceOn` — and therefore the
  history strip and any future adherence metric — keeps reading the same past
  days as scheduled.
- **No completion rows are written, and none are deleted.** Missed days stay
  missed. The sweep changes only `dueDate` (and a relative reminder's anchor).
- **The write goes through `dueDatePatch`**, per the rule that every surface
  moving a due date must, so a relative reminder re-anchors instead of firing
  against a stale date. An absolute reminder is left alone — it carries its own
  date and is not the app's to reschedule.
- **An expired rule is skipped entirely.** If the caught-up date would fall past
  `endDate`, the task keeps its stale due date and stays overdue: that habit is
  over, not late. The rule is *not* cleared — only a completion does that.
- **Failure is non-fatal.** The sweep catches its own errors and surfaces one
  toast; it must never gate startup.

## Consequences

- **The reported case works:** the daily task shows Sep 3 under Today, and Aug
  31, Sep 1 and Sep 2 remain visibly missed in the history strip.
- **Recurring tasks effectively leave the Overdue view.** They can only be
  overdue between midnight and the tick that catches them up, or when their rule
  has expired. One-off tasks are untouched and still go overdue normally — the
  Jul 9 task in the report stays where it is, correctly.
- **A missed non-daily obligation loses its date.** A monthly "pay rent on the
  31st" missed in August now reads Sep 30, and the app no longer shows that
  August went unpaid anywhere except the history strip. This is the honest cost
  of treating recurrence as habit cadence rather than as an obligation ledger;
  it is accepted, and an "N missed" badge on the card is the upgrade path if it
  bites.
- **Startup does one write per stale task.** Idempotent — a second run is a
  no-op — and bounded by how many recurring tasks exist, not by how stale they
  are.
- **Iteration is bounded by staleness** (a daily task 1000 days stale → ~1000
  cheap date steps), the same tradeoff ADR-0002 already accepted.
- **Tray, calendar and Today update for free.** All three derive from the task
  store, and the tray's existing subscription is debounced, so a sweep touching
  several tasks rebuilds the menu once.

## Notes

Scope: **when a missed recurring task's `dueDate` moves**. It does not change
`getNextDueDate` / `isRuleExpired`, the completion anchor (ADR-0003), the
completion-time roll-forward anchor (ADR-0002), or the reminder model (ADR-0001).

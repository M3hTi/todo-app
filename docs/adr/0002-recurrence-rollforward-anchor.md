# 2. Recurrence roll-forward anchor

Date: 2026-06-30

## Status

Accepted

## Context

When a recurring task is completed, the app rolls the **same** task record forward
to its next occurrence (status → Not Started, `dueDate` → next, `completedAt` →
null), or — if the rule has expired — leaves it Completed and clears the rule.
The "next occurrence" is computed by `getNextDueDate(rule, fromDate)`
(`src/lib/recurrence.ts`), which returns the first occurrence strictly after
`fromDate`.

Today the call site (`doToggle` in `src/hooks/useTasks.ts`) passes **`completedAt`**
(the moment of completion) as `fromDate`. So the next due date is anchored on
**when the user completed the task**, not on the task's scheduled **due date**. A
"every Monday" task completed late on Wednesday is rescheduled relative to
Wednesday, drifting off its intended Monday cadence. `getNextDueDate` itself is
correct and unit-tested; only the **anchor** is wrong.

## Decision

Anchor the next due date on the task's **`dueDate`**, not `completedAt`, and
**roll forward to the next future occurrence**, skipping any missed occurrences.

### Algorithm (③ implements exactly this)

Let `today` = the **local** calendar date (`yyyy-MM-dd`) at completion time.

1. **Anchor.**
   - If the task has a `dueDate`: `anchor = task.dueDate`.
   - If the task has **no** `dueDate`: `anchor = today` (the no-dueDate fallback, below).

2. **Roll forward to the next future occurrence.**

   ```
   next = getNextDueDate(rule, anchor)
   while (next <= today)          // string compare of yyyy-MM-dd == chronological
       next = getNextDueDate(rule, next)
   // postcondition: next > today  (strictly in the future)
   ```

   `getNextDueDate(rule, X)` always returns a date **strictly greater** than `X`
   — true for every frequency, including `interval > 1` — so `next` strictly
   increases each step and the loop **always terminates**. Occurrences between
   `anchor` and `today` are **skipped, never replayed**.

3. **Expiry / `endDate`.** Check `isRuleExpired(rule, next)` — i.e.
   `next > rule.endDate` (**strict**; `next == endDate` is still valid, matching
   the existing suite's boundary test) — using the **final future `next`**.
   - Expired → leave the task **Completed**, clear `recurringRule` (unchanged).
   - Not expired → roll forward: status → Not Started, `dueDate = next`,
     `completedAt = null`, and reanchor the reminder via
     `reminderForNextOccurrence(task.reminder, next, task.dueTime)` (relative
     reminders re-anchor, absolute are dropped — unchanged).

### Per-frequency statement of "skip missed"

The same loop governs all frequencies; each iteration advances exactly one
rule-step and stops at the first step beyond `today`:

- **Daily (interval N):** +N days per step.
- **Weekly (interval N, optional `daysOfWeek`):** next selected weekday, or +N weeks when none remain this week / none specified.
- **Monthly (interval N, `dayOfMonth`):** +N months, clamping the day to the target month's length.
- **Yearly (interval N):** +N years (Feb-29 clamps to Feb-28 in non-leap years).

### Resolved open question — no `dueDate`

A recurring task **may** have no `dueDate` (the recurrence editor permits a rule
without one). For such tasks we **keep the completion-anchor** behavior:
`anchor = today`, then the same roll-forward loop. Because
`getNextDueDate(rule, today)` is already strictly after `today` for every rule,
the loop runs **zero extra iterations** and the result is **identical to today's
production behavior** for no-dueDate tasks. Switching the anchor is therefore a
**no-op** for them; only tasks that *have* a due date change behavior. This is
ratified deliberately so ③ does not invent a rule for the missing anchor.

## Consequences

- **"Every Monday stays Monday":** on-time or slightly-late completion reschedules
  on the intended cadence, not relative to completion time.
- **Very-late completion skips missed occurrences** instead of firing a backlog.
  Named cases:
  - *Across a month boundary* — Monthly day-15 due Jan 15, completed Mar 20 →
    next = **Apr 15** (Feb & Mar skipped).
  - *Across a year boundary* — Yearly Jun-17 due 2024-06-17, completed 2026-08-01
    → next = **2027-06-17** (2025, 2026 skipped).
  - *Feb-29 leap* — Yearly due 2024-02-29, completed 2025-03-01 →
    `getNextDueDate` clamps 2025-02-28 (≤ today) → 2026-02-28 (> today) →
    next = **2026-02-28**.
- **Leap-day drift (named, accepted):** because the loop iterates *from the
  previous result*, a Feb-29 yearly task that clamps to Feb-28 in a non-leap year
  **stays on Feb-28** thereafter — it does **not** spring back to Feb-29 in the
  next leap year. Springback would require computing the Nth occurrence from a
  preserved original anchor (a different algorithm); that is **not** chosen here,
  and it matches the roll-the-same-record-forward model, which keeps no memory of
  the original date.
- **Early completion** (completing a task whose `dueDate` is in the future) also
  anchors on `dueDate`: `next` becomes one rule-step after the future due date —
  the current cycle is consumed, the following cycle is scheduled.
- **Iteration count** is bounded by how overdue the task is (e.g. a daily task
  1000 days overdue → ~1000 `getNextDueDate` calls on completion). Date math is
  cheap; this is acceptable and ③ need not optimize it.
- ③ is a **behavior change** with new tests. The existing `recurrence.test.ts`
  cases for `getNextDueDate` / `isRuleExpired` are **unaffected** — those
  functions are unchanged; only the call site and a new roll-forward helper.

## Notes

Scope: this ADR governs the completion → next-occurrence **anchor** only. It does
not change `getNextDueDate` / `isRuleExpired`, the reminder model (ADR-0001), or
any other item in the hardening pass. Implementation is item ③, gated by this
decision.

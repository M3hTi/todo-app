// Recurrence strategy:
// On completing a recurring task we update the same task record — set `status`
// back to 'Not Started', set `dueDate` to getNextDueDate(rule, completedAt),
// and set `completedAt` to null. This avoids orphaned records while keeping
// history simple. When the rule has an `endDate` and the next due date would
// fall after it, the task is left completed and `recurringRule` is cleared.
import {
  addDays,
  addMonths,
  addYears,
  format,
  getDay,
  getDaysInMonth,
  getDate,
  parseISO,
  startOfMonth,
} from "date-fns";
import type { RecurringRule } from "@/types";

const DATE_FORMAT = "yyyy-MM-dd";

/**
 * Given a task's recurringRule and its current dueDate (or completion time),
 * return the next ISO due date strictly after `fromDate`.
 */
export function getNextDueDate(rule: RecurringRule, fromDate: string): string {
  const from = parseISO(fromDate);
  const interval = Math.max(1, Math.floor(rule.interval) || 1);

  switch (rule.frequency) {
    case "Daily":
      return format(addDays(from, interval), DATE_FORMAT);

    case "Weekly": {
      const days = [...(rule.daysOfWeek ?? [])].sort((a, b) => a - b);
      if (days.length === 0) {
        return format(addDays(from, 7 * interval), DATE_FORMAT);
      }
      const currentDow = getDay(from); // 0=Sun … 6=Sat, matching rule.daysOfWeek
      // Next selected weekday later in the current week, if any…
      const nextThisWeek = days.find((day) => day > currentDow);
      if (nextThisWeek !== undefined) {
        return format(addDays(from, nextThisWeek - currentDow), DATE_FORMAT);
      }
      // …otherwise the first selected weekday, `interval` weeks ahead.
      const first = days[0] as number;
      return format(addDays(from, 7 * interval - currentDow + first), DATE_FORMAT);
    }

    case "Monthly": {
      const dayOfMonth = rule.dayOfMonth ?? getDate(from);
      const targetMonth = addMonths(startOfMonth(from), interval);
      const clampedDay = Math.min(dayOfMonth, getDaysInMonth(targetMonth));
      return format(addDays(targetMonth, clampedDay - 1), DATE_FORMAT);
    }

    case "Yearly":
      // date-fns clamps Feb 29 → Feb 28 in non-leap years.
      return format(addYears(from, interval), DATE_FORMAT);
  }
}

/** True when the rule has expired: the next occurrence falls after its endDate. */
export function isRuleExpired(rule: RecurringRule, nextDueDate: string): boolean {
  return rule.endDate !== undefined && nextDueDate > rule.endDate;
}

/**
 * Next due date for a recurring task completed on `today` (local yyyy-MM-dd),
 * anchored on its current `dueDate` and rolled forward to the first occurrence
 * strictly after `today`. Missed occurrences are skipped, not replayed. When the
 * task has no due date, the anchor falls back to `today` — a no-op equivalent to
 * the prior completion-anchor behavior. See docs/adr/0002-recurrence-rollforward-anchor.md.
 *
 * Terminates because getNextDueDate(rule, X) is always strictly after X.
 */
export function nextDueDateAfterCompletion(
  rule: RecurringRule,
  dueDate: string | undefined,
  today: string,
): string {
  let next = getNextDueDate(rule, dueDate ?? today);
  while (next <= today) {
    next = getNextDueDate(rule, next);
  }
  return next;
}

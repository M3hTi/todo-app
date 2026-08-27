// "Done today" is not the same question as "is this task Completed".
//
// A recurring task rolls the same record forward on completion — status goes
// back to 'Not Started' and dueDate moves to the next occurrence — so `status`
// can never say whether today's occurrence was done. The completion log answers
// that; `status` still answers whether a one-off task is finished for good.
import { addDays, format, parseISO, subDays } from "date-fns";
import type { RecurringRule, Task } from "@/types";
import { isOccurrenceOn } from "@/lib/recurrence";

/**
 * True when the task counts as done for the current day: either it is a one-off
 * task that is Completed, or the completion log has a row for it today.
 *
 * Use this for checkbox state and the visual "done" treatment. Do NOT use it for
 * filtering, sorting or the status badge — a recurring task genuinely is
 * 'Not Started' for tomorrow, and pretending otherwise breaks those views.
 */
export function isDoneToday(task: Task, todayDone: ReadonlySet<string>): boolean {
  return task.status === "Completed" || todayDone.has(task.id);
}

/**
 * One day's standing in the history strip.
 *
 * `done-off-schedule` exists because completions are credited to the day the
 * work happened, not the occurrence they satisfy — so a Mon/Wed task completed
 * on a Tuesday puts a real completion on an unscheduled day. Calling that
 * "done" would imply Tuesday was owed; calling it "not-scheduled" would hide it.
 */
export type DayState = "done" | "done-off-schedule" | "missed" | "pending" | "not-scheduled";

export interface DayCell {
  date: string;
  state: DayState;
}

/**
 * The last `days` days for one task, most recent last.
 *
 * Days before the task was created are always `not-scheduled`: the rule would
 * happily project occurrences back into 2019, and painting those "missed" would
 * invent a failure history for a task made yesterday.
 */
export function buildDayStrip(
  rule: RecurringRule | undefined,
  anchorDueDate: string | undefined,
  createdAt: string,
  completedDates: ReadonlySet<string>,
  days: number,
  today: string,
): DayCell[] {
  const createdDay = format(parseISO(createdAt), "yyyy-MM-dd");
  const start = subDays(parseISO(today), days - 1);

  return Array.from({ length: days }, (_, index) => {
    const date = format(addDays(start, index), "yyyy-MM-dd");
    const done = completedDates.has(date);

    if (date < createdDay) return { date, state: "not-scheduled" as const };

    const scheduled = rule
      ? isOccurrenceOn(rule, date, anchorDueDate)
      : date === anchorDueDate;

    if (done) return { date, state: scheduled ? "done" : ("done-off-schedule" as const) };
    if (!scheduled) return { date, state: "not-scheduled" as const };
    return { date, state: date < today ? ("missed" as const) : ("pending" as const) };
  });
}

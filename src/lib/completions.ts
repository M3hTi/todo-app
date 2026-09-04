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
 *
 * With no `anchorDueDate` the task has no schedule at all (an ongoing habit with
 * a repeat rule but no due date), so no day is ever owed: the strip shows the
 * days it was actually done and nothing else.
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

    // `done-off-schedule` means "real work on a day the rule didn't ask for",
    // which only means anything when there *is* a schedule to be off. A task
    // with no anchor has none, so its completions are plain `done`.
    if (done) {
      const offSchedule = anchorDueDate !== undefined && !scheduled;
      return { date, state: offSchedule ? ("done-off-schedule" as const) : ("done" as const) };
    }
    if (!scheduled) return { date, state: "not-scheduled" as const };
    return { date, state: date < today ? ("missed" as const) : ("pending" as const) };
  });
}

/** One calendar cell's entry for a task: which day, and how that day went. */
export interface Occurrence {
  taskId: string;
  date: string;
  state: "done" | "missed" | "pending";
}

/**
 * The task's occurrences among `dates`, so a recurring task shows up on every
 * day the rule asked for — not just the single `dueDate` the record happens to
 * be parked on. Same reasoning as buildDayStrip: the rule projects occurrences,
 * the completion log grades them, and days before the task existed are skipped
 * so a habit made yesterday doesn't paint a month of failures.
 *
 * A completion on an unscheduled day still counts as `done` here (the calendar
 * shows the day work happened); the strip's finer `done-off-schedule` shading
 * is not worth a fifth chip colour.
 *
 * A recurring task with no due date has no anchor, so isOccurrenceOn projects
 * nothing for it and only its real completions land on the grid — no `missed`,
 * no `pending`, no chip at all on a day it was not done. That is deliberate: a
 * dateless repeat is an ongoing habit, and painting a daily one across every
 * cell of the month was clutter that also invented a failure history.
 */
export function occurrencesFor(
  task: Pick<Task, "id" | "status" | "dueDate" | "createdAt" | "recurringRule">,
  dates: readonly string[],
  completedDates: ReadonlySet<string>,
  today: string,
): Occurrence[] {
  const rule = task.recurringRule;

  // ponytail: one-off tasks keep their existing single-chip behaviour.
  if (!rule) {
    if (!task.dueDate || !dates.includes(task.dueDate)) return [];
    const state = task.status === "Completed" ? "done" : "pending";
    return [{ taskId: task.id, date: task.dueDate, state }];
  }

  const createdDay = format(parseISO(task.createdAt), "yyyy-MM-dd");
  const result: Occurrence[] = [];
  for (const date of dates) {
    if (date < createdDay) continue;
    const done = completedDates.has(date);
    if (!done && !isOccurrenceOn(rule, date, task.dueDate)) continue;
    result.push({
      taskId: task.id,
      date,
      state: done ? "done" : date < today ? "missed" : "pending",
    });
  }
  return result;
}

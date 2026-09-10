// "Done today" is not the same question as "is this task Completed".
//
// A recurring task rolls the same record forward on completion — status goes
// back to 'Not Started' and dueDate moves to the next occurrence — so `status`
// can never say whether today's occurrence was done. The completion log answers
// that; `status` still answers whether a one-off task is finished for good.
import { addDays, format, parseISO, subDays } from "date-fns";
import type { RecurringRule, Task } from "@/types";
import { isOccurrenceOn, upcomingDueDate } from "@/lib/recurrence";

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

/** What clicking a day in the history strip does, or nothing. */
export type RetroAction = "add" | "clear" | null;

/**
 * Whether a strip cell can be corrected, and how (ADR-0005).
 *
 * Only the past is editable, and only days the rule asked for or days already
 * recorded. **Today is never editable here** — the checkbox owns today, and it
 * also rolls a recurring record forward; two write paths for one day is how a
 * reminder gets re-anchored by accident.
 */
export function retroActionFor(cell: DayCell, today: string): RetroAction {
  if (cell.date >= today) return null;
  if (cell.state === "missed") return "add";
  if (cell.state === "done" || cell.state === "done-off-schedule") return "clear";
  // not-scheduled: the rule never asked for this day. Recording work there is
  // "log arbitrary work", a different feature.
  return null;
}

/** Trailing window for adherence, the missed badge and the day strip. */
export const HABIT_WINDOW_DAYS = 30;
/** Hard bound on the streak walk — an old anchor must not walk forever. */
export const STREAK_LOOKBACK_DAYS = 366;

/** How a recurring task is going: the three numbers every habit surface reads. */
export interface HabitStats {
  /** Days in the window the rule asked for that are already past, or done. */
  scheduled: number;
  done: number;
  missed: number;
  /** done / scheduled, or null when nothing was owed in the window. */
  adherence: number | null;
  /** Consecutive scheduled days done, walking back from today. */
  streak: number;
}

/**
 * Streak, adherence and recent misses for one recurring task, derived from the
 * completion log and the rule — no schema, no query of its own.
 *
 * `null` when there is no rule or no due date to anchor it: a repeat with no
 * anchor schedules nothing, so every number here would be undefined rather than
 * zero. Same rule `occurrencesFor` applies to the calendar.
 *
 * Counting rules, all deliberate:
 * - **Pending days are not misses.** A scheduled day is only missed once it is
 *   over, so today never drags adherence down and never ends a streak.
 * - **Off-schedule completions count in neither direction.** They satisfied
 *   nothing the rule asked for; counting them would let a Mon/Wed habit score
 *   300%, or hold a streak on days it was never owed. The strip still shows
 *   them (`done-off-schedule`) — this is about arithmetic, not visibility.
 * - **Unscheduled days are skipped by the streak walk**, so a Mon/Wed habit
 *   does not lose its streak every Tuesday.
 */
export function habitStats(
  rule: RecurringRule | undefined,
  anchorDueDate: string | undefined,
  createdAt: string,
  completedDates: ReadonlySet<string>,
  today: string,
): HabitStats | null {
  if (rule === undefined || anchorDueDate === undefined) return null;

  // The window counts are exactly the strip's own grading, so the numbers can
  // never disagree with the squares above them.
  let done = 0;
  let missed = 0;
  for (const cell of buildDayStrip(
    rule,
    anchorDueDate,
    createdAt,
    completedDates,
    HABIT_WINDOW_DAYS,
    today,
  )) {
    if (cell.state === "done") done += 1;
    else if (cell.state === "missed") missed += 1;
  }
  const scheduled = done + missed;

  const createdDay = format(parseISO(createdAt), "yyyy-MM-dd");
  // A scheduled-but-undone today would end the walk on its first step; a streak
  // that expires at 00:01 and returns when you tick the box reads as a bug.
  let cursor = parseISO(today);
  if (!completedDates.has(today)) cursor = subDays(cursor, 1);

  // ponytail: linear backward walk, bounded at a year and at the creation day.
  // Memoized at the call sites; precompute in the store only if a long list
  // measurably drags.
  let streak = 0;
  for (let step = 0; step < STREAK_LOOKBACK_DAYS; step += 1) {
    const day = format(cursor, "yyyy-MM-dd");
    if (day < createdDay) break;
    if (isOccurrenceOn(rule, day, anchorDueDate)) {
      if (!completedDates.has(day)) break;
      streak += 1;
    }
    cursor = subDays(cursor, 1);
  }

  return {
    scheduled,
    done,
    missed,
    adherence: scheduled === 0 ? null : done / scheduled,
    streak,
  };
}

/** One calendar cell's entry for a task: which day, and where it stands. */
export interface Occurrence {
  taskId: string;
  date: string;
  state: "done" | "pending";
}

/**
 * The task's occurrences among `dates` — what the calendar is on the hook for.
 *
 * **Only today and the next projected occurrence.** The calendar answers "what
 * am I on the hook for"; how a habit has been *going* is the 30-day strip's and
 * the Habits page's job, and they do it per-task with the numbers attached. When
 * the past was graded here too, one daily habit produced ten chips in a month
 * and — since a day cell renders only MAX_CHIPS — pushed the one-off tasks a
 * calendar exists for out of the cells entirely.
 *
 * So a recurring task contributes at most two chips: today's occurrence (shown
 * whether or not it is done, so the day reads honestly) and the single next one,
 * taken from `upcomingDueDate` so the grid and Upcoming cannot disagree about
 * what comes next. `upcomingDueDate` is strictly after today, so the two never
 * collide.
 *
 * Days before the task existed are skipped, and a repeat with no due date has no
 * anchor, so it projects nothing — a dateless rule is an ongoing habit, and
 * nothing is owed on any particular day.
 *
 * `endDate` is deliberately not consulted beyond the cutoff isOccurrenceOn
 * already applies: `Until` says when a habit stops, not how it should be drawn.
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
  // The one occurrence projected past today — the same date Upcoming lists, so
  // the two views cannot disagree about what comes next. undefined when the task
  // has no due date to project from, or the rule has run past its endDate.
  const nextUp = upcomingDueDate(rule, task.dueDate, today);
  const result: Occurrence[] = [];
  for (const date of dates) {
    // The past belongs to the history strip, not to the grid.
    if (date < createdDay || date < today) continue;
    if (date !== today && date !== nextUp) continue;
    const done = completedDates.has(date);
    // nextUp is an occurrence by construction; today has to be checked, unless
    // it was worked anyway — real work on an unscheduled day still shows.
    if (date === today && !done && !isOccurrenceOn(rule, date, task.dueDate)) continue;
    result.push({ taskId: task.id, date, state: done ? "done" : "pending" });
  }
  return result;
}

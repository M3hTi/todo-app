// Per-day completion log. A row means "this task was completed on this day";
// no row means it was not. Recurring tasks roll the same `tasks` record forward,
// so this table is the only place per-day history lives — and the sole data
// source for the activity heatmap.
//
// Every occurrence_date is a *local* YYYY-MM-DD (date-fns `format`), never
// toISOString().slice(0,10) — the two disagree by a day for evening work.
import type { Completion, DailyCount, Reminder } from "@/types";
import { getDb, withDb } from "@/lib/db";

interface CompletionRow {
  id: string;
  task_id: string | null;
  task_title: string;
  occurrence_date: string;
  completed_at: string;
  prev_due_date: string | null;
  prev_reminder_json: string | null;
}

const COMPLETION_COLUMNS =
  "id, task_id, task_title, occurrence_date, completed_at, prev_due_date, prev_reminder_json";

/** Fields the caller provides when logging a completion; `id` is generated. */
export interface NewCompletion {
  taskId: string;
  taskTitle: string;
  occurrenceDate: string;
  completedAt: string;
  /** Recurring only: the due date this completion is about to roll forward. */
  prevDueDate?: string;
  /** Recurring only: the reminder this completion is about to re-anchor. */
  prevReminder?: Reminder;
}

function toCompletion(row: CompletionRow): Completion {
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    occurrenceDate: row.occurrence_date,
    completedAt: row.completed_at,
    ...(row.prev_due_date !== null ? { prevDueDate: row.prev_due_date } : {}),
    ...(row.prev_reminder_json !== null
      ? { prevReminder: JSON.parse(row.prev_reminder_json) as Reminder }
      : {}),
  };
}

/**
 * Records a completion. Completing the same task twice on one day is a no-op —
 * the unique index makes the second write silently do nothing rather than
 * double-counting the day on the heatmap.
 */
export async function logCompletion(input: NewCompletion): Promise<void> {
  return withDb("logCompletion", async () => {
    await getDb().execute(
      `INSERT INTO task_completions
         (id, task_id, task_title, occurrence_date, completed_at, prev_due_date, prev_reminder_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(task_id, occurrence_date) DO NOTHING`,
      [
        crypto.randomUUID(),
        input.taskId,
        input.taskTitle,
        input.occurrenceDate,
        input.completedAt,
        input.prevDueDate ?? null,
        input.prevReminder ? JSON.stringify(input.prevReminder) : null,
      ],
    );
  });
}

/** The logged completion for one task on one day, or null. Carries the undo snapshot. */
export async function getCompletion(
  taskId: string,
  occurrenceDate: string,
): Promise<Completion | null> {
  return withDb("getCompletion", async () => {
    const rows = await getDb().select<CompletionRow[]>(
      `SELECT ${COMPLETION_COLUMNS} FROM task_completions
        WHERE task_id = $1 AND occurrence_date = $2`,
      [taskId, occurrenceDate],
    );
    const row = rows[0];
    return row ? toCompletion(row) : null;
  });
}

export async function deleteCompletion(taskId: string, occurrenceDate: string): Promise<void> {
  return withDb("deleteCompletion", async () => {
    await getDb().execute(
      "DELETE FROM task_completions WHERE task_id = $1 AND occurrence_date = $2",
      [taskId, occurrenceDate],
    );
  });
}

/** Daily totals across a date range, inclusive. The heatmap's only read. */
export async function getCompletionsInRange(
  fromDate: string,
  toDate: string,
): Promise<DailyCount[]> {
  return withDb("getCompletionsInRange", async () => {
    return getDb().select<DailyCount[]>(
      `SELECT occurrence_date AS date, COUNT(*) AS count
         FROM task_completions
        WHERE occurrence_date BETWEEN $1 AND $2
        GROUP BY occurrence_date
        ORDER BY occurrence_date`,
      [fromDate, toDate],
    );
  });
}

/** Task ids completed on one day — drives the "done today" checkbox state. */
export async function getTaskIdsCompletedOn(occurrenceDate: string): Promise<string[]> {
  return withDb("getTaskIdsCompletedOn", async () => {
    const rows = await getDb().select<Array<{ task_id: string | null }>>(
      "SELECT task_id FROM task_completions WHERE occurrence_date = $1 AND task_id IS NOT NULL",
      [occurrenceDate],
    );
    return rows.map((row) => row.task_id as string);
  });
}

/** Every logged completion, orphans included — the export payload. */
export async function getAllCompletions(): Promise<Completion[]> {
  return withDb("getAllCompletions", async () => {
    const rows = await getDb().select<CompletionRow[]>(
      `SELECT ${COMPLETION_COLUMNS} FROM task_completions ORDER BY occurrence_date`,
    );
    return rows.map(toCompletion);
  });
}

/** The days one task was completed, from `fromDate` onward — the per-task day strip. */
export async function getCompletionDatesForTask(
  taskId: string,
  fromDate: string,
): Promise<string[]> {
  return withDb("getCompletionDatesForTask", async () => {
    const rows = await getDb().select<Array<{ occurrence_date: string }>>(
      `SELECT occurrence_date FROM task_completions
        WHERE task_id = $1 AND occurrence_date >= $2
        ORDER BY occurrence_date`,
      [taskId, fromDate],
    );
    return rows.map((row) => row.occurrence_date);
  });
}

/** Which tasks were completed on which days in a range — the calendar's read. */
export async function getTaskCompletionsInRange(
  fromDate: string,
  toDate: string,
): Promise<Array<{ taskId: string; date: string }>> {
  return withDb("getTaskCompletionsInRange", async () => {
    const rows = await getDb().select<Array<{ task_id: string; occurrence_date: string }>>(
      `SELECT task_id, occurrence_date FROM task_completions
        WHERE task_id IS NOT NULL AND occurrence_date BETWEEN $1 AND $2`,
      [fromDate, toDate],
    );
    return rows.map((row) => ({ taskId: row.task_id, date: row.occurrence_date }));
  });
}

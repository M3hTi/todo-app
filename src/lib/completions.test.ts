import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { format, parseISO, subDays } from "date-fns";
import type { Completion, Reminder, Task } from "@/types";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

// In-memory stand-in for the task_completions table. The real UNIQUE constraint
// and the 'localtime' backfill are verified against SQLite separately; what
// matters here is which rows doToggle decides to write and delete.
const rows = new Map<string, Completion>();
const key = (taskId: string, date: string): string => `${taskId}|${date}`;

vi.mock("@/lib/queries/completions", () => ({
  logCompletion: vi.fn(async (input: Record<string, unknown>) => {
    const k = key(input.taskId as string, input.occurrenceDate as string);
    if (rows.has(k)) return; // ON CONFLICT DO NOTHING
    rows.set(k, { id: k, taskId: input.taskId, taskTitle: input.taskTitle, ...input } as Completion);
  }),
  getCompletion: vi.fn(async (id: string, date: string) => rows.get(key(id, date)) ?? null),
  deleteCompletion: vi.fn(async (id: string, date: string) => {
    rows.delete(key(id, date));
  }),
  getCompletionsInRange: vi.fn(async () => []),
  getTaskIdsCompletedOn: vi.fn(async (date: string) =>
    [...rows.values()].filter((row) => row.occurrenceDate === date).map((row) => row.taskId),
  ),
  getCompletionDatesForTask: vi.fn(async () => []),
}));

let current: Task;

function applyPatch(base: Task, patch: Record<string, unknown>): Task {
  const next = { ...base } as Record<string, unknown>;
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue; // undefined = leave unchanged
    if (value === null) delete next[field]; // null = clear
    else next[field] = value;
  }
  return next as unknown as Task;
}

vi.mock("@/lib/queries/tasks", () => ({
  updateTask: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    current = applyPatch(current, patch);
    return current;
  }),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getAllTasks: vi.fn(async () => []),
  getTaskById: vi.fn(async () => current),
}));

const { isDoneToday } = await import("./completions");
const { toggleTaskComplete } = await import("@/hooks/useTasks");
const { useTaskStore } = await import("@/store/useTaskStore");
const { useCompletionStore, refreshIfDayChanged } = await import("@/store/useCompletionStore");

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Water plants",
    status: "Not Started",
    priority: "Medium",
    tags: [],
    subtasks: [],
    sortOrder: 0,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  };
}

/** Puts the store in the state it would be in after load() on the given day. */
async function seedStores(t: Task, today: string): Promise<void> {
  current = t;
  useTaskStore.setState({ tasks: [t] });
  useCompletionStore.setState({
    completionsByDate: {},
    todayDone: new Set(
      [...rows.values()].filter((r) => r.occurrenceDate === today).map((r) => r.taskId as string),
    ),
    dayKey: today,
  });
}

const MONDAY = "2026-08-24";
const TUESDAY = "2026-08-25";
const WEDNESDAY = "2026-08-26";

beforeEach(() => {
  rows.clear();
  toastError.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 25, 10, 0, 0)); // Tuesday 10:00 local
});

afterEach(() => {
  vi.useRealTimers();
});

describe("per-day completion — the reported scenario", () => {
  it("crediting Tuesday leaves Monday untouched and rolls the due date to Wednesday", async () => {
    const daily = task({
      dueDate: MONDAY, // missed
      recurringRule: { frequency: "Daily", interval: 1 },
    });
    await seedStores(daily, TUESDAY);

    await toggleTaskComplete(daily);

    expect([...rows.keys()]).toEqual([key("t1", TUESDAY)]);
    expect(rows.has(key("t1", MONDAY))).toBe(false);
    expect(current.dueDate).toBe(WEDNESDAY);
    expect(current.status).toBe("Not Started");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("renders as checked for today even though status rolled back to Not Started", async () => {
    const daily = task({ dueDate: MONDAY, recurringRule: { frequency: "Daily", interval: 1 } });
    await seedStores(daily, TUESDAY);

    await toggleTaskComplete(daily);

    expect(current.status).toBe("Not Started");
    expect(isDoneToday(current, useCompletionStore.getState().todayDone)).toBe(true);
  });
});

describe("undo restores the pre-roll snapshot", () => {
  it("puts the due date back to Monday, not to today", async () => {
    const daily = task({ dueDate: MONDAY, recurringRule: { frequency: "Daily", interval: 1 } });
    await seedStores(daily, TUESDAY);

    await toggleTaskComplete(daily);
    expect(current.dueDate).toBe(WEDNESDAY);

    await toggleTaskComplete(current);

    expect(current.dueDate).toBe(MONDAY); // the overdue state is restored, not erased
    expect(rows.size).toBe(0);
    expect(useCompletionStore.getState().todayDone.has("t1")).toBe(false);
  });

  it("restores the original reminder verbatim", async () => {
    const reminder: Reminder = {
      mode: "relative",
      minutesBefore: 30,
      nextFireAt: "2026-08-24T08:30:00.000Z",
    };
    const daily = task({
      dueDate: MONDAY,
      dueTime: "09:00",
      reminder,
      recurringRule: { frequency: "Daily", interval: 1 },
    });
    await seedStores(daily, TUESDAY);

    await toggleTaskComplete(daily);
    expect(current.reminder?.nextFireAt).not.toBe(reminder.nextFireAt); // re-anchored

    await toggleTaskComplete(current);
    expect(current.reminder).toEqual(reminder);
  });

  it("clears the rolled-forward reminder when the task had none to begin with", async () => {
    const daily = task({ dueDate: MONDAY, recurringRule: { frequency: "Daily", interval: 1 } });
    await seedStores(daily, TUESDAY);

    await toggleTaskComplete(daily);
    await toggleTaskComplete(current);

    expect(current.reminder).toBeUndefined();
  });
});

describe("one-off tasks", () => {
  it("logs today's row on completion", async () => {
    const oneOff = task({ id: "t2", dueDate: TUESDAY });
    await seedStores(oneOff, TUESDAY);

    await toggleTaskComplete(oneOff);

    expect(current.status).toBe("Completed");
    expect(rows.has(key("t2", TUESDAY))).toBe(true);
  });

  it("removes the row keyed on the day it was completed, not today", async () => {
    const completedMonday = task({
      id: "t3",
      status: "Completed",
      completedAt: new Date(2026, 7, 24, 21, 0, 0).toISOString(),
    });
    rows.set(key("t3", MONDAY), {
      id: "seed",
      taskId: "t3",
      taskTitle: "Water plants",
      occurrenceDate: MONDAY,
      completedAt: completedMonday.completedAt as string,
    });
    await seedStores(completedMonday, TUESDAY);

    await toggleTaskComplete(completedMonday);

    expect(current.status).toBe("Not Started");
    expect(rows.has(key("t3", MONDAY))).toBe(false);
  });
});

describe("isDoneToday", () => {
  const empty = new Set<string>();
  const done = new Set(["t1"]);

  it.each([
    ["recurring, logged today", task({ recurringRule: { frequency: "Daily", interval: 1 } }), done, true],
    ["recurring, not logged", task({ recurringRule: { frequency: "Daily", interval: 1 } }), empty, false],
    ["one-off, Completed", task({ status: "Completed" }), empty, true],
    ["one-off, open", task(), empty, false],
  ])("%s", (_label, t, set, expected) => {
    expect(isDoneToday(t as Task, set as Set<string>)).toBe(expected);
  });
});

describe("midnight rollover", () => {
  it("reloads once when the local date moves on, and not again", async () => {
    await seedStores(task(), TUESDAY);
    const load = vi.spyOn(useCompletionStore.getState(), "load").mockResolvedValue();

    expect(await refreshIfDayChanged()).toBe(false);
    expect(load).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(2026, 7, 26, 0, 1, 0)); // just past midnight
    expect(await refreshIfDayChanged()).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);

    useCompletionStore.setState({ dayKey: WEDNESDAY }); // what load() would have set
    expect(await refreshIfDayChanged()).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("buildDayStrip", () => {
  const daily = { frequency: "Daily" as const, interval: 1 };
  const OLD = "2020-01-01T09:00:00.000Z";
  const states = (cells: Array<{ date: string; state: string }>) =>
    Object.fromEntries(cells.map((c) => [c.date, c.state]));

  it("returns exactly `days` cells ending on today", async () => {
    const { buildDayStrip } = await import("./completions");
    const cells = buildDayStrip(daily, "2026-08-27", OLD, new Set(), 14, "2026-08-26");
    expect(cells).toHaveLength(14);
    expect(cells.at(-1)?.date).toBe("2026-08-26");
    expect(cells[0]?.date).toBe("2026-08-13");
  });

  it("marks the nine skipped days missed and today done — the reported scenario", async () => {
    const { buildDayStrip } = await import("./completions");
    const cells = buildDayStrip(daily, "2026-08-27", OLD, new Set(["2026-08-26"]), 4, "2026-08-26");
    expect(states(cells)).toEqual({
      "2026-08-23": "missed",
      "2026-08-24": "missed",
      "2026-08-25": "missed",
      "2026-08-26": "done",
    });
  });

  it("never invents a failure history from before the task existed", async () => {
    const { buildDayStrip } = await import("./completions");
    const cells = buildDayStrip(
      daily,
      "2026-08-27",
      "2026-08-25T09:00:00.000Z", // created two days ago
      new Set(),
      4,
      "2026-08-26",
    );
    expect(states(cells)).toEqual({
      "2026-08-23": "not-scheduled", // did not exist
      "2026-08-24": "not-scheduled", // did not exist
      "2026-08-25": "missed",
      "2026-08-26": "pending", // today is not a failure until it is over
    });
  });

  it("separates an off-schedule completion from a scheduled one", async () => {
    const { buildDayStrip } = await import("./completions");
    // Weekly Mon+Wed; work actually happened on the Tuesday.
    const rule = { frequency: "Weekly" as const, interval: 1, daysOfWeek: [1, 3] };
    const cells = buildDayStrip(rule, "2026-08-26", OLD, new Set(["2026-08-25"]), 3, "2026-08-26");
    expect(states(cells)).toEqual({
      "2026-08-24": "missed", // Monday, scheduled, not done
      "2026-08-25": "done-off-schedule", // Tuesday, done but never owed
      "2026-08-26": "pending", // Wednesday, scheduled, still today
    });
  });

  it("treats a future scheduled day as pending, not missed", async () => {
    const { buildDayStrip } = await import("./completions");
    const cells = buildDayStrip(daily, "2026-08-27", OLD, new Set(), 2, "2026-08-26");
    expect(cells.at(-1)?.state).toBe("pending");
  });

  it("falls back to the due date alone for a non-recurring task", async () => {
    const { buildDayStrip } = await import("./completions");
    const cells = buildDayStrip(undefined, "2026-08-25", OLD, new Set(), 3, "2026-08-26");
    expect(states(cells)).toEqual({
      "2026-08-24": "not-scheduled",
      "2026-08-25": "missed",
      "2026-08-26": "not-scheduled",
    });
  });
});

describe("occurrencesFor", () => {
  const OLD = "2020-01-01T09:00:00.000Z";
  const week = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
  const base = { id: "t1", status: "Not Started" as const, createdAt: OLD };
  const states = (list: Array<{ date: string; state: string }>) =>
    Object.fromEntries(list.map((o) => [o.date, o.state]));

  it("shows today and the next occurrence, and nothing behind them", async () => {
    const { occurrencesFor } = await import("./completions");
    const task = {
      ...base,
      dueDate: "2026-08-27", // the record only ever holds the next occurrence
      recurringRule: { frequency: "Daily" as const, interval: 1 },
    };
    expect(states(occurrencesFor(task, week, new Set(["2026-08-25"]), "2026-08-26"))).toEqual({
      "2026-08-26": "pending", // today is owed
      "2026-08-27": "pending", // …and the one step ahead
      // Aug 24 was missed and Aug 25 was done: both real, both the strip's job.
      // Painting them here buried the one-off tasks the calendar exists for.
    });
  });

  it("puts no chip on a today the rule never asked for", async () => {
    const { occurrencesFor } = await import("./completions");
    const task = {
      ...base,
      createdAt: "2026-08-25T09:00:00.000Z",
      dueDate: "2026-08-28",
      // Mon/Wed/Fri: Aug 24 Mon, 26 Wed, 28 Fri. Today is Thursday the 27th.
      recurringRule: { frequency: "Weekly" as const, interval: 1, daysOfWeek: [1, 3, 5] },
    };
    expect(states(occurrencesFor(task, week, new Set(), "2026-08-27"))).toEqual({
      "2026-08-28": "pending", // only the next occurrence
    });
  });

  it("shows today when the work happened on an unscheduled today", async () => {
    const { occurrencesFor } = await import("./completions");
    const task = {
      ...base,
      dueDate: "2026-08-28",
      // Mon/Wed/Fri; today is Thursday, which the rule never asked for.
      recurringRule: { frequency: "Weekly" as const, interval: 1, daysOfWeek: [1, 3, 5] },
    };
    const done = new Set(["2026-08-27"]);
    expect(states(occurrencesFor(task, week, done, "2026-08-27"))).toEqual({
      "2026-08-27": "done", // real work today still shows on today
      "2026-08-28": "pending",
    });
  });

  it("stops a daily habit from crowding one-off tasks out of the grid", async () => {
    const { occurrencesFor } = await import("./completions");
    // The reported problem: a day cell renders only MAX_CHIPS, so a daily habit
    // graded across the whole month pushed the one-offs out of their own cells.
    const habit = {
      ...base,
      dueDate: "2026-08-27",
      recurringRule: { frequency: "Daily" as const, interval: 1 },
    };
    const oneOff = { ...base, id: "t2", dueDate: "2026-08-24" };
    const today = "2026-08-26";

    const habitDays = occurrencesFor(habit, week, new Set(["2026-08-25"]), today).map(
      (o) => o.date,
    );
    const oneOffDays = occurrencesFor(oneOff, week, new Set(), today).map((o) => o.date);

    // The habit claims two cells, not five, and none of them is the one-off's.
    expect(habitDays).toEqual(["2026-08-26", "2026-08-27"]);
    expect(oneOffDays).toEqual(["2026-08-24"]);
    expect(habitDays).not.toContain("2026-08-24");
  });

  it("leaves one-off tasks as a single chip on their due date", async () => {
    const { occurrencesFor } = await import("./completions");
    const task = { ...base, status: "Completed" as const, dueDate: "2026-08-25" };
    expect(occurrencesFor(task, week, new Set(), "2026-08-26")).toEqual([
      { taskId: "t1", date: "2026-08-25", state: "done" },
    ]);
  });
});

describe("dateless recurring tasks — habit with no schedule anchor", () => {
  const OLD = "2020-01-01T09:00:00.000Z";
  const FREQUENCIES = ["Daily", "Weekly", "Monthly", "Yearly"] as const;
  const week = ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"];
  const today = "2026-09-07";
  const states = (list: Array<{ date: string; state: string }>) =>
    Object.fromEntries(list.map((o) => [o.date, o.state]));

  const task = (frequency: (typeof FREQUENCIES)[number]) => ({
    id: "t1",
    status: "Not Started" as const,
    dueDate: undefined,
    createdAt: OLD,
    recurringRule: { frequency, interval: 1 },
  });

  it.each(FREQUENCIES)("%s with no due date puts no chip on the calendar", async (frequency) => {
    const { occurrencesFor } = await import("./completions");
    expect(occurrencesFor(task(frequency), week, new Set(), today)).toEqual([]);
  });

  it.each(FREQUENCIES)("%s no longer paints the days it was done", async (frequency) => {
    const { occurrencesFor } = await import("./completions");
    // Completed Sep 5 and Sep 6, both behind today: the strip's job now, not
    // the grid's. A dateless habit owes no particular day, so it forecasts
    // nothing either.
    const done = new Set(["2026-09-05", "2026-09-06"]);
    expect(occurrencesFor(task(frequency), week, done, today)).toEqual([]);
  });

  it.each(FREQUENCIES)("%s still shows work done today", async (frequency) => {
    const { occurrencesFor } = await import("./completions");
    expect(states(occurrencesFor(task(frequency), week, new Set([today]), today))).toEqual({
      [today]: "done",
    });
  });

  it("puts nothing behind today, however long the gap", async () => {
    const { occurrencesFor } = await import("./completions");
    expect(occurrencesFor(task("Daily"), week, new Set(["2026-09-04"]), today)).toEqual([]);
  });

  it.each(FREQUENCIES)(
    "%s history strip shows completions and nothing else",
    async (frequency) => {
      const { buildDayStrip } = await import("./completions");
      const cells = buildDayStrip(
        { frequency, interval: 1 },
        undefined, // no due date
        OLD,
        new Set(["2026-09-05", "2026-09-06"]),
        4,
        today,
      );
      expect(states(cells)).toEqual({
        "2026-09-04": "not-scheduled",
        "2026-09-05": "done",
        "2026-09-06": "done",
        "2026-09-07": "not-scheduled",
      });
    },
  );

  it("keeps done-off-schedule for tasks that do have a schedule to be off", async () => {
    const { buildDayStrip } = await import("./completions");
    // Mon/Wed/Fri anchored on Fri Sep 4; completed Sat Sep 5, an unscheduled day.
    const cells = buildDayStrip(
      { frequency: "Weekly", interval: 1, daysOfWeek: [1, 3, 5] },
      "2026-09-04",
      OLD,
      new Set(["2026-09-05"]),
      2,
      "2026-09-05",
    );
    expect(states(cells)).toEqual({
      "2026-09-04": "missed",
      "2026-09-05": "done-off-schedule",
    });
  });

  it("still shows an anchored recurring task on today and the next day it is owed", async () => {
    const { occurrencesFor } = await import("./completions");
    const anchored = {
      ...task("Daily"),
      dueDate: "2026-09-08",
    };
    expect(states(occurrencesFor(anchored, week, new Set(["2026-09-05"]), today))).toEqual({
      "2026-09-07": "pending",
      "2026-09-08": "pending",
    });
  });
});

describe("completing a dateless habit does not give it a schedule", () => {
  const daily = { frequency: "Daily" as const, interval: 1 };

  it("logs the day and leaves dueDate unset", async () => {
    const habit = task({ id: "h1", recurringRule: daily }); // no dueDate
    await seedStores(habit, TUESDAY);

    await toggleTaskComplete(habit);

    // The completion is recorded…
    expect(rows.has(key("h1", TUESDAY))).toBe(true);
    // …but the habit is still anchorless, so nothing becomes "scheduled".
    expect(current.dueDate).toBeUndefined();
    expect(current.status).toBe("Not Started");
  });

  it("snapshots no prevDueDate, so undo leaves it dateless too", async () => {
    const habit = task({ id: "h2", recurringRule: daily });
    await seedStores(habit, TUESDAY);

    await toggleTaskComplete(habit);
    expect(rows.get(key("h2", TUESDAY))?.prevDueDate).toBeUndefined();

    await seedStores(current, TUESDAY); // re-seed: todayDone now has h2
    await toggleTaskComplete(current);

    expect(rows.has(key("h2", TUESDAY))).toBe(false);
    expect(current.dueDate).toBeUndefined();
  });

  it("still rolls an anchored recurring task forward as before", async () => {
    const anchored = task({ id: "h3", dueDate: TUESDAY, recurringRule: daily });
    await seedStores(anchored, TUESDAY);

    await toggleTaskComplete(anchored);

    expect(current.dueDate).toBe(WEDNESDAY);
    expect(rows.get(key("h3", TUESDAY))?.prevDueDate).toBe(TUESDAY);
  });
});

describe("the calendar shows today and one step ahead — never the past", () => {
  const OLD = "2020-01-01T09:00:00.000Z";
  const today = "2026-09-05";
  const daily = {
    id: "t1",
    status: "Not Started" as const,
    dueDate: "2026-09-05",
    createdAt: OLD,
    recurringRule: { frequency: "Daily" as const, interval: 1 },
  };
  const states = (list: Array<{ date: string; state: string }>) =>
    Object.fromEntries(list.map((o) => [o.date, o.state]));

  it("shows today and the next occurrence only", async () => {
    const { occurrencesFor } = await import("./completions");
    const week = ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
    expect(states(occurrencesFor(daily, week, new Set(["2026-09-03"]), today))).toEqual({
      "2026-09-05": "pending", // today is owed, not a forecast
      "2026-09-06": "pending", // the next occurrence
      // Sep 3 done and Sep 4 missed are history; Sep 7 is beyond one step.
    });
  });

  it("leaves a whole future month empty — the reported clutter", async () => {
    const { occurrencesFor } = await import("./completions");
    const october = Array.from(
      { length: 31 },
      (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
    );
    expect(occurrencesFor(daily, october, new Set(), today)).toEqual([]);
  });

  it("leaves a past month empty when the grid is scrolled back", async () => {
    const { occurrencesFor } = await import("./completions");
    const august = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
    // Every one of those days was either done or missed, and none is drawn: a
    // month of history is what the strip and the Habits page are for.
    expect(occurrencesFor(daily, august, new Set(["2026-08-11", "2026-08-12"]), today)).toEqual([]);
  });

  it("caps by the rule's own step, not by a fixed window", async () => {
    const { occurrencesFor } = await import("./completions");
    const monthly = {
      ...daily,
      dueDate: "2026-10-05",
      recurringRule: { frequency: "Monthly" as const, interval: 1 },
    };
    const october = Array.from(
      { length: 31 },
      (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
    );
    expect(states(occurrencesFor(monthly, october, new Set(), today))).toEqual({
      "2026-10-05": "pending",
    });
  });

  it("hands the past to the strip, which still grades every day of it", async () => {
    const { occurrencesFor, buildDayStrip } = await import("./completions");
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    const done = new Set(["2026-09-02", "2026-09-04"]);

    // The grid draws nothing before today…
    const past = days.filter((day) => day < today);
    expect(occurrencesFor(daily, past, done, today)).toEqual([]);

    // …while the strip keeps the full done/missed history for exactly those days.
    const strip = Object.fromEntries(
      buildDayStrip(daily.recurringRule, daily.dueDate, OLD, done, 5, today).map((c) => [
        c.date,
        c.state,
      ]),
    );
    expect(strip).toMatchObject({
      "2026-09-01": "missed",
      "2026-09-02": "done",
      "2026-09-03": "missed",
      "2026-09-04": "done",
    });
  });
});

describe("habitStats", () => {
  const daily = { frequency: "Daily" as const, interval: 1 };
  const monWed = { frequency: "Weekly" as const, interval: 1, daysOfWeek: [1, 3] };
  const OLD = "2020-01-01T09:00:00.000Z";
  const TODAY = "2026-08-26"; // a Wednesday

  /** The `count` most recent days, today first. */
  const daysBack = (count: number, from = TODAY): string[] =>
    Array.from({ length: count }, (_, index) =>
      format(subDays(parseISO(from), index), "yyyy-MM-dd"),
    );

  it("counts a clean daily habit as fully adherent", async () => {
    const { habitStats, HABIT_WINDOW_DAYS } = await import("./completions");
    const stats = habitStats(daily, TODAY, OLD, new Set(daysBack(HABIT_WINDOW_DAYS)), TODAY);
    expect(stats).toMatchObject({
      done: HABIT_WINDOW_DAYS,
      missed: 0,
      scheduled: HABIT_WINDOW_DAYS,
      adherence: 1,
      streak: HABIT_WINDOW_DAYS,
    });
  });

  it("ends the streak at the first missed scheduled day", async () => {
    const { habitStats } = await import("./completions");
    // Done today and yesterday; the day before that was skipped.
    const stats = habitStats(daily, TODAY, OLD, new Set(daysBack(2)), TODAY);
    expect(stats?.streak).toBe(2);
    expect(stats?.done).toBe(2);
    expect(stats?.missed).toBeGreaterThan(0);
  });

  it("does not break the streak on a today that is still pending", async () => {
    const { habitStats } = await import("./completions");
    // Five days done, ending yesterday; today is scheduled and untouched.
    const done = new Set(daysBack(6).slice(1));
    const stats = habitStats(daily, TODAY, OLD, done, TODAY);
    expect(stats?.streak).toBe(5);
    // ...and a pending today is not a miss either.
    expect(stats?.done).toBe(5);
  });

  it("skips unscheduled days rather than breaking on them", async () => {
    const { habitStats } = await import("./completions");
    // Mon+Wed rule: Monday and today (Wednesday) done, Tuesday never owed.
    const stats = habitStats(monWed, TODAY, OLD, new Set(["2026-08-24", TODAY]), TODAY);
    expect(stats?.streak).toBe(2);
  });

  it("counts an off-schedule completion in neither direction", async () => {
    const { habitStats } = await import("./completions");
    // Mon+Wed rule, but the work happened on the Tuesday.
    const stats = habitStats(monWed, TODAY, OLD, new Set(["2026-08-25"]), TODAY);
    expect(stats?.done).toBe(0); // it satisfied nothing the rule asked for
    expect(stats?.streak).toBe(0); // and it holds no streak on a day never owed
  });

  it("never counts days from before the task existed", async () => {
    const { habitStats } = await import("./completions");
    const stats = habitStats(
      daily,
      TODAY,
      "2026-08-24T09:00:00.000Z", // created three days ago
      new Set(daysBack(3)),
      TODAY,
    );
    expect(stats).toMatchObject({ done: 3, missed: 0, scheduled: 3, adherence: 1, streak: 3 });
  });

  it("owes nothing after the rule's endDate", async () => {
    const { habitStats } = await import("./completions");
    const stats = habitStats(
      { ...daily, endDate: "2026-08-24" },
      TODAY,
      "2026-08-22T09:00:00.000Z",
      new Set(["2026-08-23", "2026-08-24"]),
      TODAY,
    );
    // Only the 22nd, 23rd and 24th were ever scheduled; the 25th and 26th are
    // past the endDate and are not misses.
    expect(stats).toMatchObject({ done: 2, missed: 1, scheduled: 3, streak: 2 });
  });

  it("returns null for a repeat with no due date to anchor it", async () => {
    const { habitStats } = await import("./completions");
    expect(habitStats(daily, undefined, OLD, new Set([TODAY]), TODAY)).toBeNull();
    expect(habitStats(undefined, TODAY, OLD, new Set([TODAY]), TODAY)).toBeNull();
  });

  it("reports null adherence when the window owed nothing", async () => {
    const { habitStats } = await import("./completions");
    // Created today, scheduled today, not done yet: nothing is owed *yet*.
    const stats = habitStats(daily, TODAY, "2026-08-26T09:00:00.000Z", new Set(), TODAY);
    expect(stats).toMatchObject({ scheduled: 0, adherence: null, streak: 0 });
  });
});

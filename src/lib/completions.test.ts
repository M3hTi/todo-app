import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("grades every past occurrence of a recurring task, not just its due date", async () => {
    const { occurrencesFor } = await import("./completions");
    const task = {
      ...base,
      dueDate: "2026-08-27", // the record only ever holds the next occurrence
      // An endDate keeps this on the graded path: open-ended rules deliberately
      // show only completed days (see "open-ended recurring tasks" below).
      recurringRule: { frequency: "Daily" as const, interval: 1, endDate: "2026-12-31" },
    };
    expect(states(occurrencesFor(task, week, new Set(["2026-08-25"]), "2026-08-26"))).toEqual({
      "2026-08-24": "missed",
      "2026-08-25": "done",
      "2026-08-26": "pending",
      "2026-08-27": "pending",
      "2026-08-28": "pending",
    });
  });

  it("skips days the rule never asked for, and days before the task existed", async () => {
    const { occurrencesFor } = await import("./completions");
    const task = {
      ...base,
      createdAt: "2026-08-25T09:00:00.000Z",
      dueDate: "2026-08-28",
      // Mon/Wed/Fri: Aug 24 Mon, 26 Wed, 28 Fri.
      recurringRule: {
        frequency: "Weekly" as const,
        interval: 1,
        daysOfWeek: [1, 3, 5],
        endDate: "2026-12-31",
      },
    };
    expect(states(occurrencesFor(task, week, new Set(), "2026-08-27"))).toEqual({
      "2026-08-26": "missed", // scheduled, past, no log row
      "2026-08-28": "pending",
    });
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

  it.each(FREQUENCIES)("%s still shows the days it was actually done", async (frequency) => {
    const { occurrencesFor } = await import("./completions");
    // The reported example: completed Sep 5 and Sep 6, nothing on Sep 7.
    const done = new Set(["2026-09-05", "2026-09-06"]);
    expect(states(occurrencesFor(task(frequency), week, done, today))).toEqual({
      "2026-09-05": "done",
      "2026-09-06": "done",
    });
  });

  it("never marks a past day missed, however long the gap", async () => {
    const { occurrencesFor } = await import("./completions");
    const out = occurrencesFor(task("Daily"), week, new Set(["2026-09-04"]), today);
    expect(out.map((o) => o.state)).toEqual(["done"]);
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

  it("leaves anchored, bounded recurring tasks completely alone", async () => {
    const { occurrencesFor } = await import("./completions");
    const anchored = {
      ...task("Daily"),
      dueDate: "2026-09-08",
      recurringRule: { frequency: "Daily" as const, interval: 1, endDate: "2026-12-31" },
    };
    expect(states(occurrencesFor(anchored, week, new Set(["2026-09-05"]), today))).toEqual({
      "2026-09-04": "missed",
      "2026-09-05": "done",
      "2026-09-06": "missed",
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

describe("open-ended recurring tasks — a repeat with no Until date", () => {
  const week = ["2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-10-20"];
  const today = "2026-09-05";
  const task = (endDate?: string) => ({
    id: "t1",
    status: "Not Started" as const,
    dueDate: "2026-09-05",
    createdAt: "2026-08-13T16:19:59.356Z",
    recurringRule: { frequency: "Daily" as const, interval: 1, endDate },
  });

  it("shows only completed days, never missed or pending", async () => {
    const { occurrencesFor } = await import("./completions");
    const done = new Set(["2026-09-03", "2026-09-05"]);
    expect(occurrencesFor(task(), week, done, today)).toEqual([
      { taskId: "t1", date: "2026-09-03", state: "done" },
      { taskId: "t1", date: "2026-09-05", state: "done" },
    ]);
  });

  it("puts no chip at all on a month it was never touched", async () => {
    const { occurrencesFor } = await import("./completions");
    expect(occurrencesFor(task(), week, new Set(), today)).toEqual([]);
  });

  it("still grades occurrences when the rule has an Until date", async () => {
    const { occurrencesFor } = await import("./completions");
    const out = occurrencesFor(task("2026-09-30"), week, new Set(["2026-09-03"]), today);
    expect(out.map((o) => [o.date, o.state])).toEqual([
      ["2026-09-03", "done"],
      ["2026-09-04", "missed"],
      ["2026-09-05", "pending"],
      ["2026-09-06", "pending"],
    ]);
  });
});

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

// The per-task completion map is derived state the missed badge reads on every
// row, and it is mutated in three places. These tests pin the one thing that
// silently breaks: a map that stops matching the log, or is mutated in place and
// therefore never re-renders.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCompletionsInRange = vi.fn(async () => [] as Array<{ date: string; count: number }>);
const getTaskIdsCompletedOn = vi.fn(async () => [] as string[]);
const getTaskCompletionsInRange = vi.fn(
  async () => [] as Array<{ taskId: string; date: string }>,
);
const logCompletion = vi.fn(async () => undefined);
const getCompletion = vi.fn(async () => null);
const deleteCompletion = vi.fn(async () => undefined);

vi.mock("@/lib/queries/completions", () => ({
  getCompletionsInRange: (...args: unknown[]) => getCompletionsInRange(...(args as [])),
  getTaskIdsCompletedOn: (...args: unknown[]) => getTaskIdsCompletedOn(...(args as [])),
  getTaskCompletionsInRange: (...args: unknown[]) => getTaskCompletionsInRange(...(args as [])),
  logCompletion: (...args: unknown[]) => logCompletion(...(args as [])),
  getCompletion: (...args: unknown[]) => getCompletion(...(args as [])),
  deleteCompletion: (...args: unknown[]) => deleteCompletion(...(args as [])),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const { useCompletionStore } = await import("./useCompletionStore");

beforeEach(() => {
  vi.clearAllMocks();
  useCompletionStore.setState({
    completionsByDate: {},
    todayDone: new Set(),
    completionsByTask: new Map(),
  });
});

describe("completionsByTask", () => {
  it("groups the window's rows by task on load", async () => {
    getTaskCompletionsInRange.mockResolvedValueOnce([
      { taskId: "a", date: "2026-08-25" },
      { taskId: "a", date: "2026-08-26" },
      { taskId: "b", date: "2026-08-26" },
    ]);

    await useCompletionStore.getState().load();

    const byTask = useCompletionStore.getState().completionsByTask;
    expect(byTask.get("a")).toEqual(new Set(["2026-08-25", "2026-08-26"]));
    expect(byTask.get("b")).toEqual(new Set(["2026-08-26"]));
  });

  it("leaves the map empty and does not throw when the read fails", async () => {
    getTaskCompletionsInRange.mockRejectedValueOnce(new Error("simulated"));

    await expect(useCompletionStore.getState().load()).resolves.toBeUndefined();
    expect(useCompletionStore.getState().completionsByTask.size).toBe(0);
  });

  it("adds the day on markDone, in a new Map", async () => {
    const before = useCompletionStore.getState().completionsByTask;

    await useCompletionStore.getState().markDone({
      taskId: "a",
      taskTitle: "Water the plants",
      occurrenceDate: "2026-08-26",
      completedAt: "2026-08-26T09:00:00.000Z",
    });

    const after = useCompletionStore.getState().completionsByTask;
    expect(after.get("a")).toEqual(new Set(["2026-08-26"]));
    // A mutated Map keeps its identity and never re-renders a row.
    expect(after).not.toBe(before);
  });

  it("removes the day on unmarkDone and drops the task when its last day goes", async () => {
    useCompletionStore.setState({
      completionsByTask: new Map([["a", new Set(["2026-08-26"])]]),
    });
    getCompletion.mockResolvedValueOnce({
      id: "c1",
      taskId: "a",
      taskTitle: "Water the plants",
      occurrenceDate: "2026-08-26",
      completedAt: "2026-08-26T09:00:00.000Z",
    } as never);

    await useCompletionStore.getState().unmarkDone("a", "2026-08-26");

    expect(useCompletionStore.getState().completionsByTask.has("a")).toBe(false);
  });

  it("keeps a task's other days when one is undone", async () => {
    useCompletionStore.setState({
      completionsByTask: new Map([["a", new Set(["2026-08-25", "2026-08-26"])]]),
    });
    getCompletion.mockResolvedValueOnce({
      id: "c1",
      taskId: "a",
      taskTitle: "Water the plants",
      occurrenceDate: "2026-08-26",
      completedAt: "2026-08-26T09:00:00.000Z",
    } as never);

    await useCompletionStore.getState().unmarkDone("a", "2026-08-26");

    expect(useCompletionStore.getState().completionsByTask.get("a")).toEqual(
      new Set(["2026-08-25"]),
    );
  });
});

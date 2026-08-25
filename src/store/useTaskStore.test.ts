import { describe, it, expect, vi, beforeEach } from "vitest";

const select = vi.fn();
const execute = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: () => ({ select, execute }) };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

const { useTaskStore, selectFilteredTasks } = await import("./useTaskStore");
import type { Task } from "@/types";

beforeEach(() => {
  select.mockReset();
  execute.mockReset();
  toastError.mockReset();
  useTaskStore.setState({ tasks: [], loading: false });
});

describe("loadTasks — self-defense against a fetch failure", () => {
  it("surfaces a toast, resets loading, AND still rejects (so existing callers keep their own handling)", async () => {
    select.mockRejectedValue(new Error("simulated DB failure"));

    await expect(useTaskStore.getState().loadTasks()).rejects.toThrow();

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(useTaskStore.getState().loading).toBe(false);
  });

  it("does not toast on success", async () => {
    select.mockResolvedValue([]); // getAllTasks -> [] rows; assembleTasks short-circuits, no further calls
    await useTaskStore.getState().loadTasks();
    expect(toastError).not.toHaveBeenCalled();
    expect(useTaskStore.getState().loading).toBe(false);
  });
});

function task(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    status: "Not Started",
    priority: "Medium",
    tags: [],
    subtasks: [],
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("search matches beyond the title", () => {
  const tasks = [
    task({ title: "Buy milk" }),
    task({ title: "Call plumber", notes: "ask about the leaking radiator" }),
    task({ title: "Renew passport", description: "photo booth on Elm Street" }),
    task({ title: "Standup", tags: ["quarterly-review"] }),
    task({
      title: "Trip prep",
      subtasks: [
        {
          id: "s1",
          taskId: "t",
          title: "pack snorkel",
          completed: false,
          order: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
  ];

  const search = (query: string): string[] => {
    useTaskStore.setState({ tasks, searchQuery: query });
    return selectFilteredTasks(useTaskStore.getState()).map((t) => t.title);
  };

  it("matches notes", () => expect(search("radiator")).toEqual(["Call plumber"]));
  it("matches description", () => expect(search("elm street")).toEqual(["Renew passport"]));
  it("matches tags", () => expect(search("quarterly")).toEqual(["Standup"]));
  it("matches subtask titles", () => expect(search("snorkel")).toEqual(["Trip prep"]));
  it("still matches titles, case-insensitively", () =>
    expect(search("MILK")).toEqual(["Buy milk"]));
  it("returns nothing for a miss", () => expect(search("zzz")).toEqual([]));
});

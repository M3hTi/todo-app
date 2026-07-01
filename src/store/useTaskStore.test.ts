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

const { useTaskStore } = await import("./useTaskStore");

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

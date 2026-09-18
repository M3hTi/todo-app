import { describe, it, expect, vi, beforeEach } from "vitest";

const execute = vi.fn();
const select = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({ execute, select }),
  withDb: async (_label: string, fn: () => unknown) => fn(),
}));

const { updateSubtask } = await import("./subtasks");

/** The statement that promotes the parent task, if it was issued. */
function promoteCall(): [string, unknown[]] | undefined {
  return execute.mock.calls.find(([sql]) => String(sql).includes("UPDATE tasks")) as
    | [string, unknown[]]
    | undefined;
}

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue(undefined);
});

describe("updateSubtask — parent status", () => {
  it("promotes a Not Started parent to In Progress when a subtask is completed", async () => {
    await updateSubtask("sub-1", { completed: true });

    const call = promoteCall();
    expect(call).toBeDefined();
    const [sql, params] = call!;
    expect(sql).toMatch(/status = 'In Progress'/);
    // Only a Not Started parent moves; In Progress / Completed / Cancelled stay put.
    expect(sql).toMatch(/WHERE\s+status = 'Not Started'/);
    expect(params[1]).toBe("sub-1");
  });

  it("does not touch the parent when a subtask is un-completed", async () => {
    await updateSubtask("sub-1", { completed: false });
    expect(promoteCall()).toBeUndefined();
  });

  it("does not touch the parent on a rename", async () => {
    await updateSubtask("sub-1", { title: "renamed" });
    expect(promoteCall()).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const select = vi.fn();
const execute = vi.fn();

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: () => ({ select, execute }) };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const { useCategoryStore } = await import("./useCategoryStore");
const { useTaskStore } = await import("./useTaskStore");

const seedCategory = { id: "cat1", name: "Work", color: "#fff", createdAt: "x", updatedAt: "x" };

beforeEach(() => {
  select.mockReset();
  execute.mockReset();
  useCategoryStore.setState({ categories: [seedCategory] });
  useTaskStore.setState({ tasks: [], loading: false });
});

describe("deleteCategory — distinguishes delete failure from reload failure", () => {
  it("delete succeeds, reload succeeds: resolves {reloadFailed:false}, category removed", async () => {
    execute.mockResolvedValue(undefined);
    select.mockResolvedValue([]); // getAllTasks -> [] rows

    const result = await useCategoryStore.getState().deleteCategory("cat1");

    expect(result).toEqual({ reloadFailed: false });
    expect(useCategoryStore.getState().categories).toEqual([]);
  });

  it("delete succeeds, reload FAILS: resolves {reloadFailed:true} (does NOT reject), category still removed", async () => {
    execute.mockResolvedValue(undefined); // DELETE FROM categories succeeds
    select.mockImplementation((sql: string) =>
      sql.includes("FROM tasks") ? Promise.reject(new Error("simulated")) : Promise.resolve([]),
    );

    const result = await useCategoryStore.getState().deleteCategory("cat1");

    expect(result).toEqual({ reloadFailed: true });
    // The delete itself succeeded and must not be misattributed as failed.
    expect(useCategoryStore.getState().categories).toEqual([]);
  });

  it("the delete itself FAILS: the action rejects, category is NOT removed", async () => {
    execute.mockRejectedValue(new Error("simulated delete failure"));

    await expect(useCategoryStore.getState().deleteCategory("cat1")).rejects.toThrow();
    expect(useCategoryStore.getState().categories).toEqual([seedCategory]);
  });
});

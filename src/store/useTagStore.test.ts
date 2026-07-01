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

const { useTagStore } = await import("./useTagStore");
const { useTaskStore } = await import("./useTaskStore");

const seedTag = { id: "tag1", name: "urgent", createdAt: "x" };

beforeEach(() => {
  select.mockReset();
  execute.mockReset();
  useTagStore.setState({ tags: [seedTag] });
  useTaskStore.setState({ tasks: [], loading: false });
});

describe("deleteTag — distinguishes delete failure from reload failure", () => {
  it("delete succeeds, reload succeeds: resolves {reloadFailed:false}, tag removed", async () => {
    execute.mockResolvedValue(undefined);
    select.mockResolvedValue([]);

    const result = await useTagStore.getState().deleteTag("tag1");

    expect(result).toEqual({ reloadFailed: false });
    expect(useTagStore.getState().tags).toEqual([]);
  });

  it("delete succeeds, reload FAILS: resolves {reloadFailed:true} (does NOT reject), tag still removed", async () => {
    execute.mockResolvedValue(undefined);
    select.mockImplementation((sql: string) =>
      sql.includes("FROM tasks") ? Promise.reject(new Error("simulated")) : Promise.resolve([]),
    );

    const result = await useTagStore.getState().deleteTag("tag1");

    expect(result).toEqual({ reloadFailed: true });
    expect(useTagStore.getState().tags).toEqual([]);
  });

  it("the delete itself FAILS: the action rejects, tag is NOT removed", async () => {
    execute.mockRejectedValue(new Error("simulated delete failure"));

    await expect(useTagStore.getState().deleteTag("tag1")).rejects.toThrow();
    expect(useTagStore.getState().tags).toEqual([seedTag]);
  });
});

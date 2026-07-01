import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskRow } from "./tasks";

const select = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select }),
  withDb: async (_label: string, fn: () => unknown) => fn(),
}));

// assembleTasks is exported for this test only; not used by any other module.
const { assembleTasks } = await import("./tasks");

function taskRow(id: string, overrides: Partial<Record<string, unknown>> = {}): TaskRow {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status: "Not Started",
    priority: "Medium",
    due_date: null,
    due_time: null,
    category_id: null,
    reminder_json: null,
    recurring_rule_json: null,
    sort_order: 0,
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    completed_at: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  select.mockReset();
});

describe("assembleTasks — query scoping", () => {
  it("does not query the DB at all for an empty input (no invalid SQL, no whole-table read)", async () => {
    const result = await assembleTasks([]);
    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("scopes the subtasks and tag-links SELECTs to exactly the assembled task ids", async () => {
    select.mockResolvedValue([]);
    await assembleTasks([taskRow("a"), taskRow("b")]);

    expect(select).toHaveBeenCalledTimes(2);

    const [subtaskSql, subtaskParams] = select.mock.calls[0] as [string, unknown[]];
    expect(subtaskSql).toMatch(/FROM subtasks/);
    expect(subtaskSql).toMatch(/WHERE task_id IN \(\$1, ?\$2\)/);
    expect(subtaskParams).toEqual(["a", "b"]);

    const [tagSql, tagParams] = select.mock.calls[1] as [string, unknown[]];
    expect(tagSql).toMatch(/FROM task_tags/);
    expect(tagSql).toMatch(/WHERE tt\.task_id IN \(\$1, ?\$2\)/);
    expect(tagParams).toEqual(["a", "b"]);
  });

  it("scopes a single-task fetch to exactly one id (the getTaskById path)", async () => {
    select.mockResolvedValue([]);
    await assembleTasks([taskRow("solo")]);

    const [, subtaskParams] = select.mock.calls[0] as [string, unknown[]];
    expect(subtaskParams).toEqual(["solo"]);
    const [, tagParams] = select.mock.calls[1] as [string, unknown[]];
    expect(tagParams).toEqual(["solo"]);
  });
});

describe("assembleTasks — grouping correctness (unchanged behavior)", () => {
  it("assigns each task only its own subtasks, in SELECT (sort_order) order, with no cross-contamination", async () => {
    select
      .mockResolvedValueOnce([
        // interleaved on purpose: proves grouping keys off task_id, not row position
        { id: "s2", task_id: "b", title: "b-first", completed: 0, sort_order: 0, created_at: "x", updated_at: "x" },
        { id: "s1", task_id: "a", title: "a-first", completed: 1, sort_order: 0, created_at: "x", updated_at: "x" },
        { id: "s3", task_id: "a", title: "a-second", completed: 0, sort_order: 1, created_at: "x", updated_at: "x" },
      ])
      .mockResolvedValueOnce([]);

    const [taskA, taskB] = await assembleTasks([taskRow("a"), taskRow("b")]);

    expect(taskA?.subtasks.map((s) => s.title)).toEqual(["a-first", "a-second"]);
    expect(taskA?.subtasks[0]?.completed).toBe(true);
    expect(taskB?.subtasks.map((s) => s.title)).toEqual(["b-first"]);
  });

  it("assigns each task only its own tag names, in SELECT (name) order", async () => {
    select.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { task_id: "b", name: "urgent" },
      { task_id: "a", name: "home" },
      { task_id: "a", name: "work" },
    ]);

    const [taskA, taskB] = await assembleTasks([taskRow("a"), taskRow("b")]);

    expect(taskA?.tags).toEqual(["home", "work"]);
    expect(taskB?.tags).toEqual(["urgent"]);
  });

  it("gives a task with no subtasks and no tags empty arrays, not undefined", async () => {
    select.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const [task] = await assembleTasks([taskRow("lonely")]);
    expect(task?.subtasks).toEqual([]);
    expect(task?.tags).toEqual([]);
  });
});

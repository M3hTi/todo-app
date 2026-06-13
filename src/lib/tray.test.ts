import { describe, it, expect } from "vitest";
import { buildTrayPayload } from "./tray";
import type { Task } from "@/types";

function makeTask(partial: Partial<Task>): Task {
  return {
    id: "t1",
    title: "Task",
    status: "Not Started",
    priority: "Medium",
    tags: [],
    subtasks: [],
    sortOrder: 0,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...partial,
  };
}

const NOW = new Date("2026-06-13T12:00:00");

describe("buildTrayPayload", () => {
  it("lists open tasks due today with their time", () => {
    const tasks = [
      makeTask({ id: "a", title: "Pay rent", dueDate: "2026-06-13", dueTime: "09:00" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.today).toEqual([{ id: "a", label: "Pay rent  09:00" }]);
  });

  it("lists upcoming tasks sorted by date ascending", () => {
    const tasks = [
      makeTask({ id: "b", title: "Later", dueDate: "2026-06-20" }),
      makeTask({ id: "c", title: "Sooner", dueDate: "2026-06-16" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.upcoming.map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("counts overdue open tasks and excludes completed/cancelled", () => {
    const tasks = [
      makeTask({ id: "d", dueDate: "2026-06-10" }),
      makeTask({ id: "e", dueDate: "2026-06-10", status: "Completed" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.overdue).toBe(1);
    expect(payload.tooltip).toBe("Today: 0 · Overdue: 1");
  });

  it("excludes completed/cancelled tasks from the today list", () => {
    const tasks = [
      makeTask({ id: "f", title: "Done", dueDate: "2026-06-13", status: "Completed" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.today).toEqual([]);
  });
});

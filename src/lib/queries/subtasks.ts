import type { Subtask } from "@/types";
import { getDb, withDb } from "@/lib/db";

const SUBTASK_COLUMNS = "id, task_id, title, completed, sort_order, created_at, updated_at";

export async function createSubtask(taskId: string, title: string): Promise<Subtask> {
  return withDb("createSubtask", async () => {
    const db = getDb();
    const [{ next }] = await db.select<Array<{ next: number }>>(
      "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM subtasks WHERE task_id = $1",
      [taskId],
    );
    const now = new Date().toISOString();
    const subtask: Subtask = {
      id: crypto.randomUUID(),
      taskId,
      title,
      completed: false,
      order: next,
      createdAt: now,
      updatedAt: now,
    };
    await db.execute(
      `INSERT INTO subtasks (${SUBTASK_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [subtask.id, subtask.taskId, subtask.title, 0, subtask.order, now, now],
    );
    return subtask;
  });
}

export async function updateSubtask(
  id: string,
  patch: Partial<Pick<Subtask, "title" | "completed">>,
): Promise<void> {
  return withDb("updateSubtask", async () => {
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (patch.title !== undefined) {
      sets.push(`title = $${index++}`);
      values.push(patch.title);
    }
    if (patch.completed !== undefined) {
      sets.push(`completed = $${index++}`);
      values.push(patch.completed ? 1 : 0);
    }
    if (sets.length === 0) return;

    sets.push(`updated_at = $${index++}`);
    values.push(new Date().toISOString());
    values.push(id);

    await getDb().execute(`UPDATE subtasks SET ${sets.join(", ")} WHERE id = $${index}`, values);
  });
}

export async function deleteSubtask(id: string): Promise<void> {
  return withDb("deleteSubtask", async () => {
    await getDb().execute("DELETE FROM subtasks WHERE id = $1", [id]);
  });
}

/** Persists a new ordering: orderedIds[i] gets sort_order i. */
export async function reorderSubtasks(taskId: string, orderedIds: string[]): Promise<void> {
  return withDb("reorderSubtasks", async () => {
    const db = getDb();
    const now = new Date().toISOString();
    for (let position = 0; position < orderedIds.length; position++) {
      await db.execute(
        "UPDATE subtasks SET sort_order = $1, updated_at = $2 WHERE id = $3 AND task_id = $4",
        [position, now, orderedIds[position], taskId],
      );
    }
  });
}

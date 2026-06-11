import type { RecurringRule, Subtask, Tag, Task, TaskPriority, TaskStatus } from "@/types";
import { getDb, withDb } from "@/lib/db";
import { setTagsForTask } from "@/lib/queries/tags";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  category_id: string | null;
  reminder_at: string | null;
  reminder_shown_at: string | null;
  recurring_rule_json: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  notes: string | null;
}

interface SubtaskRow {
  id: string;
  task_id: string;
  title: string;
  completed: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TaskTagRow {
  task_id: string;
  name: string;
}

const TASK_COLUMNS =
  "id, title, description, status, priority, due_date, due_time, category_id, " +
  "reminder_at, reminder_shown_at, recurring_rule_json, sort_order, created_at, " +
  "updated_at, completed_at, notes";

/** Fields the caller provides when creating a task; the rest are generated. */
export type CreateTaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  dueTime?: string;
  categoryId?: string;
  tags?: string[];
  reminderAt?: string;
  recurringRule?: RecurringRule;
  notes?: string;
};

/** Updatable scalar fields plus tags; undefined = leave unchanged, null = clear. */
export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  dueTime?: string | null;
  categoryId?: string | null;
  tags?: string[];
  reminderAt?: string | null;
  reminderShownAt?: string | null;
  recurringRule?: RecurringRule | null;
  sortOrder?: number;
  completedAt?: string | null;
  notes?: string | null;
};

function parseRule(json: string | null): RecurringRule | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as RecurringRule;
  } catch {
    return undefined;
  }
}

function mapTask(row: TaskRow, subtasks: Subtask[], tags: string[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ?? undefined,
    dueTime: row.due_time ?? undefined,
    categoryId: row.category_id ?? undefined,
    tags,
    subtasks,
    reminderAt: row.reminder_at ?? undefined,
    reminderShownAt: row.reminder_shown_at ?? undefined,
    recurringRule: parseRule(row.recurring_rule_json),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function mapSubtaskRow(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    completed: row.completed === 1,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Loads subtasks and tag names for the given rows and assembles full Task objects. */
async function assembleTasks(rows: TaskRow[]): Promise<Task[]> {
  if (rows.length === 0) return [];
  const db = getDb();

  const subtaskRows = await db.select<SubtaskRow[]>(
    "SELECT id, task_id, title, completed, sort_order, created_at, updated_at FROM subtasks ORDER BY sort_order",
  );
  const tagRows = await db.select<TaskTagRow[]>(
    `SELECT tt.task_id, t.name
     FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
     ORDER BY t.name COLLATE NOCASE`,
  );

  const subtasksByTask = new Map<string, Subtask[]>();
  for (const row of subtaskRows) {
    const list = subtasksByTask.get(row.task_id) ?? [];
    list.push(mapSubtaskRow(row));
    subtasksByTask.set(row.task_id, list);
  }

  const tagsByTask = new Map<string, string[]>();
  for (const row of tagRows) {
    const list = tagsByTask.get(row.task_id) ?? [];
    list.push(row.name);
    tagsByTask.set(row.task_id, list);
  }

  return rows.map((row) =>
    mapTask(row, subtasksByTask.get(row.id) ?? [], tagsByTask.get(row.id) ?? []),
  );
}

export async function getAllTasks(): Promise<Task[]> {
  return withDb("getAllTasks", async () => {
    const rows = await getDb().select<TaskRow[]>(
      `SELECT ${TASK_COLUMNS} FROM tasks ORDER BY sort_order, created_at`,
    );
    return assembleTasks(rows);
  });
}

export async function getTaskById(id: string): Promise<Task | null> {
  return withDb("getTaskById", async () => {
    const rows = await getDb().select<TaskRow[]>(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
      [id],
    );
    const tasks = await assembleTasks(rows);
    return tasks[0] ?? null;
  });
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return withDb("createTask", async () => {
    const db = getDb();
    const [{ next }] = await db.select<Array<{ next: number }>>(
      "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM tasks",
    );
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    await db.execute(
      `INSERT INTO tasks (${TASK_COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        input.title,
        input.description ?? null,
        input.status ?? "Not Started",
        input.priority ?? "Medium",
        input.dueDate ?? null,
        input.dueTime ?? null,
        input.categoryId ?? null,
        input.reminderAt ?? null,
        null,
        input.recurringRule ? JSON.stringify(input.recurringRule) : null,
        next,
        now,
        now,
        null,
        input.notes ?? null,
      ],
    );

    let tags: Tag[] = [];
    if (input.tags && input.tags.length > 0) {
      tags = await setTagsForTask(id, input.tags);
    }

    return {
      id,
      title: input.title,
      description: input.description,
      status: input.status ?? "Not Started",
      priority: input.priority ?? "Medium",
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      categoryId: input.categoryId,
      tags: tags.map((tag) => tag.name),
      subtasks: [],
      reminderAt: input.reminderAt,
      reminderShownAt: undefined,
      recurringRule: input.recurringRule,
      sortOrder: next,
      createdAt: now,
      updatedAt: now,
      completedAt: undefined,
      notes: input.notes,
    };
  });
}

export async function updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
  return withDb("updateTask", async () => {
    const db = getDb();
    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    const set = (column: string, value: unknown): void => {
      sets.push(`${column} = $${index++}`);
      values.push(value);
    };

    if (patch.title !== undefined) set("title", patch.title);
    if (patch.description !== undefined) set("description", patch.description);
    if (patch.status !== undefined) set("status", patch.status);
    if (patch.priority !== undefined) set("priority", patch.priority);
    if (patch.dueDate !== undefined) set("due_date", patch.dueDate);
    if (patch.dueTime !== undefined) set("due_time", patch.dueTime);
    if (patch.categoryId !== undefined) set("category_id", patch.categoryId);
    if (patch.reminderAt !== undefined) set("reminder_at", patch.reminderAt);
    if (patch.reminderShownAt !== undefined) set("reminder_shown_at", patch.reminderShownAt);
    if (patch.recurringRule !== undefined) {
      set("recurring_rule_json", patch.recurringRule ? JSON.stringify(patch.recurringRule) : null);
    }
    if (patch.sortOrder !== undefined) set("sort_order", patch.sortOrder);
    if (patch.completedAt !== undefined) set("completed_at", patch.completedAt);
    if (patch.notes !== undefined) set("notes", patch.notes);

    if (sets.length > 0) {
      set("updated_at", new Date().toISOString());
      values.push(id);
      await db.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = $${index}`, values);
    }

    if (patch.tags !== undefined) {
      await setTagsForTask(id, patch.tags);
    }

    const task = await getTaskById(id);
    if (!task) {
      throw new Error(`Task ${id} not found after update`);
    }
    return task;
  });
}

export async function deleteTask(id: string): Promise<void> {
  return withDb("deleteTask", async () => {
    // Subtasks and task_tags rows cascade via FK constraints.
    await getDb().execute("DELETE FROM tasks WHERE id = $1", [id]);
  });
}

export async function searchTasks(query: string): Promise<Task[]> {
  return withDb("searchTasks", async () => {
    const pattern = `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`;
    const rows = await getDb().select<TaskRow[]>(
      `SELECT ${TASK_COLUMNS} FROM tasks
       WHERE title LIKE $1 ESCAPE '\\'
          OR description LIKE $1 ESCAPE '\\'
          OR notes LIKE $1 ESCAPE '\\'
       ORDER BY sort_order, created_at`,
      [pattern],
    );
    return assembleTasks(rows);
  });
}

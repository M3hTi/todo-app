import { create } from "zustand";
import type { Task, TaskPriority, TaskStatus } from "@/types";
import {
  createTask,
  deleteTask,
  getAllTasks,
  getTaskById,
  updateTask,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@/lib/queries/tasks";

export type SortBy = "sortOrder" | "dueDate" | "priority" | "title" | "createdAt";
export type SortDir = "asc" | "desc";

export interface TaskFilters {
  filterStatus: TaskStatus | null;
  filterPriority: TaskPriority | null;
  filterCategoryId: string | null;
  filterTags: string[];
}

interface TaskStoreState extends TaskFilters {
  tasks: Task[];
  selectedTaskId: string | null;
  searchQuery: string;
  sortBy: SortBy;
  sortDir: SortDir;
  loading: boolean;
  taskFormOpen: boolean;
  /** Task pending delete confirmation (set by the Delete shortcut). */
  confirmDeleteTaskId: string | null;

  loadTasks: () => Promise<void>;
  addTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  /** Re-reads one task from the DB and swaps it into state (drops it if gone). */
  refreshTask: (id: string) => Promise<void>;
  setSelectedTask: (id: string | null) => void;
  setFilter: (patch: Partial<TaskFilters>) => void;
  setSort: (sortBy: SortBy, sortDir: SortDir) => void;
  setSearch: (query: string) => void;
  setTaskFormOpen: (open: boolean) => void;
  setConfirmDeleteTask: (id: string | null) => void;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export const useTaskStore = create<TaskStoreState>((set) => ({
  tasks: [],
  selectedTaskId: null,
  searchQuery: "",
  filterStatus: null,
  filterPriority: null,
  filterCategoryId: null,
  filterTags: [],
  sortBy: "sortOrder",
  sortDir: "asc",
  loading: false,
  taskFormOpen: false,
  confirmDeleteTaskId: null,

  loadTasks: async () => {
    set({ loading: true });
    try {
      const tasks = await getAllTasks();
      set({ tasks });
    } finally {
      set({ loading: false });
    }
  },

  addTask: async (input) => {
    const task = await createTask(input);
    set((state) => ({ tasks: [...state.tasks, task] }));
    return task;
  },

  updateTask: async (id, patch) => {
    const updated = await updateTask(id, patch);
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? updated : task)),
    }));
    return updated;
  },

  deleteTask: async (id) => {
    await deleteTask(id);
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    }));
  },

  refreshTask: async (id) => {
    const task = await getTaskById(id);
    set((state) => ({
      tasks: task
        ? state.tasks.map((existing) => (existing.id === id ? task : existing))
        : state.tasks.filter((existing) => existing.id !== id),
    }));
  },

  setSelectedTask: (id) => set({ selectedTaskId: id }),
  setFilter: (patch) => set(patch),
  setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),
  setSearch: (query) => set({ searchQuery: query }),
  setTaskFormOpen: (open) => set({ taskFormOpen: open }),
  setConfirmDeleteTask: (id) => set({ confirmDeleteTaskId: id }),
}));

/**
 * Derived selector: applies search + all active filters in one pass, then sorts.
 * Use with `useTaskStore(useShallow(selectFilteredTasks))`.
 */
export function selectFilteredTasks(state: TaskStoreState): Task[] {
  const query = state.searchQuery.trim().toLowerCase();

  const filtered = state.tasks.filter((task) => {
    if (state.filterStatus && task.status !== state.filterStatus) return false;
    if (state.filterPriority && task.priority !== state.filterPriority) return false;
    if (state.filterCategoryId && task.categoryId !== state.filterCategoryId) return false;
    if (
      state.filterTags.length > 0 &&
      !state.filterTags.every((tag) => task.tags.includes(tag))
    ) {
      return false;
    }
    if (query) {
      const haystack = `${task.title} ${task.description ?? ""} ${task.notes ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const direction = state.sortDir === "asc" ? 1 : -1;
  return filtered.sort((a, b) => compareTasks(a, b, state.sortBy) * direction);
}

function compareTasks(a: Task, b: Task, sortBy: SortBy): number {
  switch (sortBy) {
    case "dueDate": {
      // Tasks without a due date sort last regardless of direction-relevant value.
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    case "priority":
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case "title":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt);
    case "sortOrder":
      return a.sortOrder - b.sortOrder;
  }
}

import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { differenceInMinutes, parseISO, subMinutes } from "date-fns";
import type { Task } from "@/types";
import { selectFilteredTasks, useTaskStore } from "@/store/useTaskStore";
import { getNextDueDate, isRuleExpired } from "@/lib/recurrence";

/** Tasks after search, filters and sort — the list every view renders from. */
export function useFilteredTasks(): Task[] {
  return useTaskStore(useShallow(selectFilteredTasks));
}

/**
 * Toggles a task between Completed and Not Started, stamping completedAt.
 * Completing a recurring task rolls the same record forward to its next due
 * date (see src/lib/recurrence.ts); an expired rule is cleared and the task
 * stays completed.
 */
export async function toggleTaskComplete(task: Task): Promise<void> {
  try {
    await doToggle(task);
  } catch {
    toast.error("Failed to save task. Please try again.");
  }
}

async function doToggle(task: Task): Promise<void> {
  const store = useTaskStore.getState();

  if (task.status === "Completed") {
    await store.updateTask(task.id, { status: "Not Started", completedAt: null });
    return;
  }

  const completedAt = new Date().toISOString();

  if (task.recurringRule) {
    const nextDueDate = getNextDueDate(task.recurringRule, completedAt);
    if (isRuleExpired(task.recurringRule, nextDueDate)) {
      await store.updateTask(task.id, { status: "Completed", completedAt, recurringRule: null });
      return;
    }
    await store.updateTask(task.id, {
      status: "Not Started",
      dueDate: nextDueDate,
      completedAt: null,
      reminderAt: shiftReminder(task, nextDueDate),
      reminderShownAt: null,
    });
    return;
  }

  await store.updateTask(task.id, { status: "Completed", completedAt });
}

/** Keeps a reminder the same distance before the due time when a task recurs. */
function shiftReminder(task: Task, nextDueDate: string): string | null {
  if (!task.reminderAt || !task.dueDate) return null;
  const oldDue = parseISO(`${task.dueDate}T${task.dueTime ?? "09:00"}`);
  const minutesBefore = differenceInMinutes(oldDue, parseISO(task.reminderAt));
  const newDue = parseISO(`${nextDueDate}T${task.dueTime ?? "09:00"}`);
  return subMinutes(newDue, minutesBefore).toISOString();
}

/** The currently selected task, if any. */
export function useSelectedTask(): Task | null {
  return useTaskStore(
    useShallow((state) =>
      state.tasks.find((task) => task.id === state.selectedTaskId) ?? null,
    ),
  );
}

import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type { Task } from "@/types";
import { selectFilteredTasks, useTaskStore } from "@/store/useTaskStore";
import { useCompletionStore } from "@/store/useCompletionStore";
import { isRuleExpired, nextDueDateAfterCompletion } from "@/lib/recurrence";
import { reminderForNextOccurrence } from "@/lib/reminder";

/** Tasks after search, filters and sort — the list every view renders from. */
export function useFilteredTasks(): Task[] {
  return useTaskStore(useShallow(selectFilteredTasks));
}

/**
 * Toggles a task's completion for **today**.
 *
 * Every completion writes a row to the per-day log keyed on the local date it
 * happened, so a recurring task's days are independent: miss Monday, complete
 * on Tuesday, and Monday stays empty rather than being retroactively satisfied.
 * Completing a recurring task also rolls the same record forward to its next due
 * date (see src/lib/recurrence.ts); an expired rule is cleared and the task stays
 * completed. The pre-roll due date and reminder are snapshotted on the log row so
 * un-checking restores them exactly instead of guessing.
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
  const completions = useCompletionStore.getState();
  const today = format(new Date(), "yyyy-MM-dd");

  // Un-checking something completed today. A recurring task is "checked" only
  // because today's log row exists — its status went back to 'Not Started' the
  // moment it rolled forward — so the log is what has to be consulted first.
  if (completions.todayDone.has(task.id)) {
    const undone = await completions.unmarkDone(task.id, today);
    if (task.recurringRule) {
      // ponytail: restores the due date and reminder from the row's snapshot.
      // A rule that *expired* on completion was cleared and is not snapshotted —
      // that undo stays lossy. Snapshot recurringRule too if it ever bites.
      await store.updateTask(task.id, {
        dueDate: undone?.prevDueDate ?? null,
        reminder: undone?.prevReminder ?? null,
      });
    } else {
      await store.updateTask(task.id, { status: "Not Started", completedAt: null });
    }
    return;
  }

  // Un-checking a one-off completed on an earlier day (or before the log existed).
  if (task.status === "Completed") {
    await store.updateTask(task.id, { status: "Not Started", completedAt: null });
    if (task.completedAt) {
      await completions.unmarkDone(task.id, format(parseISO(task.completedAt), "yyyy-MM-dd"));
    }
    return;
  }

  const completedAt = new Date().toISOString();

  if (task.recurringRule) {
    const nextDueDate = nextDueDateAfterCompletion(task.recurringRule, task.dueDate, today);
    // Log before rolling forward — task.dueDate/task.reminder are the snapshot.
    await completions.markDone({
      taskId: task.id,
      taskTitle: task.title,
      occurrenceDate: today,
      completedAt,
      ...(task.dueDate !== undefined ? { prevDueDate: task.dueDate } : {}),
      ...(task.reminder !== undefined ? { prevReminder: task.reminder } : {}),
    });

    if (isRuleExpired(task.recurringRule, nextDueDate)) {
      await store.updateTask(task.id, { status: "Completed", completedAt, recurringRule: null });
      return;
    }
    await store.updateTask(task.id, {
      status: "Not Started",
      dueDate: nextDueDate,
      completedAt: null,
      reminder: reminderForNextOccurrence(task.reminder, nextDueDate, task.dueTime),
    });
    return;
  }

  await store.updateTask(task.id, { status: "Completed", completedAt });
  await completions.markDone({
    taskId: task.id,
    taskTitle: task.title,
    occurrenceDate: today,
    completedAt,
  });
}

/** The currently selected task, if any. */
export function useSelectedTask(): Task | null {
  return useTaskStore(
    useShallow((state) =>
      state.tasks.find((task) => task.id === state.selectedTaskId) ?? null,
    ),
  );
}

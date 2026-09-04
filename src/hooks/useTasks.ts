import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type { Task } from "@/types";
import { selectFilteredTasks, useTaskStore } from "@/store/useTaskStore";
import { useCompletionStore } from "@/store/useCompletionStore";
import { catchUpDueDate, isRuleExpired, nextDueDateAfterCompletion } from "@/lib/recurrence";
import { dueDatePatch, reminderForNextOccurrence } from "@/lib/reminder";

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
    // A repeat with no due date is an ongoing habit with no schedule anchor, and
    // completing it must not quietly give it one: rolling forward here would
    // stamp on tomorrow's date and turn the habit into a scheduled task from its
    // very first completion. The log row is the whole record for these.
    if (task.dueDate === undefined) {
      await store.updateTask(task.id, { status: "Not Started", completedAt: null });
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

/**
 * Catches missed recurring tasks up to today: a daily habit last done on the
 * 30th should be due today on the 3rd, not still showing the 30th. Runs at
 * startup and on midnight rollover (the app stays open for days).
 *
 * Only the due date moves — the missed days keep their record as the *absence*
 * of completion-log rows, which is what the history strip and heatmap read
 * (ADR-0003, which deferred exactly this). Tasks whose rule has run past its
 * endDate are left alone: that habit is over, not late.
 */
export async function rollForwardMissedRecurring(): Promise<void> {
  const store = useTaskStore.getState();
  const today = format(new Date(), "yyyy-MM-dd");

  // Iterating the snapshot taken here is deliberate: updateTask replaces the
  // array on every write, and each task is only ever visited once.
  try {
    for (const task of store.tasks) {
      if (!task.recurringRule || !task.dueDate || task.dueDate >= today) continue;
      if (task.status === "Completed" || task.status === "Cancelled") continue;

      const next = catchUpDueDate(task.recurringRule, task.dueDate, today);
      if (next === task.dueDate || isRuleExpired(task.recurringRule, next)) continue;

      // dueDatePatch, not a bare { dueDate }: a relative reminder has to re-anchor
      // or it keeps firing against the stale date.
      await store.updateTask(task.id, dueDatePatch(task, next));
    }
  } catch {
    toast.error("Failed to reschedule recurring tasks.");
  }
}

/** The currently selected task, if any. */
export function useSelectedTask(): Task | null {
  return useTaskStore(
    useShallow((state) =>
      state.tasks.find((task) => task.id === state.selectedTaskId) ?? null,
    ),
  );
}

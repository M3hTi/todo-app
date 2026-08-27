import { create } from "zustand";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import type { Completion } from "@/types";
import {
  deleteCompletion,
  getCompletion,
  getCompletionsInRange,
  getTaskIdsCompletedOn,
  logCompletion,
  type NewCompletion,
} from "@/lib/queries/completions";

/** Weeks the heatmap renders, and therefore how far back the store loads. */
export const HEATMAP_WEEKS = 53;

interface CompletionStoreState {
  /** occurrence_date → number completed that day, for the heatmap. */
  completionsByDate: Record<string, number>;
  /** Task ids completed on `dayKey` — what the checkbox reads. */
  todayDone: Set<string>;
  /**
   * The local date the loaded state describes. The app is built to run for days
   * (close-to-tray + autostart), so "today" cannot be resolved once at boot —
   * the reminder loop compares against this and reloads when it changes.
   */
  dayKey: string;

  load: () => Promise<void>;
  markDone: (input: NewCompletion) => Promise<void>;
  /** Deletes the day's row and returns it, so the caller can restore its snapshot. */
  unmarkDone: (taskId: string, occurrenceDate: string) => Promise<Completion | null>;
}

export const useCompletionStore = create<CompletionStoreState>((set) => ({
  completionsByDate: {},
  todayDone: new Set(),
  dayKey: format(new Date(), "yyyy-MM-dd"),

  load: async () => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const from = format(subDays(now, HEATMAP_WEEKS * 7), "yyyy-MM-dd");
    try {
      const [counts, todayIds] = await Promise.all([
        getCompletionsInRange(from, today),
        getTaskIdsCompletedOn(today),
      ]);
      set({
        completionsByDate: Object.fromEntries(counts.map((row) => [row.date, row.count])),
        todayDone: new Set(todayIds),
        dayKey: today,
      });
    } catch {
      // Activity history is additive — a read failure must not block startup or
      // a completion. Report it and carry on with an empty grid.
      toast.error("Failed to load activity history.");
    }
  },

  markDone: async (input) => {
    await logCompletion(input);
    set((state) => ({
      completionsByDate: {
        ...state.completionsByDate,
        [input.occurrenceDate]: (state.completionsByDate[input.occurrenceDate] ?? 0) + 1,
      },
      todayDone:
        input.occurrenceDate === state.dayKey
          ? new Set(state.todayDone).add(input.taskId)
          : state.todayDone,
    }));
  },

  unmarkDone: async (taskId, occurrenceDate) => {
    const existing = await getCompletion(taskId, occurrenceDate);
    if (!existing) return null;
    await deleteCompletion(taskId, occurrenceDate);
    set((state) => {
      const remaining = (state.completionsByDate[occurrenceDate] ?? 1) - 1;
      const byDate = { ...state.completionsByDate };
      if (remaining > 0) byDate[occurrenceDate] = remaining;
      else delete byDate[occurrenceDate];

      const todayDone = new Set(state.todayDone);
      if (occurrenceDate === state.dayKey) todayDone.delete(taskId);
      return { completionsByDate: byDate, todayDone };
    });
    return existing;
  },
}));

/** True when the task counts as done for the current day. */
export const selectIsDoneToday = (taskId: string) => (state: CompletionStoreState): boolean =>
  state.todayDone.has(taskId);

/** Current dayKey — re-renders consumers on midnight rollover. */
export const selectDayKey = (state: CompletionStoreState): string => state.dayKey;

/** Re-reads today's state if the local date has moved on. Returns true if it did. */
export async function refreshIfDayChanged(): Promise<boolean> {
  const today = format(new Date(), "yyyy-MM-dd");
  if (today === useCompletionStore.getState().dayKey) return false;
  await useCompletionStore.getState().load();
  return true;
}

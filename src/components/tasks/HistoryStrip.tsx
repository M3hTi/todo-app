// Recent history for a recurring task. Answers the question the checkbox
// cannot: which days did this actually get done, which were genuinely missed
// versus never scheduled in the first place — and, underneath, how the habit is
// going overall (streak, adherence). Both come from one read of the completion
// log; the numbers are the strip's own grading, counted.
//
// It is also a *write* surface: a past day can be corrected in place (ADR-0005).
// That write touches the completion log and nothing else — no status, no due
// date, no reminder, no roll-forward. Today is not editable here; the checkbox
// owns today, side effects included.
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import type { Task } from "@/types";
import {
  buildDayStrip,
  habitStats,
  retroActionFor,
  HABIT_WINDOW_DAYS,
  type DayCell,
  type DayState,
  type HabitStats,
  type RetroAction,
} from "@/lib/completions";
import { getCompletionDatesForTask } from "@/lib/queries/completions";
import { useCompletionStore } from "@/store/useCompletionStore";

const STATE_STYLE: Record<DayState, string> = {
  done: "bg-[var(--heat-4)]",
  // Real work on a day the rule didn't ask for — shown, but not as a hit.
  "done-off-schedule": "bg-[var(--heat-2)]",
  missed: "bg-[var(--urgent-bg)] border border-[var(--urgent-text)]/35",
  pending: "bg-[var(--heat-0)]",
  "not-scheduled": "border border-[var(--hairline)]",
};

const STATE_TEXT: Record<DayState, string> = {
  done: "completed",
  "done-off-schedule": "completed (not a scheduled day)",
  missed: "missed",
  pending: "scheduled",
  "not-scheduled": "not scheduled",
};

interface StripData {
  cells: DayCell[];
  stats: HabitStats | null;
}

/** "🔥 5-day streak · 12 of 14 scheduled days · 86%", minus whatever doesn't apply. */
function statsLine(stats: HabitStats): string {
  const parts: string[] = [];
  if (stats.streak > 0) parts.push(`🔥 ${stats.streak}-day streak`);
  if (stats.scheduled > 0) {
    parts.push(`${stats.done} of ${stats.scheduled} scheduled days`);
    if (stats.adherence !== null) parts.push(`${Math.round(stats.adherence * 100)}%`);
  }
  return parts.join(" · ");
}

export function HistoryStrip({ task }: { task: Task }) {
  const dayKey = useCompletionStore((state) => state.dayKey);
  // Not `todayDone`: that does not move when a *past* day is corrected. Every
  // add and clear hands out a fresh Map here, and so does the store's load.
  const completionsByTask = useCompletionStore((state) => state.completionsByTask);
  const markDone = useCompletionStore((state) => state.markDone);
  const unmarkDone = useCompletionStore((state) => state.unmarkDone);
  const [data, setData] = useState<StripData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const dates = await getCompletionDatesForTask(task.id, "1970-01-01");
        if (cancelled) return;
        const completed = new Set(dates);
        // Set together, so the squares and the numbers can never describe
        // different loads.
        setData({
          cells: buildDayStrip(
            task.recurringRule,
            task.dueDate,
            task.createdAt,
            completed,
            HABIT_WINDOW_DAYS,
            dayKey,
          ),
          stats: habitStats(
            task.recurringRule,
            task.dueDate,
            task.createdAt,
            completed,
            dayKey,
          ),
        });
      } catch {
        // History is additive — a read failure hides the strip, it doesn't
        // interrupt working with the task.
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // completionsByTask re-runs this after a toggle or an in-strip correction,
    // so the squares and the numbers always describe one load.
  }, [task.id, task.recurringRule, task.dueDate, task.createdAt, dayKey, completionsByTask]);

  // The whole of ADR-0005: write the log, touch nothing else.
  const correctDay = async (cell: DayCell, action: Exclude<RetroAction, null>): Promise<void> => {
    try {
      if (action === "add") {
        // No prevDueDate/prevReminder — nothing is being rolled forward.
        await markDone({
          taskId: task.id,
          taskTitle: task.title,
          occurrenceDate: cell.date,
          completedAt: new Date().toISOString(),
        });
      } else {
        // ponytail: the row's roll-forward snapshot is deliberately ignored —
        // the anchor has moved on since, and re-anchoring it now would corrupt
        // the live schedule to fix a historical record (ADR-0005).
        await unmarkDone(task.id, cell.date);
      }
    } catch {
      toast.error("Failed to update history. Please try again.");
    }
  };

  if (!data) return null;

  const line = data.stats ? statsLine(data.stats) : "";
  const editable = data.cells.some((cell) => retroActionFor(cell, dayKey) !== null);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold tracking-[.04em] text-[var(--text-4)]">
          LAST {HABIT_WINDOW_DAYS} DAYS
        </p>
        {editable && <p className="text-[11px] text-[var(--text-4)]">click a day to fix it</p>}
      </div>
      <div
        className="flex items-center gap-[3px]"
        role="group"
        aria-label={`Completion history, last ${HABIT_WINDOW_DAYS} days`}
      >
        {data.cells.map((cell) => {
          const day = format(parseISO(cell.date), "EEE MMM d");
          const state = `${day} — ${STATE_TEXT[cell.state]}`;
          const action = retroActionFor(cell, dayKey);
          const label =
            action === "add" ? `Mark ${day} as done` : action === "clear" ? `Clear ${day}` : state;
          // One box height for every cell — a button with a real hit area next
          // to a bare 18px div makes the row jag.
          const square = (
            <span className={`block h-[18px] w-full rounded-[3px] ${STATE_STYLE[cell.state]}`} />
          );
          return action ? (
            <button
              key={cell.date}
              type="button"
              title={`${state} · ${label}`}
              aria-label={label}
              onClick={() => void correctDay(cell, action)}
              className="h-[30px] flex-1 rounded-[4px] py-1.5 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-text)]"
            >
              {square}
            </button>
          ) : (
            <div
              key={cell.date}
              title={state}
              aria-label={state}
              className="h-[30px] flex-1 py-1.5"
            >
              {square}
            </div>
          );
        })}
      </div>
      {line && <p className="mt-2 text-[11.5px] text-[var(--text-3)]">{line}</p>}
    </div>
  );
}

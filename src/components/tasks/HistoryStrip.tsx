// Last-14-days history for a recurring task. Answers the question the checkbox
// cannot: which days did this actually get done, and which were genuinely missed
// versus never scheduled in the first place.
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import type { Task } from "@/types";
import { buildDayStrip, type DayCell, type DayState } from "@/lib/completions";
import { getCompletionDatesForTask } from "@/lib/queries/completions";
import { useCompletionStore } from "@/store/useCompletionStore";

const DAYS = 14;

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

export function HistoryStrip({ task }: { task: Task }) {
  const dayKey = useCompletionStore((state) => state.dayKey);
  const todayDone = useCompletionStore((state) => state.todayDone);
  const [cells, setCells] = useState<DayCell[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const dates = await getCompletionDatesForTask(task.id, "1970-01-01");
        if (cancelled) return;
        setCells(
          buildDayStrip(
            task.recurringRule,
            task.dueDate,
            task.createdAt,
            new Set(dates),
            DAYS,
            dayKey,
          ),
        );
      } catch {
        // History is additive — a read failure hides the strip, it doesn't
        // interrupt working with the task.
        if (!cancelled) setCells(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // todayDone re-runs this after a toggle, so the strip tracks the checkbox.
  }, [task.id, task.recurringRule, task.dueDate, task.createdAt, dayKey, todayDone]);

  if (!cells) return null;

  const doneCount = cells.filter(
    (cell) => cell.state === "done" || cell.state === "done-off-schedule",
  ).length;
  const missedCount = cells.filter((cell) => cell.state === "missed").length;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[13px] font-semibold tracking-[.04em] text-[var(--text-4)]">
          LAST {DAYS} DAYS
        </p>
        <span className="text-[11.5px] text-[var(--text-3)]">
          {doneCount} done{missedCount > 0 ? ` · ${missedCount} missed` : ""}
        </span>
      </div>
      <div className="flex gap-[3px]" role="list" aria-label={`Completion history, last ${DAYS} days`}>
        {cells.map((cell) => {
          const label = `${format(parseISO(cell.date), "EEE MMM d")} — ${STATE_TEXT[cell.state]}`;
          return (
            <div
              key={cell.date}
              role="listitem"
              title={label}
              aria-label={label}
              className={`h-[18px] flex-1 rounded-[3px] ${STATE_STYLE[cell.state]}`}
            />
          );
        })}
      </div>
    </div>
  );
}

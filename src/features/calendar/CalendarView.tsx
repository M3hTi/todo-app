import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useCompletionStore } from "@/store/useCompletionStore";
import { occurrencesFor, type Occurrence } from "@/lib/completions";
import { getTaskCompletionsInRange } from "@/lib/queries/completions";
import { isTaskOverdue } from "@/components/tasks/TaskCard";
import { NewTaskButton } from "@/components/shared/NewTaskButton";
import { categoryDotColor, PRIORITY_PILL_CLASSES } from "@/lib/taskVisuals";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const MAX_CHIPS = 2;

const CHIP_STATE_CLASSES: Record<Occurrence["state"], string> = {
  done: "bg-[var(--cal-event-bg)] text-[var(--cal-event-text)] line-through opacity-60",
  missed: "bg-[var(--urgent-bg)] text-[var(--urgent-text)]",
  pending: "bg-[var(--cal-event-bg)] text-[var(--cal-event-text)]",
};

const CHIP_STATE_TEXT: Record<Occurrence["state"], string> = {
  done: "completed",
  missed: "missed",
  pending: "scheduled",
};

export function CalendarView() {
  const tasks = useTaskStore((state) => state.tasks);
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);
  const categories = useCategoryStore((state) => state.categories);
  const completionsByDate = useCompletionStore((state) => state.completionsByDate);
  const todayKey = useCompletionStore((state) => state.dayKey);
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const openTask = (id: string): void => {
    setSelectedTask(id);
    navigate("/all");
  };

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month],
  );
  const dayKeys = useMemo(() => days.map((day) => format(day, "yyyy-MM-dd")), [days]);
  const first = dayKeys[0] as string;
  const last = dayKeys[dayKeys.length - 1] as string;

  // Which task was completed on which visible day. A recurring task keeps no
  // per-day state on the record — it rolls forward — so the completion log is
  // the only thing that can tell a done day from a missed one.
  const [completedByTask, setCompletedByTask] = useState(() => new Map<string, Set<string>>());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getTaskCompletionsInRange(first, last);
        if (cancelled) return;
        const map = new Map<string, Set<string>>();
        for (const row of rows) {
          const dates = map.get(row.taskId) ?? new Set<string>();
          dates.add(row.date);
          map.set(row.taskId, dates);
        }
        setCompletedByTask(map);
      } catch {
        // History is additive: a read failure leaves the grid showing the
        // schedule only, it does not blank the calendar.
        if (!cancelled) setCompletedByTask(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
    // completionsByDate changes on every check and uncheck — that is the refresh.
  }, [first, last, completionsByDate]);

  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, Array<{ task: Task; state: Occurrence["state"] }>>();
    for (const task of tasks) {
      const done = completedByTask.get(task.id) ?? new Set<string>();
      for (const occurrence of occurrencesFor(task, dayKeys, done, todayKey)) {
        const list = map.get(occurrence.date) ?? [];
        list.push({ task, state: occurrence.state });
        map.set(occurrence.date, list);
      }
    }
    return map;
  }, [tasks, dayKeys, completedByTask, todayKey]);

  const scheduledThisMonth = dayKeys
    .filter((key) => isSameMonth(parseISO(key), month))
    .reduce((total, key) => total + (occurrencesByDate.get(key)?.length ?? 0), 0);

  const upcoming = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.dueDate &&
            task.status !== "Completed" &&
            task.status !== "Cancelled",
        )
        .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string)),
    [tasks],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 px-8 pb-5 pt-[26px]">
        <div>
          <h1 className="text-[23px] font-bold tracking-[-.01em] text-[var(--text-1)]">
            {format(month, "MMMM yyyy")}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            {scheduledThisMonth} {scheduledThisMonth === 1 ? "task" : "tasks"} scheduled this month
          </p>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((current) => subMonths(current, 1))}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-l-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-3)] hover:bg-[var(--surface-hover-row)]"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="h-[34px] border-y border-[var(--border)] bg-[var(--surface-raised)] px-3.5 text-[13px] font-semibold text-[var(--text-2)] hover:bg-[var(--surface-hover-row)]"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((current) => addMonths(current, 1))}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-r-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-3)] hover:bg-[var(--surface-hover-row)]"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
          <NewTaskButton />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-8 pb-8">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-2">
          <div className="grid grid-cols-7">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "py-2.5 pb-3 text-center text-[11px] font-semibold tracking-[.06em]",
                  index === 0 || index === 6 ? "text-[var(--cal-weekday-weekend-text)]" : "text-[var(--text-4)]",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayTasks = occurrencesByDate.get(dayKey) ?? [];
              const inMonth = isSameMonth(day, month);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const today = isToday(day);

              return (
                <div
                  key={dayKey}
                  className={cn(
                    "flex min-h-0 flex-col gap-1 overflow-hidden rounded-[10px] p-2 pb-1.5",
                    inMonth ? (weekend ? "bg-[var(--cal-weekend-bg)]" : "bg-[var(--surface-raised)]") : "bg-[var(--cal-other-month-bg)]",
                    today && "shadow-[inset_0_0_0_1.5px_var(--accent-text)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[13px]",
                      today
                        ? "bg-[var(--accent)] font-bold text-white"
                        : inMonth
                          ? "font-medium text-[var(--text-2)]"
                          : "font-medium text-[var(--cal-other-month-text)]",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, MAX_CHIPS).map(({ task, state }) => {
                      const category = categories.find((c) => c.id === task.categoryId);
                      const label = `${task.title} — ${CHIP_STATE_TEXT[state]}`;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => openTask(task.id)}
                          title={label}
                          aria-label={label}
                          className={cn(
                            "flex items-center gap-1.5 truncate rounded-[6px] px-1.5 py-1 text-left text-[11px] font-medium",
                            CHIP_STATE_CLASSES[state],
                          )}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: category
                                ? categoryDotColor(category.color)
                                : "currentColor",
                            }}
                          />
                          <span className="truncate">{task.title}</span>
                        </button>
                      );
                    })}
                    {dayTasks.length > MAX_CHIPS && (
                      <p className="px-1.5 text-[10px] text-[var(--text-4)]">
                        +{dayTasks.length - MAX_CHIPS} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 w-[300px] shrink-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
          <span className="mb-1 text-[15px] font-semibold text-[var(--text-1)]">Upcoming</span>
          <p className="mb-4 text-[12.5px] text-[var(--text-4b)]">Tasks with a due date</p>

          {upcoming.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-2 py-4.5 text-center">
              <div className="mb-3.5 flex h-[54px] w-[54px] items-center justify-center rounded-2xl bg-[var(--accent-tint)]">
                <MapPin className="h-[26px] w-[26px] text-[var(--accent-text)]" strokeWidth={2} />
              </div>
              <div className="mb-1.5 text-sm font-semibold text-[var(--text-1)]">
                Nothing else on the calendar
              </div>
              <p className="max-w-[220px] text-[12.5px] leading-[1.5] text-[var(--text-4b)]">
                Add a due date to any task and it'll land here so you can plan ahead.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden">
              {upcoming.map((task) => {
                const category = categories.find((c) => c.id === task.categoryId);
                const overdue = isTaskOverdue(task);
                const dueDate = parseISO(task.dueDate as string);
                const dateLabel = overdue
                  ? `Overdue · ${format(dueDate, "MMM d")}`
                  : isToday(dueDate)
                    ? "Today"
                    : format(dueDate, "MMM d");

                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="flex gap-[11px] rounded-[11px] border border-[var(--hairline)] p-[13px] text-left hover:bg-[var(--surface-hover-row)]"
                  >
                    <span
                      className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: category ? categoryDotColor(category.color) : "var(--text-4)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold leading-[1.35] text-[var(--text-1)]">
                        {task.title}
                      </div>
                      <div className="mt-[7px] flex items-center gap-2 text-[11.5px]">
                        <span
                          className={cn(
                            "font-medium",
                            overdue ? "text-[var(--warning-text)]" : "text-[var(--text-3)]",
                          )}
                        >
                          {dateLabel}
                        </span>
                        <span
                          className={cn(
                            "rounded-[20px] px-[7px] py-0.5 text-[10px] font-semibold",
                            PRIORITY_PILL_CLASSES[task.priority],
                          )}
                        >
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

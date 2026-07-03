import { useMemo, useState } from "react";
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
import { isTaskOverdue } from "@/components/tasks/TaskCard";
import { NewTaskButton } from "@/components/shared/NewTaskButton";
import { PRIORITY_PILL_CLASSES } from "@/lib/taskVisuals";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const MAX_CHIPS = 2;

export function CalendarView() {
  const tasks = useTaskStore((state) => state.tasks);
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);
  const categories = useCategoryStore((state) => state.categories);
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const openTask = (id: string): void => {
    setSelectedTask(id);
    navigate("/all");
  };

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate) ?? [];
      list.push(task);
      map.set(task.dueDate, list);
    }
    return map;
  }, [tasks]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month],
  );

  const scheduledThisMonth = tasks.filter(
    (task) => task.dueDate && isSameMonth(parseISO(task.dueDate), month),
  ).length;

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
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 px-8 pb-5 pt-[26px]">
        <div>
          <h1 className="text-[23px] font-bold tracking-[-.01em] text-[#1c1b22]">
            {format(month, "MMMM yyyy")}
          </h1>
          <p className="mt-1 text-sm text-[#6c6c78]">
            {scheduledThisMonth} {scheduledThisMonth === 1 ? "task" : "tasks"} scheduled this month
          </p>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((current) => subMonths(current, 1))}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-l-lg border border-[#ececf1] bg-white text-[#6c6c78] hover:bg-[#fafafb]"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => setMonth(startOfMonth(new Date()))}
              className="h-[34px] border-y border-[#ececf1] bg-white px-3.5 text-[13px] font-semibold text-[#3f3f4a] hover:bg-[#fafafb]"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((current) => addMonths(current, 1))}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-r-lg border border-[#ececf1] bg-white text-[#6c6c78] hover:bg-[#fafafb]"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
          <NewTaskButton />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 px-8 pb-8">
        <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[#ececf1] bg-white p-2">
          <div className="grid grid-cols-7">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                className={cn(
                  "py-2.5 pb-3 text-center text-[11px] font-semibold tracking-[.06em]",
                  index === 0 || index === 6 ? "text-[#c2c2cc]" : "text-[#9a9aa6]",
                )}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-1">
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDate.get(dayKey) ?? [];
              const inMonth = isSameMonth(day, month);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const today = isToday(day);

              return (
                <div
                  key={dayKey}
                  className={cn(
                    "flex min-h-0 flex-col gap-1 overflow-hidden rounded-[10px] p-2 pb-1.5",
                    inMonth ? (weekend ? "bg-[#fafafb]" : "bg-white") : "bg-[#fbfbfc]",
                    today && "shadow-[inset_0_0_0_1.5px_#4f46e5]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[13px]",
                      today
                        ? "bg-[#4f46e5] font-bold text-white"
                        : inMonth
                          ? "font-medium text-[#3f3f4a]"
                          : "font-medium text-[#c8c8d2]",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, MAX_CHIPS).map((task) => {
                      const category = categories.find((c) => c.id === task.categoryId);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => openTask(task.id)}
                          className={cn(
                            "flex items-center gap-1.5 truncate rounded-[6px] bg-[#f1ecfc] px-1.5 py-1 text-left text-[11px] font-medium text-[#5b3aa8]",
                            task.status === "Completed" && "line-through opacity-60",
                          )}
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: category?.color ?? "#5b3aa8" }}
                          />
                          <span className="truncate">{task.title}</span>
                        </button>
                      );
                    })}
                    {dayTasks.length > MAX_CHIPS && (
                      <p className="px-1.5 text-[10px] text-[#9a9aa6]">
                        +{dayTasks.length - MAX_CHIPS} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex w-[300px] shrink-0 flex-col rounded-2xl border border-[#ececf1] bg-white p-5">
          <span className="mb-1 text-[15px] font-semibold text-[#1c1b22]">Upcoming</span>
          <p className="mb-4 text-[12.5px] text-[#8a8a96]">Tasks with a due date</p>

          {upcoming.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-2 py-4.5 text-center">
              <div className="mb-3.5 flex h-[54px] w-[54px] items-center justify-center rounded-2xl bg-[#eef0fe]">
                <MapPin className="h-[26px] w-[26px] text-[#4f46e5]" strokeWidth={2} />
              </div>
              <div className="mb-1.5 text-sm font-semibold text-[#1c1b22]">
                Nothing else on the calendar
              </div>
              <p className="max-w-[220px] text-[12.5px] leading-[1.5] text-[#8a8a96]">
                Add a due date to any task and it'll land here so you can plan ahead.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 overflow-y-auto">
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
                    className="flex gap-[11px] rounded-[11px] border border-[#f0f0f4] p-[13px] text-left hover:bg-[#fafafb]"
                  >
                    <span
                      className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category?.color ?? "#9a9aa6" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold leading-[1.35] text-[#1c1b22]">
                        {task.title}
                      </div>
                      <div className="mt-[7px] flex items-center gap-2 text-[11.5px]">
                        <span
                          className={cn(
                            "font-medium",
                            overdue ? "text-[#ef4444]" : "text-[#6c6c78]",
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

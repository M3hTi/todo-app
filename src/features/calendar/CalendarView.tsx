import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { isTaskOverdue } from "@/components/tasks/TaskCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MAX_PILLS = 2;

export function CalendarView() {
  const tasks = useTaskStore((state) => state.tasks);
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

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
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  const selectedDayTasks = selectedDay
    ? (tasksByDate.get(format(selectedDay, "yyyy-MM-dd")) ?? [])
    : [];

  return (
    <section className="flex h-full" aria-label="Calendar">
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous month"
              onClick={() => setMonth((current) => subMonths(current, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setMonth(startOfMonth(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next month"
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px text-center">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="pb-1 text-xs font-medium text-muted-foreground">
              {label}
            </div>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(dayKey) ?? [];
            const inMonth = isSameMonth(day, month);
            const selected = selectedDay !== null && isSameDay(day, selectedDay);

            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => setSelectedDay(selected ? null : day)}
                aria-label={`${format(day, "MMMM d, yyyy")}, ${dayTasks.length} tasks`}
                className={cn(
                  "flex min-h-20 flex-col items-stretch gap-1 bg-card p-1.5 text-left align-top transition-colors",
                  "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  !inMonth && "bg-muted/40 text-muted-foreground",
                  selected && "bg-accent",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday(day) && "ring-2 ring-primary font-semibold text-primary",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium tabular-nums text-primary">
                      {dayTasks.length}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, MAX_PILLS).map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "truncate rounded px-1 py-px text-[10px] leading-4",
                        isTaskOverdue(task)
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-primary/10 text-primary",
                        task.status === "Completed" && "line-through opacity-60",
                      )}
                    >
                      {task.title}
                    </div>
                  ))}
                  {dayTasks.length > MAX_PILLS && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{dayTasks.length - MAX_PILLS} more
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <aside className="flex w-72 shrink-0 flex-col border-l bg-card" aria-label="Day tasks">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-semibold">{format(selectedDay, "EEEE, MMM d")}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Close day panel"
              onClick={() => setSelectedDay(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {selectedDayTasks.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tasks due this day.</p>
            ) : (
              <ul className="space-y-1 p-2">
                {selectedDayTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTask(task.id)}
                      className={cn(
                        "w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <span
                        className={cn(
                          "block truncate",
                          task.status === "Completed" && "text-muted-foreground line-through",
                          isTaskOverdue(task) && "text-rose-500",
                        )}
                      >
                        {task.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {task.dueTime ?? "All day"} · {task.priority}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </aside>
      )}
    </section>
  );
}

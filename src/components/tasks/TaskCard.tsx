import { CalendarDays, AlertTriangle } from "lucide-react";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import type { Task, TaskPriority } from "@/types";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTaskStore } from "@/store/useTaskStore";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TagBadge } from "@/components/shared/TagBadge";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  High: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Urgent: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  if (task.status === "Completed" || task.status === "Cancelled") return false;
  return isBefore(parseISO(task.dueDate), startOfDay(new Date()));
}

const MAX_VISIBLE_TAGS = 3;

interface TaskCardProps {
  task: Task;
}

export function TaskCard({ task }: TaskCardProps) {
  const selectedTaskId = useTaskStore((state) => state.selectedTaskId);
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);
  const category = useCategoryStore((state) =>
    state.categories.find((candidate) => candidate.id === task.categoryId),
  );

  const completed = task.status === "Completed";
  const overdue = isTaskOverdue(task);
  const subtaskTotal = task.subtasks.length;
  const subtaskDone = task.subtasks.filter((subtask) => subtask.completed).length;
  const hiddenTagCount = task.tags.length - MAX_VISIBLE_TAGS;

  return (
    <div
      role="listitem"
      tabIndex={0}
      onClick={() => setSelectedTask(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelectedTask(task.id);
        }
      }}
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition-colors",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selectedTaskId === task.id && "border-primary ring-1 ring-primary",
      )}
    >
      <Checkbox
        checked={completed}
        onCheckedChange={() => void toggleTaskComplete(task)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Mark ${task.title} ${completed ? "incomplete" : "complete"}`}
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm font-medium",
              completed && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </p>
          <Badge className={cn("shrink-0 px-1.5 py-0 text-[11px]", PRIORITY_STYLES[task.priority])}>
            {task.priority}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.dueDate && (
            <span
              className={cn("flex items-center gap-1", overdue && "font-medium text-rose-500")}
            >
              {overdue ? (
                <AlertTriangle className="h-3 w-3" aria-label="Overdue" />
              ) : (
                <CalendarDays className="h-3 w-3" />
              )}
              {format(parseISO(task.dueDate), "MMM d, yyyy")}
              {task.dueTime && ` · ${task.dueTime}`}
            </span>
          )}
          {category && (
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </span>
          )}
          {task.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <TagBadge key={tag} name={tag} />
          ))}
          {hiddenTagCount > 0 && (
            <span className="text-[11px] text-muted-foreground">+{hiddenTagCount} more</span>
          )}
        </div>

        {subtaskTotal > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {subtaskDone}/{subtaskTotal}
            </span>
            <div
              className="h-1 w-28 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={subtaskTotal}
              aria-valuenow={subtaskDone}
              aria-label="Subtask progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(subtaskDone / subtaskTotal) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

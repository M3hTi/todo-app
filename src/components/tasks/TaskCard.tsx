import { format, isBefore, isToday, parseISO, startOfDay } from "date-fns";
import type { Task } from "@/types";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTaskStore } from "@/store/useTaskStore";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { categoryDotColor, PRIORITY_PILL_CLASSES } from "@/lib/taskVisuals";
import { TaskCheckbox } from "@/components/shared/TaskCheckbox";
import { cn } from "@/lib/utils";

export function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  if (task.status === "Completed" || task.status === "Cancelled") return false;
  return isBefore(parseISO(task.dueDate), startOfDay(new Date()));
}

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
  const dueToday = task.dueDate !== undefined && isToday(parseISO(task.dueDate));
  const subtaskTotal = task.subtasks.length;
  const subtaskDone = task.subtasks.filter((subtask) => subtask.completed).length;
  const progressPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;
  const firstTag = task.tags[0];
  const dueLabel = task.dueDate
    ? dueToday
      ? "Today"
      : format(parseISO(task.dueDate), "MMM d")
    : undefined;

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
        "flex h-[58px] cursor-pointer items-center gap-3.5 rounded-[12px] bg-[var(--surface-raised)] px-[18px]",
        "hover:bg-[var(--surface-hover-row)] focus-visible:outline-none",
        selectedTaskId === task.id
          ? "border border-[var(--accent-text)] shadow-[0_0_0_3px_var(--ring-shadow)]"
          : "border border-[var(--border)]",
      )}
    >
      <TaskCheckbox
        checked={completed}
        onToggle={() => void toggleTaskComplete(task)}
        aria-label={`Mark ${task.title} ${completed ? "incomplete" : "complete"}`}
      />

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          completed
            ? "font-medium text-[var(--text-done)] line-through"
            : "font-semibold text-[var(--text-1)]",
        )}
      >
        {task.title}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        {firstTag && (
          <span className="rounded-[5px] bg-[var(--tag-bg)] px-2 py-0.5 text-[11px] text-[var(--text-3)]">
            {firstTag}
          </span>
        )}

        {subtaskTotal > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1 w-[68px] overflow-hidden rounded-full bg-[var(--track)]">
              <div
                className={cn(
                  "h-full",
                  completed ? "bg-[var(--accent-done-fill)]" : "bg-[var(--accent)]",
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="w-6 text-[11px] text-[var(--text-4)]">
              {subtaskDone}/{subtaskTotal}
            </span>
          </div>
        )}

        {category && (
          <span className="flex w-[62px] items-center gap-[7px] text-xs text-[var(--text-3)]">
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ backgroundColor: categoryDotColor(category.color) }}
            />
            <span className="min-w-0 truncate">{category.name}</span>
          </span>
        )}

        {dueLabel && (
          <span
            className={cn(
              "min-w-[46px] whitespace-nowrap text-xs",
              dueToday && !completed
                ? "font-semibold text-[var(--accent-text)]"
                : "text-[var(--text-3)]",
            )}
          >
            {dueLabel}
          </span>
        )}

        <span
          className={cn(
            "min-w-[42px] shrink-0 whitespace-nowrap rounded-[20px] px-2.5 py-[3px] text-center text-[11px] font-semibold",
            PRIORITY_PILL_CLASSES[task.priority],
          )}
        >
          {task.priority}
        </span>
      </div>
    </div>
  );
}

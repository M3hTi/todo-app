import { format, isBefore, isToday, parseISO, startOfDay } from "date-fns";
import type { Task } from "@/types";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTaskStore } from "@/store/useTaskStore";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { PRIORITY_PILL_CLASSES } from "@/lib/taskVisuals";
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
        "flex h-[58px] cursor-pointer items-center gap-3.5 rounded-[12px] bg-white px-[18px]",
        "hover:bg-[#fafafb] focus-visible:outline-none",
        selectedTaskId === task.id
          ? "border border-[#4f46e5] shadow-[0_0_0_3px_rgba(79,70,229,.1)]"
          : "border border-[#ececf1]",
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
            ? "font-medium text-[#9a9aa6] line-through"
            : "font-semibold text-[#1c1b22]",
        )}
      >
        {task.title}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-4">
        {firstTag && (
          <span className="rounded-[5px] bg-[#f3f3f7] px-2 py-0.5 text-[11px] text-[#6c6c78]">
            {firstTag}
          </span>
        )}

        {subtaskTotal > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-1 w-[68px] overflow-hidden rounded-full bg-[#eeeef2]">
              <div
                className={cn("h-full", completed ? "bg-[#b9b6f0]" : "bg-[#4f46e5]")}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="w-6 text-[11px] text-[#9a9aa6]">
              {subtaskDone}/{subtaskTotal}
            </span>
          </div>
        )}

        {category && (
          <span className="flex w-[62px] items-center gap-[7px] text-xs text-[#6c6c78]">
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <span className="min-w-0 truncate">{category.name}</span>
          </span>
        )}

        {dueLabel && (
          <span
            className={cn(
              "min-w-[46px] whitespace-nowrap text-xs",
              dueToday && !completed ? "font-semibold text-[#4f46e5]" : "text-[#6c6c78]",
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

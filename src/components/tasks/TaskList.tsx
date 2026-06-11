import { useRef } from "react";
import type { LucideIcon } from "lucide-react";
import type { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { useFilteredTasks } from "@/hooks/useTasks";
import { TaskCard } from "@/components/tasks/TaskCard";
import { EmptyState } from "@/components/shared/EmptyState";

interface TaskListProps {
  /** Pre-filtered tasks from a view; defaults to the store's filtered tasks. */
  tasks?: Task[];
  emptyTitle: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
}

export function TaskList({ tasks, emptyTitle, emptyDescription, emptyIcon }: TaskListProps) {
  const filteredTasks = useFilteredTasks();
  const loading = useTaskStore((state) => state.loading);
  const listRef = useRef<HTMLDivElement>(null);
  const visible = tasks ?? filteredTasks;

  if (loading && visible.length === 0) {
    return <TaskListSkeleton />;
  }

  if (visible.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  // ArrowUp/ArrowDown move focus between task cards.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="listitem"]') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      currentIndex === -1
        ? 0
        : event.key === "ArrowDown"
          ? Math.min(currentIndex + 1, items.length - 1)
          : Math.max(currentIndex - 1, 0);
    items[nextIndex]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="list"
      aria-label="Tasks"
      className="space-y-2 p-4"
      onKeyDown={handleKeyDown}
    >
      {visible.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading tasks">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex animate-pulse items-start gap-3 rounded-lg border p-3">
          <div className="mt-0.5 h-4 w-4 rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/5 rounded bg-muted" />
            <div className="h-3 w-3/5 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

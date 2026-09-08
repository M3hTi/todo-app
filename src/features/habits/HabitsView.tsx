// Every recurring task, its recent history and how it is going — on one page.
// The answer to "how are my habits doing" without opening seven tasks.
//
// No data layer of its own: each row is a HistoryStrip, which already fetches
// its task's completion days and renders both the squares and the stats.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Repeat } from "lucide-react";
import { useTaskStore } from "@/store/useTaskStore";
import { HistoryStrip } from "@/components/tasks/HistoryStrip";
import { EmptyState } from "@/components/shared/EmptyState";
import { NewTaskButton } from "@/components/shared/NewTaskButton";

export function HabitsView() {
  const tasks = useTaskStore((state) => state.tasks);
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);
  const navigate = useNavigate();

  const habits = useMemo(
    () =>
      tasks
        .filter((task) => task.recurringRule)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [tasks],
  );

  // Detail lives in the task list's side panel, same as the calendar's chips.
  const openTask = (id: string): void => {
    setSelectedTask(id);
    navigate("/all");
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 px-8 pb-5 pt-[26px]">
        <div>
          <h1 className="text-[23px] font-bold tracking-[-.01em] text-[var(--text-1)]">Habits</h1>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            {habits.length} {habits.length === 1 ? "repeating task" : "repeating tasks"}
          </p>
        </div>
        <NewTaskButton />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-8 pb-8">
        {habits.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No habits yet"
            description="A habit is any task with a repeat rule. Give a task one and its streak shows up here."
          />
        ) : (
          // ponytail: one query per habit — HistoryStrip self-fetches. Batch
          // through getTaskCompletionsInRange if anyone has enough habits to
          // notice.
          <div className="flex flex-col gap-2.5">
            {habits.map((task) => (
              <div
                key={task.id}
                className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-raised)] px-[18px] py-4"
              >
                <button
                  type="button"
                  onClick={() => openTask(task.id)}
                  className="mb-3 block max-w-full truncate text-sm font-semibold text-[var(--text-1)] hover:text-[var(--accent-text)]"
                >
                  {task.title}
                </button>
                <HistoryStrip task={task} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

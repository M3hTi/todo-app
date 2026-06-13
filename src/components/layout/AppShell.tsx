import { Outlet } from "react-router-dom";
import { toast } from "sonner";
import { useTaskStore } from "@/store/useTaskStore";
import { useSelectedTask } from "@/hooks/useTasks";
import { useReminders } from "@/hooks/useReminders";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTray } from "@/hooks/useTray";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { TaskForm } from "@/components/tasks/TaskForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

export function AppShell() {
  const setTaskFormOpen = useTaskStore((state) => state.setTaskFormOpen);
  const confirmDeleteTaskId = useTaskStore((state) => state.confirmDeleteTaskId);
  const setConfirmDeleteTask = useTaskStore((state) => state.setConfirmDeleteTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const confirmDeleteTask = useTaskStore((state) =>
    state.tasks.find((task) => task.id === state.confirmDeleteTaskId),
  );
  const selectedTask = useSelectedTask();

  // Mounted once after startup data is loaded.
  useReminders();
  useKeyboardShortcuts();
  useTray();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onNewTask={() => setTaskFormOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {selectedTask && (
        <aside
          aria-label="Task details"
          className="w-[380px] shrink-0 overflow-hidden border-l bg-card"
        >
          <TaskDetail task={selectedTask} />
        </aside>
      )}

      <TaskForm />

      <ConfirmDialog
        open={confirmDeleteTaskId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteTask(null);
        }}
        title="Delete task"
        description={`Delete "${confirmDeleteTask?.title ?? ""}"? This also removes its subtasks and cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDeleteTaskId) {
            void deleteTask(confirmDeleteTaskId)
              .then(() => toast.success("Task deleted."))
              .catch(() => toast.error("Failed to delete task. Please try again."));
          }
          setConfirmDeleteTask(null);
        }}
      />
    </div>
  );
}

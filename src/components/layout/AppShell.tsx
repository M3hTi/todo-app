import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { toast } from "sonner";
import { useTaskStore } from "@/store/useTaskStore";
import { useReminders } from "@/hooks/useReminders";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTray } from "@/hooks/useTray";
import { useCloseBehavior } from "@/hooks/useCloseBehavior";
import { useWindowTitle } from "@/hooks/useWindowTitle";
import { Sidebar } from "@/components/layout/Sidebar";
import { TaskForm } from "@/components/tasks/TaskForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CloseBehaviorDialog } from "@/components/layout/CloseBehaviorDialog";

export function AppShell() {
  const confirmDeleteTaskId = useTaskStore((state) => state.confirmDeleteTaskId);
  const setConfirmDeleteTask = useTaskStore((state) => state.setConfirmDeleteTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const confirmDeleteTask = useTaskStore((state) =>
    state.tasks.find((task) => task.id === state.confirmDeleteTaskId),
  );

  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const openClosePrompt = useCallback(() => setClosePromptOpen(true), []);

  // Mounted once after startup data is loaded.
  useReminders();
  useKeyboardShortcuts();
  useTray();
  useCloseBehavior(openClosePrompt);
  useWindowTitle();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </div>

      <TaskForm />

      <CloseBehaviorDialog open={closePromptOpen} onOpenChange={setClosePromptOpen} />

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

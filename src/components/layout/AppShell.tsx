import { useCallback, useEffect, useState } from "react";
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
import { CommandPalette } from "@/components/shared/CommandPalette";
import { CloseBehaviorDialog } from "@/components/layout/CloseBehaviorDialog";
import { isEditableTarget } from "@/lib/utils";

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

  // WebView2's own menu ("Reload / Save as / Print") is nonsense in a desktop
  // app, and Radix only replaces it on task rows. Text fields keep it — they
  // have no other copy/paste affordance. Dev keeps Inspect Element.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const handler = (event: MouseEvent): void => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    window.addEventListener("contextmenu", handler);
    return () => window.removeEventListener("contextmenu", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </div>

      <TaskForm />

      <CommandPalette />

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

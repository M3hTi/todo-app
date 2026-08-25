import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTaskStore } from "@/store/useTaskStore";
import { toggleTaskComplete } from "@/hooks/useTasks";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest("[contenteditable]") !== null
  );
}

/**
 * Global shortcuts. Registered once in AppShell:
 *   Ctrl+N new task · Ctrl+F focus search · Ctrl+D complete selected ·
 *   Delete delete selected (confirmed) · Ctrl+1 Today · Ctrl+2 Upcoming ·
 *   Ctrl+, Settings · Escape close modal / deselect
 * Ctrl+K (command palette) is owned by CommandPalette, and Ctrl+Alt+A
 * (system-wide quick-add) by the Rust shell.
 */
export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;

      const store = useTaskStore.getState();
      const selectedTask = store.tasks.find((task) => task.id === store.selectedTaskId);

      if (event.ctrlKey && !event.altKey && !event.shiftKey) {
        switch (event.key.toLowerCase()) {
          case "n":
            event.preventDefault();
            store.setTaskFormOpen(true);
            return;
          case "f":
            event.preventDefault();
            document.getElementById("task-search")?.focus();
            return;
          case "d":
            event.preventDefault();
            if (selectedTask) void toggleTaskComplete(selectedTask);
            return;
          case "1":
            event.preventDefault();
            navigate("/today");
            return;
          case "2":
            event.preventDefault();
            navigate("/upcoming");
            return;
          case ",":
            event.preventDefault();
            navigate("/settings");
            return;
          default:
            return;
        }
      }

      if (event.key === "Delete" && selectedTask) {
        event.preventDefault();
        store.setConfirmDeleteTask(selectedTask.id);
        return;
      }

      if (event.key === "Escape") {
        if (store.taskFormOpen) {
          store.setTaskFormOpen(false);
        } else if (store.confirmDeleteTaskId !== null) {
          store.setConfirmDeleteTask(null);
        } else if (store.selectedTaskId !== null) {
          store.setSelectedTask(null);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}

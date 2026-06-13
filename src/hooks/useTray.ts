import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTaskStore } from "@/store/useTaskStore";
import { pushTrayPayload } from "@/lib/tray";

const DEBOUNCE_MS = 300;

/**
 * Keeps the native tray menu/tooltip in sync with the task store (debounced so
 * bulk updates rebuild the menu once) and routes tray clicks back into the app.
 * Mounted once.
 */
export function useTray(): void {
  useEffect(() => {
    let timer: number | undefined;

    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void pushTrayPayload(useTaskStore.getState().tasks, new Date());
      }, DEBOUNCE_MS);
    };

    schedule(); // initial push once tasks are loaded

    const unsubscribe = useTaskStore.subscribe((state, prev) => {
      if (state.tasks !== prev.tasks) schedule();
    });

    const openTask = listen<string>("tray://open-task", (event) => {
      useTaskStore.getState().setSelectedTask(event.payload);
    });
    const addTask = listen("tray://add-task", () => {
      useTaskStore.getState().setTaskFormOpen(true);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      void openTask.then((unlisten) => unlisten());
      void addTask.then((unlisten) => unlisten());
    };
  }, []);
}

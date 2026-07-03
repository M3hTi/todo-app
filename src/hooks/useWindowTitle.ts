import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCategoryStore } from "@/store/useCategoryStore";

const VIEW_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/all": "All Tasks",
  "/today": "Today",
  "/upcoming": "Upcoming",
  "/calendar": "Calendar",
  "/completed": "Completed",
  "/overdue": "Overdue",
  "/settings": "Settings",
};

/** Reflects the current route in the document and native window titles. */
export function useWindowTitle(): void {
  const location = useLocation();
  const categories = useCategoryStore((state) => state.categories);

  const title = (() => {
    if (location.pathname.startsWith("/category/")) {
      const id = location.pathname.split("/")[2];
      return categories.find((category) => category.id === id)?.name ?? "Category";
    }
    return VIEW_TITLES[location.pathname] ?? "Tasks";
  })();

  useEffect(() => {
    const windowTitle = `${title} — Todo App`;
    document.title = windowTitle;
    getCurrentWindow()
      .setTitle(windowTitle)
      .catch(() => {
        // Outside Tauri (plain browser dev) there is no native window.
      });
  }, [title]);
}

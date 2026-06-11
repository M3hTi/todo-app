import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowDownAZ, ArrowUpAZ, Plus, Search, X } from "lucide-react";
import type { TaskPriority, TaskStatus } from "@/types";
import { useTaskStore, type SortBy } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Completed", "Cancelled"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "sortOrder", label: "Manual" },
  { value: "dueDate", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
  { value: "createdAt", label: "Created" },
];

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

interface TopBarProps {
  onNewTask: () => void;
}

export function TopBar({ onNewTask }: TopBarProps) {
  const location = useLocation();
  const categories = useCategoryStore((state) => state.categories);

  const searchQuery = useTaskStore((state) => state.searchQuery);
  const setSearch = useTaskStore((state) => state.setSearch);
  const filterStatus = useTaskStore((state) => state.filterStatus);
  const filterPriority = useTaskStore((state) => state.filterPriority);
  const filterCategoryId = useTaskStore((state) => state.filterCategoryId);
  const setFilter = useTaskStore((state) => state.setFilter);
  const sortBy = useTaskStore((state) => state.sortBy);
  const sortDir = useTaskStore((state) => state.sortDir);
  const setSort = useTaskStore((state) => state.setSort);

  // Local input state debounced 300ms into the store's searchQuery.
  const [searchInput, setSearchInput] = useState(searchQuery);
  const debounceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(debounceRef.current);
  }, [searchInput, setSearch]);

  const title = (() => {
    if (location.pathname.startsWith("/category/")) {
      const id = location.pathname.split("/")[2];
      return categories.find((category) => category.id === id)?.name ?? "Category";
    }
    return VIEW_TITLES[location.pathname] ?? "Tasks";
  })();

  // Reflect the current view in the document and native window titles.
  useEffect(() => {
    const windowTitle = `${title} — Todo App`;
    document.title = windowTitle;
    getCurrentWindow()
      .setTitle(windowTitle)
      .catch(() => {
        // Outside Tauri (plain browser dev) there is no native window.
      });
  }, [title]);

  const hasActiveFilters =
    filterStatus !== null || filterPriority !== null || filterCategoryId !== null;

  return (
    <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2.5">
      <h2 className="mr-2 min-w-28 text-lg font-semibold">{title}</h2>

      <div className="relative w-64">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="task-search"
          type="search"
          placeholder="Search tasks…"
          className="h-8 pl-8"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>

      <Select
        value={filterStatus ?? "all"}
        onValueChange={(value) =>
          setFilter({ filterStatus: value === "all" ? null : (value as TaskStatus) })
        }
      >
        <SelectTrigger className="h-8 w-32" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any status</SelectItem>
          {STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterPriority ?? "all"}
        onValueChange={(value) =>
          setFilter({ filterPriority: value === "all" ? null : (value as TaskPriority) })
        }
      >
        <SelectTrigger className="h-8 w-32" aria-label="Filter by priority">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any priority</SelectItem>
          {PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {priority}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterCategoryId ?? "all"}
        onValueChange={(value) =>
          setFilter({ filterCategoryId: value === "all" ? null : value })
        }
      >
        <SelectTrigger className="h-8 w-36" aria-label="Filter by category">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any category</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={() =>
            setFilter({ filterStatus: null, filterPriority: null, filterCategoryId: null })
          }
        >
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Select value={sortBy} onValueChange={(value) => setSort(value as SortBy, sortDir)}>
          <SelectTrigger className="h-8 w-28" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={sortDir === "asc" ? "Sort descending" : "Sort ascending"}
          onClick={() => setSort(sortBy, sortDir === "asc" ? "desc" : "asc")}
        >
          {sortDir === "asc" ? (
            <ArrowDownAZ className="h-4 w-4" />
          ) : (
            <ArrowUpAZ className="h-4 w-4" />
          )}
        </Button>
        <Button size="sm" className="h-8" onClick={onNewTask}>
          <Plus className="mr-1 h-4 w-4" />
          New Task
        </Button>
      </div>
    </header>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, Filter, Search } from "lucide-react";
import type { Task } from "@/types";
import { useTaskStore, type SortBy } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useSelectedTask } from "@/hooks/useTasks";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { EmptyState } from "@/components/shared/EmptyState";
import { NewTaskButton } from "@/components/shared/NewTaskButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "dueDate", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
  { value: "createdAt", label: "Created" },
  { value: "sortOrder", label: "Manual" },
];

export interface TaskGroup {
  label?: string;
  tasks: Task[];
}

interface TaskListPageProps {
  title: string;
  subtitle: string;
  groups: TaskGroup[];
  showToolbar?: boolean;
  showSearch?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
}

export function TaskListPage({
  title,
  subtitle,
  groups,
  showToolbar = false,
  showSearch = false,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: TaskListPageProps) {
  const loading = useTaskStore((state) => state.loading);
  const selectedTask = useSelectedTask();
  const contentRef = useRef<HTMLDivElement>(null);

  const visibleIds = new Set(groups.flatMap((group) => group.tasks.map((task) => task.id)));
  const isEmpty = groups.every((group) => group.tasks.length === 0);
  const hasDetail = selectedTask !== null && visibleIds.has(selectedTask.id);

  // ArrowUp/ArrowDown move focus between task rows.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>('[role="listitem"]') ?? [],
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
    <div className="flex min-w-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4 px-8 pb-[18px] pt-[26px]">
          <div>
            <h1 className="text-[23px] font-bold tracking-[-.01em] text-[#1c1b22]">{title}</h1>
            <p className="mt-1 text-sm text-[#6c6c78]">{subtitle}</p>
          </div>
          <NewTaskButton />
        </div>

        {showToolbar && (
          <div className="flex items-center gap-2.5 px-8 pb-4">
            {showSearch && <SearchBox />}
            <div className="ml-auto flex items-center gap-2.5">
              <CategoryFilterButton />
              <SortButton />
            </div>
          </div>
        )}

        <div
          ref={contentRef}
          onKeyDown={handleKeyDown}
          className="min-h-0 flex-1 overflow-auto px-8 pb-8 pt-0.5"
        >
          {loading && isEmpty ? (
            <TaskListSkeleton />
          ) : isEmpty ? (
            <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
          ) : (
            <div className="flex flex-col gap-[22px]">
              {groups.map(
                (group, index) =>
                  group.tasks.length > 0 && (
                    <div key={group.label ?? index} className="flex flex-col gap-2">
                      {group.label && (
                        <div className="px-0.5 pb-0.5 text-[11.5px] font-semibold uppercase tracking-[.07em] text-[#9a9aa6]">
                          {group.label}
                        </div>
                      )}
                      <div role="list" aria-label={group.label ?? title} className="flex flex-col gap-2">
                        {group.tasks.map((task) => (
                          <TaskCard key={task.id} task={task} />
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}
        </div>
      </main>

      {hasDetail && selectedTask && (
        <aside
          aria-label="Task details"
          className="w-[326px] shrink-0 overflow-hidden border-l border-[#ececf1] bg-white"
        >
          <TaskDetail task={selectedTask} />
        </aside>
      )}
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading tasks">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="flex h-[58px] animate-pulse items-center gap-3.5 rounded-[12px] border border-[#ececf1] bg-white px-[18px]"
        >
          <div className="h-5 w-5 rounded-[6px] bg-[#eeeef2]" />
          <div className="h-3.5 w-2/5 rounded bg-[#eeeef2]" />
        </div>
      ))}
    </div>
  );
}

function SearchBox() {
  const searchQuery = useTaskStore((state) => state.searchQuery);
  const setSearch = useTaskStore((state) => state.setSearch);
  const [input, setInput] = useState(searchQuery);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setSearch(input), 300);
    return () => window.clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // The search box only exists on All Tasks; clear the filter when it unmounts
  // (navigating away) so it doesn't silently narrow other views.
  useEffect(() => () => setSearch(""), [setSearch]);

  return (
    <div className="flex h-[38px] w-[280px] items-center gap-[9px] rounded-[9px] border border-[#ececf1] bg-white px-[13px]">
      <Search className="h-[15px] w-[15px] shrink-0 text-[#9a9aa6]" strokeWidth={2} />
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Search tasks…"
        aria-label="Search tasks"
        className="w-full min-w-0 border-none bg-transparent text-[13.5px] text-[#1c1b22] outline-none placeholder:text-[#9a9aa6]"
      />
    </div>
  );
}

const toolbarButtonClass =
  "flex h-[38px] items-center gap-[7px] rounded-[9px] border border-[#ececf1] bg-white px-[13px] text-[13px] font-medium text-[#3f3f4a] hover:bg-[#fafafb]";

function CategoryFilterButton() {
  const categories = useCategoryStore((state) => state.categories);
  const filterCategoryId = useTaskStore((state) => state.filterCategoryId);
  const setFilter = useTaskStore((state) => state.setFilter);
  const current = categories.find((category) => category.id === filterCategoryId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={toolbarButtonClass}>
          <Filter className="h-3.5 w-3.5" strokeWidth={2} />
          {current?.name ?? "All categories"}
          <ChevronDown className="h-3 w-3 text-[#9a9aa6]" strokeWidth={2.2} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1.5" align="end">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setFilter({ filterCategoryId: null })}
            className={cn(
              "rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[#f5f5f8]",
              filterCategoryId === null && "font-semibold text-[#4f46e5]",
            )}
          >
            All categories
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setFilter({ filterCategoryId: category.id })}
              className={cn(
                "flex items-center gap-[7px] rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[#f5f5f8]",
                filterCategoryId === category.id && "font-semibold text-[#4f46e5]",
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortButton() {
  const sortBy = useTaskStore((state) => state.sortBy);
  const sortDir = useTaskStore((state) => state.sortDir);
  const setSort = useTaskStore((state) => state.setSort);
  const current = SORT_OPTIONS.find((option) => option.value === sortBy);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={toolbarButtonClass}>
          {sortDir === "asc" ? (
            <ArrowDownAZ className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <ArrowUpAZ className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {current?.label ?? "Sort"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1.5" align="end">
        <div className="flex flex-col gap-0.5">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setSort(option.value, option.value === sortBy && sortDir === "asc" ? "desc" : "asc")
              }
              className={cn(
                "rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[#f5f5f8]",
                option.value === sortBy && "font-semibold text-[#4f46e5]",
              )}
            >
              {option.label}
              {option.value === sortBy && (sortDir === "asc" ? " ↑" : " ↓")}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

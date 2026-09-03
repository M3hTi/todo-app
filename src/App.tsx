import { Component, useEffect, useState, type ReactNode } from "react";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { Toaster } from "sonner";
import { format, isThisWeek, isToday, isTomorrow, parseISO } from "date-fns";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  ListTodo,
  Search,
  Sun,
} from "lucide-react";
import type { Task } from "@/types";
import { initDb } from "@/lib/db";
import { checkForUpdate } from "@/lib/updater";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTagStore } from "@/store/useTagStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useCompletionStore } from "@/store/useCompletionStore";
import { rollForwardMissedRecurring, useFilteredTasks } from "@/hooks/useTasks";
import { AppShell } from "@/components/layout/AppShell";
import { TaskListPage, type TaskGroup } from "@/components/tasks/TaskListPage";
import { isTaskOverdue } from "@/components/tasks/TaskCard";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { CalendarView } from "@/features/calendar/CalendarView";
import { SettingsView } from "@/features/settings/SettingsView";

const isOpen = (task: Task): boolean =>
  task.status !== "Completed" && task.status !== "Cancelled";

function AllTasksView() {
  const allTasks = useTaskStore((state) => state.tasks);
  const filterCategoryId = useTaskStore((state) => state.filterCategoryId);
  const query = useTaskStore((state) => state.searchQuery.trim());
  const filtered = useFilteredTasks();

  const active = filtered.filter((task) => task.status !== "Completed");
  const done = filtered.filter((task) => task.status === "Completed");
  const groups: TaskGroup[] = [];
  if (active.length) groups.push({ label: `IN PROGRESS · ${active.length}`, tasks: active });
  if (done.length) groups.push({ label: `COMPLETED · ${done.length}`, tasks: done });

  const totalOpen = allTasks.filter((task) => task.status !== "Completed").length;
  const isFiltering = query.length > 0 || filterCategoryId !== null;

  return (
    <TaskListPage
      title="All Tasks"
      subtitle={`${allTasks.length} tasks · ${totalOpen} in progress`}
      groups={groups}
      showToolbar
      showSearch
      emptyIcon={isFiltering ? Search : ListTodo}
      emptyTitle={isFiltering ? "No matching tasks" : "No tasks yet"}
      emptyDescription={
        isFiltering
          ? "Nothing matches your search. Try a different keyword."
          : "Create your first task with the New Task button."
      }
    />
  );
}

function TodayView() {
  const filtered = useFilteredTasks();
  const today = format(new Date(), "yyyy-MM-dd");
  const visible = filtered.filter(
    (task) => task.dueDate === today || isToday(parseISO(task.createdAt)),
  );
  return (
    <TaskListPage
      title="Today"
      subtitle={`${format(new Date(), "EEEE, MMMM d")} · ${visible.length} ${
        visible.length === 1 ? "task" : "tasks"
      }`}
      groups={[{ tasks: visible }]}
      emptyIcon={Sun}
      emptyTitle="Nothing due today"
      emptyDescription="Tasks due today show up here."
    />
  );
}

const UPCOMING_GROUPS = ["Today", "Tomorrow", "This Week", "Later"] as const;
type UpcomingGroup = (typeof UPCOMING_GROUPS)[number];

function UpcomingView() {
  const filtered = useFilteredTasks();
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = filtered.filter(
    (task) => isOpen(task) && task.dueDate !== undefined && task.dueDate > today,
  );

  const byGroup = new Map<UpcomingGroup, Task[]>(UPCOMING_GROUPS.map((group) => [group, []]));
  for (const task of upcoming) {
    const date = parseISO(task.dueDate as string);
    const group: UpcomingGroup = isToday(date)
      ? "Today"
      : isTomorrow(date)
        ? "Tomorrow"
        : isThisWeek(date, { weekStartsOn: 1 })
          ? "This Week"
          : "Later";
    byGroup.get(group)?.push(task);
  }
  const groups: TaskGroup[] = UPCOMING_GROUPS.map((label) => ({
    label,
    tasks: byGroup.get(label) ?? [],
  }));

  return (
    <TaskListPage
      title="Upcoming"
      subtitle={upcoming.length > 0 ? `${upcoming.length} tasks scheduled ahead` : "Nothing scheduled ahead"}
      groups={groups}
      emptyIcon={CalendarClock}
      emptyTitle="Nothing upcoming"
      emptyDescription="Tasks with a future due date show up here, so you can plan ahead."
    />
  );
}

function CompletedView() {
  const allTasks = useTaskStore((state) => state.tasks);
  const filtered = useFilteredTasks();
  const visible = filtered.filter((task) => task.status === "Completed");
  const totalDone = allTasks.filter((task) => task.status === "Completed").length;

  return (
    <TaskListPage
      title="Completed"
      subtitle={`${totalDone} tasks completed`}
      groups={[{ tasks: visible }]}
      showToolbar
      emptyIcon={CheckCircle2}
      emptyTitle="Nothing completed yet"
      emptyDescription="Check off your first task and it will land here."
    />
  );
}

function OverdueView() {
  const filtered = useFilteredTasks();
  const visible = filtered.filter(isTaskOverdue);
  return (
    <TaskListPage
      title="Overdue"
      subtitle={
        visible.length > 0
          ? `${visible.length} ${visible.length === 1 ? "task needs" : "tasks need"} your attention`
          : "You're all caught up"
      }
      groups={[{ tasks: visible }]}
      emptyIcon={AlertCircle}
      emptyTitle="Nothing overdue"
      emptyDescription="You're all caught up. Nice work."
    />
  );
}

function CategoryTasksView() {
  const { id } = useParams<{ id: string }>();
  const category = useCategoryStore((state) => state.categories.find((c) => c.id === id));
  const filtered = useFilteredTasks();
  const visible = filtered.filter((task) => task.categoryId === id);

  return (
    <TaskListPage
      title={category?.name ?? "Category"}
      subtitle={`${visible.length} ${visible.length === 1 ? "task" : "tasks"}`}
      groups={[{ tasks: visible }]}
      emptyIcon={FolderOpen}
      emptyTitle="No tasks in this category"
      emptyDescription="Assign tasks to this category to see them here."
    />
  );
}

const LAST_ROUTE_KEY = "todo-app:last-route";

/** Saves the active route so a relaunch restores where the user left off. */
function RoutePersistence() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname !== "/") {
      localStorage.setItem(LAST_ROUTE_KEY, location.pathname);
    }
  }, [location.pathname]);
  return null;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error occurred while rendering the app. Your data is safe — reloading
            usually fixes this.
          </p>
          <button
            type="button"
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type StartupState = { status: "loading" } | { status: "ready" } | { status: "error" };

function App() {
  const [startup, setStartup] = useState<StartupState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDb();
        await Promise.all([
          useTaskStore.getState().loadTasks(),
          useCategoryStore.getState().loadCategories(),
          useTagStore.getState().loadTags(),
          useSettingsStore.getState().loadSettings(),
          // Reports its own failure and resolves — activity history is additive,
          // so a bad read must not put the app on the startup error screen.
          useCompletionStore.getState().load(),
        ]);
        // Before first paint, so a habit missed while the app was closed shows
        // up under Today rather than as an overdue date from last month.
        await rollForwardMissedRecurring();
        if (!cancelled) {
          setStartup({ status: "ready" });
          void checkForUpdate();
        }
      } catch {
        if (!cancelled) setStartup({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (startup.status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-xl font-semibold text-destructive">Failed to open the database</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The app database could not be initialized. Check that the app data directory is
          writable: <code className="font-mono">%APPDATA%\com.asus.todo-app</code>
        </p>
        <button
          type="button"
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (startup.status === "loading") {
    return <div className="h-screen bg-background" aria-busy="true" />;
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <Toaster richColors position="bottom-right" />
        <RoutePersistence />
        <Routes>
          <Route element={<AppShell />}>
            <Route
              path="/"
              element={
                <Navigate to={localStorage.getItem(LAST_ROUTE_KEY) ?? "/today"} replace />
              }
            />
            <Route path="/dashboard" element={<DashboardView />} />
            <Route path="/all" element={<AllTasksView />} />
            <Route path="/today" element={<TodayView />} />
            <Route path="/upcoming" element={<UpcomingView />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/completed" element={<CompletedView />} />
            <Route path="/overdue" element={<OverdueView />} />
            <Route path="/category/:id" element={<CategoryTasksView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;

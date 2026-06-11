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
  Sun,
} from "lucide-react";
import type { Task } from "@/types";
import { initDb } from "@/lib/db";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTagStore } from "@/store/useTagStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useFilteredTasks } from "@/hooks/useTasks";
import { AppShell } from "@/components/layout/AppShell";
import { TaskList } from "@/components/tasks/TaskList";
import { TaskCard, isTaskOverdue } from "@/components/tasks/TaskCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { CalendarView } from "@/features/calendar/CalendarView";
import { SettingsView } from "@/features/settings/SettingsView";

const isOpen = (task: Task): boolean =>
  task.status !== "Completed" && task.status !== "Cancelled";

function AllTasksView() {
  return (
    <TaskList
      emptyTitle="No tasks yet"
      emptyDescription="Create your first task with the New Task button."
      emptyIcon={ListTodo}
    />
  );
}

function TodayView() {
  const tasks = useFilteredTasks();
  const today = format(new Date(), "yyyy-MM-dd");
  const visible = tasks.filter(
    (task) => task.dueDate === today || isToday(parseISO(task.createdAt)),
  );
  return (
    <TaskList
      tasks={visible}
      emptyTitle="Nothing due today"
      emptyDescription="Tasks due today or created today show up here."
      emptyIcon={Sun}
    />
  );
}

const UPCOMING_GROUPS = ["Today", "Tomorrow", "This Week", "Later"] as const;
type UpcomingGroup = (typeof UPCOMING_GROUPS)[number];

function UpcomingView() {
  const tasks = useFilteredTasks();
  const today = format(new Date(), "yyyy-MM-dd");
  const upcoming = tasks.filter(
    (task) => isOpen(task) && task.dueDate !== undefined && task.dueDate > today,
  );

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing upcoming"
        description="Tasks with a future due date show up here."
      />
    );
  }

  const groups = new Map<UpcomingGroup, Task[]>(UPCOMING_GROUPS.map((group) => [group, []]));
  for (const task of upcoming) {
    const date = parseISO(task.dueDate as string);
    const group: UpcomingGroup = isToday(date)
      ? "Today"
      : isTomorrow(date)
        ? "Tomorrow"
        : isThisWeek(date, { weekStartsOn: 1 })
          ? "This Week"
          : "Later";
    groups.get(group)?.push(task);
  }

  return (
    <div className="space-y-5 p-4">
      {UPCOMING_GROUPS.map((group) => {
        const groupTasks = groups.get(group) ?? [];
        if (groupTasks.length === 0) return null;
        return (
          <section key={group} aria-label={group}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </h3>
            <div role="list" aria-label={`${group} tasks`} className="space-y-2">
              {groupTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CompletedView() {
  const tasks = useFilteredTasks();
  const visible = tasks.filter((task) => task.status === "Completed");
  return (
    <TaskList
      tasks={visible}
      emptyTitle="No completed tasks"
      emptyDescription="Tasks you complete show up here."
      emptyIcon={CheckCircle2}
    />
  );
}

function OverdueView() {
  const tasks = useFilteredTasks();
  const visible = tasks.filter(isTaskOverdue);
  return (
    <TaskList
      tasks={visible}
      emptyTitle="Nothing overdue"
      emptyDescription="You're all caught up."
      emptyIcon={AlertCircle}
    />
  );
}

function CategoryTasksView() {
  const { id } = useParams<{ id: string }>();
  const tasks = useFilteredTasks();
  const visible = tasks.filter((task) => task.categoryId === id);
  return (
    <TaskList
      tasks={visible}
      emptyTitle="No tasks in this category"
      emptyDescription="Assign tasks to this category to see them here."
      emptyIcon={FolderOpen}
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
        ]);
        if (!cancelled) setStartup({ status: "ready" });
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

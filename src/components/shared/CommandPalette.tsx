import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  LayoutDashboard,
  ListTodo,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import { useTaskStore } from "@/store/useTaskStore";

const ROUTES = [
  { path: "/dashboard", label: "Go to Dashboard", icon: LayoutDashboard },
  { path: "/today", label: "Go to Today", icon: Sun },
  { path: "/upcoming", label: "Go to Upcoming", icon: CalendarDays },
  { path: "/all", label: "Go to All Tasks", icon: ListTodo },
  { path: "/overdue", label: "Go to Overdue", icon: AlertCircle },
  { path: "/completed", label: "Go to Completed", icon: CheckCircle2 },
  { path: "/settings", label: "Go to Settings", icon: Settings },
] as const;

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-popover-foreground aria-selected:bg-accent aria-selected:text-accent-foreground";

/**
 * Ctrl+K front door: jump to any task or view without leaving the keyboard.
 * Mounted once in AppShell.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const tasks = useTaskStore((state) => state.tasks);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      // Deliberately fires inside inputs too — Ctrl+K from the search box is
      // the most likely way to reach it.
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((isOpen) => !isOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border bg-popover shadow-lg"
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="outline-none"
    >
      <Command.Input
        placeholder="Search tasks or jump to a view…"
        className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
          No matches.
        </Command.Empty>

        <Command.Group heading="Actions" className="px-1 text-xs text-muted-foreground">
          <Command.Item
            className={itemClass}
            onSelect={() => run(() => useTaskStore.getState().setTaskFormOpen(true))}
          >
            <Plus className="h-4 w-4" /> New task
          </Command.Item>
          {ROUTES.map(({ path, label, icon: Icon }) => (
            <Command.Item
              key={path}
              className={itemClass}
              onSelect={() => run(() => navigate(path))}
            >
              <Icon className="h-4 w-4" /> {label}
            </Command.Item>
          ))}
        </Command.Group>

        {tasks.length > 0 && (
          <Command.Group heading="Tasks" className="px-1 text-xs text-muted-foreground">
            {tasks.map((task) => (
              <Command.Item
                key={task.id}
                // cmdk matches on `value`, so notes and tags are searchable here
                // exactly as they are in the task list's search box.
                value={`${task.title} ${task.tags.join(" ")} ${task.notes ?? ""} ${task.id}`}
                className={itemClass}
                onSelect={() => run(() => useTaskStore.getState().setSelectedTask(task.id))}
              >
                <ListTodo className="h-4 w-4 shrink-0" />
                <span className="truncate">{task.title}</span>
                {task.dueDate && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {task.dueDate}
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

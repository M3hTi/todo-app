import { useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  LayoutDashboard,
  ListTodo,
  Settings,
  Sun,
  Tag as TagIcon,
  X,
} from "lucide-react";
import type { Tag } from "@/types";
import { useTagStore } from "@/store/useTagStore";
import { useTaskStore } from "@/store/useTaskStore";
import { CategoryList } from "@/components/categories/CategoryList";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/all", label: "All Tasks", icon: ListTodo },
  { to: "/today", label: "Today", icon: Sun },
  { to: "/upcoming", label: "Upcoming", icon: CalendarClock },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/completed", label: "Completed", icon: CheckCircle2 },
  { to: "/overdue", label: "Overdue", icon: AlertCircle },
] as const;

export function Sidebar() {
  const tags = useTagStore((state) => state.tags);
  const deleteTag = useTagStore((state) => state.deleteTag);
  const filterTags = useTaskStore((state) => state.filterTags);
  const setFilter = useTaskStore((state) => state.setFilter);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);

  const toggleTagFilter = (name: string): void => {
    setFilter({
      filterTags: filterTags.includes(name)
        ? filterTags.filter((tag) => tag !== name)
        : [...filterTags, name],
    });
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="px-4 py-4">
        <h1 className="text-lg font-bold tracking-tight">Todo App</h1>
      </div>

      <ScrollArea className="flex-1 px-2">
        <nav aria-label="Main navigation">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent font-medium text-accent-foreground",
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <Separator className="my-3" />
        <CategoryList />
        <Separator className="my-3" />

        <div className="pb-3">
          <div className="px-3 py-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tags
            </span>
          </div>
          {tags.length === 0 ? (
            <p className="px-3 py-1 text-xs text-muted-foreground">
              Tags you add to tasks appear here.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5 px-3 py-1">
              {tags.map((tag) => (
                <li key={tag.id} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleTagFilter(tag.name)}
                    className={cn(
                      "flex items-center gap-1 rounded-l-full border py-0.5 pl-2 pr-1 text-xs transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      filterTags.includes(tag.name)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-accent",
                    )}
                    aria-pressed={filterTags.includes(tag.name)}
                  >
                    <TagIcon className="h-3 w-3" />
                    {tag.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete tag ${tag.name}`}
                    onClick={() => setDeletingTag(tag)}
                    className={cn(
                      "rounded-r-full border border-l-0 py-0.5 pr-1.5 pl-0.5 text-xs transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      filterTags.includes(tag.name)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-destructive",
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>

      <Separator />
      <div className="p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-accent font-medium text-accent-foreground",
            )
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
      </div>

      <ConfirmDialog
        open={deletingTag !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTag(null);
        }}
        title="Delete tag"
        description={`Delete tag "${deletingTag?.name ?? ""}"? It will be removed from all tasks.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deletingTag) {
            void deleteTag(deletingTag.id)
              .then(({ reloadFailed }) => {
                if (reloadFailed) {
                  toast("Tag deleted, but the task list couldn't refresh — reload to see changes.");
                } else {
                  toast.success("Tag deleted.");
                }
              })
              .catch(() => toast.error("Failed to delete tag. Please try again."));
          }
        }}
      />
    </aside>
  );
}

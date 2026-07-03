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

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    "flex items-center gap-3 rounded-[8px] px-3 py-[9px] text-sm text-[#3f3f4a] transition-colors",
    "hover:bg-[#f5f5f8]",
    isActive && "bg-[#eef0fe] font-semibold text-[#4f46e5]",
  );

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
    <aside className="flex w-[246px] shrink-0 flex-col border-r border-[#ececf1] bg-white px-4 pb-4 pt-[22px]">
      <div className="px-2 pb-5 text-[20px] font-bold text-[#1c1b22]">Todo App</div>

      <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navLinkClass}>
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <ScrollArea className="-mr-4 mt-1 flex-1 pr-4">
        <CategoryList />

        <div className="mb-2.5 mt-6 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#9a9aa6]">
          Tags
        </div>
        {tags.length === 0 ? (
          <p className="px-2 py-1 text-xs text-[#9a9aa6]">Tags you add to tasks appear here.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 px-2 pb-2">
            {tags.map((tag) => (
              <li key={tag.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => toggleTagFilter(tag.name)}
                  className={cn(
                    "flex items-center gap-1 rounded-l-full border py-0.5 pl-2 pr-1 text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]",
                    filterTags.includes(tag.name)
                      ? "border-[#4f46e5] bg-[#eef0fe] text-[#4f46e5]"
                      : "border-[#ececf1] text-[#3f3f4a] hover:bg-[#f5f5f8]",
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]",
                    filterTags.includes(tag.name)
                      ? "border-[#4f46e5] bg-[#eef0fe] text-[#4f46e5]"
                      : "border-[#ececf1] text-[#9a9aa6] hover:text-[#ef4444]",
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(
            "mt-3 flex items-center gap-3 border-t border-[#ececf1] px-3 pb-0 pt-[14px] text-sm text-[#3f3f4a]",
            isActive && "font-semibold text-[#4f46e5]",
          )
        }
      >
        <Settings className="h-[17px] w-[17px]" strokeWidth={2} />
        Settings
      </NavLink>

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

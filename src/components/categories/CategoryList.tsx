import { useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { useCategoryStore } from "@/store/useCategoryStore";
import { CategoryForm } from "@/components/categories/CategoryForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CategoryList() {
  const categories = useCategoryStore((state) => state.categories);
  const addCategory = useCategoryStore((state) => state.addCategory);
  const updateCategory = useCategoryStore((state) => state.updateCategory);
  const deleteCategory = useCategoryStore((state) => state.deleteCategory);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Categories
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label="New category"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ul className="space-y-0.5">
        {categories.map((category) => (
          <li key={category.id} className="group relative">
            <NavLink
              to={`/category/${category.id}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent font-medium text-accent-foreground",
                )
              }
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="truncate pr-12">{category.name}</span>
            </NavLink>
            <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Rename ${category.name}`}
                onClick={() => setEditing(category)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                aria-label={`Delete ${category.name}`}
                onClick={() => setDeleting(category)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <CategoryForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (name, color) => {
          await addCategory(name, color);
        }}
      />
      <CategoryForm
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        category={editing ?? undefined}
        onSubmit={async (name, color) => {
          if (editing) await updateCategory(editing.id, { name, color });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete category"
        description={`Delete "${deleting?.name ?? ""}"? Tasks in this category will be kept and moved to no category.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            void deleteCategory(deleting.id)
              .then(({ reloadFailed }) => {
                if (reloadFailed) {
                  toast("Category deleted, but the task list couldn't refresh — reload to see changes.");
                } else {
                  toast.success("Category deleted.");
                }
              })
              .catch(() => toast.error("Failed to delete category. Please try again."));
          }
        }}
      />
    </div>
  );
}

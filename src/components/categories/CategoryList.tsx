import { useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { useCategoryStore } from "@/store/useCategoryStore";
import { CategoryForm } from "@/components/categories/CategoryForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
      <div className="mb-2.5 mt-6 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#9a9aa6]">
        Categories
        <button
          type="button"
          aria-label="New category"
          onClick={() => setCreateOpen(true)}
          className="flex h-4 w-4 items-center justify-center text-[#b8b8c2] hover:text-[#4f46e5]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="flex flex-col gap-[9px] px-2">
        {categories.map((category) => (
          <li key={category.id} className="group relative">
            <NavLink
              to={`/category/${category.id}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-[8px] py-1 pl-1 pr-12 text-sm text-[#3f3f4a] transition-colors",
                  "hover:bg-[#f5f5f8]",
                  isActive && "font-semibold text-[#4f46e5]",
                )
              }
            >
              <span
                className="h-[9px] w-[9px] shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span className="truncate">{category.name}</span>
            </NavLink>
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                aria-label={`Rename ${category.name}`}
                onClick={() => setEditing(category)}
                className="flex h-5 w-5 items-center justify-center rounded text-[#9a9aa6] hover:text-[#4f46e5]"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${category.name}`}
                onClick={() => setDeleting(category)}
                className="flex h-5 w-5 items-center justify-center rounded text-[#9a9aa6] hover:text-[#ef4444]"
              >
                <Trash2 className="h-3 w-3" />
              </button>
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

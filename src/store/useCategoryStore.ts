import { create } from "zustand";
import type { Category } from "@/types";
import {
  createCategory,
  deleteCategory,
  getAllCategories,
  updateCategory,
} from "@/lib/queries/categories";
import { useTaskStore } from "@/store/useTaskStore";

interface CategoryStoreState {
  categories: Category[];

  loadCategories: () => Promise<void>;
  addCategory: (name: string, color: string) => Promise<Category>;
  updateCategory: (id: string, patch: Partial<Pick<Category, "name" | "color">>) => Promise<void>;
  /**
   * Deletes the category. Resolves { reloadFailed: true } rather than
   * rejecting if the delete itself succeeds but the subsequent task reload
   * fails — a reload failure must not be misreported as a delete failure.
   */
  deleteCategory: (id: string) => Promise<{ reloadFailed: boolean }>;
}

export const useCategoryStore = create<CategoryStoreState>((set) => ({
  categories: [],

  loadCategories: async () => {
    const categories = await getAllCategories();
    set({ categories });
  },

  addCategory: async (name, color) => {
    const category = await createCategory(name, color);
    set((state) => ({
      categories: [...state.categories, category].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    }));
    return category;
  },

  updateCategory: async (id, patch) => {
    await updateCategory(id, patch);
    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === id
          ? { ...category, ...patch, updatedAt: new Date().toISOString() }
          : category,
      ),
    }));
  },

  deleteCategory: async (id) => {
    await deleteCategory(id);
    set((state) => ({
      categories: state.categories.filter((category) => category.id !== id),
    }));
    // Tasks in this category were detached by the FK (category_id → NULL);
    // reload so in-memory tasks reflect that. The delete above already
    // succeeded — a reload failure here is reported as a partial failure,
    // not attributed back to the (already-successful) delete.
    try {
      await useTaskStore.getState().loadTasks();
      return { reloadFailed: false };
    } catch {
      return { reloadFailed: true };
    }
  },
}));

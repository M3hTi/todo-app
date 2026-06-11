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
  deleteCategory: (id: string) => Promise<void>;
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
    // reload so in-memory tasks reflect that.
    await useTaskStore.getState().loadTasks();
  },
}));

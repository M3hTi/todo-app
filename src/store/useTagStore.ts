import { create } from "zustand";
import type { Tag } from "@/types";
import { createTag, deleteTag, getAllTags } from "@/lib/queries/tags";
import { useTaskStore } from "@/store/useTaskStore";

interface TagStoreState {
  tags: Tag[];

  loadTags: () => Promise<void>;
  addTag: (name: string) => Promise<Tag>;
  deleteTag: (id: string) => Promise<void>;
}

export const useTagStore = create<TagStoreState>((set) => ({
  tags: [],

  loadTags: async () => {
    const tags = await getAllTags();
    set({ tags });
  },

  addTag: async (name) => {
    const tag = await createTag(name);
    set((state) =>
      state.tags.some((existing) => existing.id === tag.id)
        ? state
        : {
            tags: [...state.tags, tag].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
            ),
          },
    );
    return tag;
  },

  deleteTag: async (id) => {
    await deleteTag(id);
    set((state) => ({ tags: state.tags.filter((tag) => tag.id !== id) }));
    // Tag links were removed from tasks by the FK cascade; refresh tasks.
    await useTaskStore.getState().loadTasks();
  },
}));

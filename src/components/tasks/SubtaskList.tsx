import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { Subtask, Task } from "@/types";
import {
  createSubtask,
  deleteSubtask,
  reorderSubtasks,
  updateSubtask,
} from "@/lib/queries/subtasks";
import { useTaskStore } from "@/store/useTaskStore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SubtaskListProps {
  task: Task;
}

export function SubtaskList({ task }: SubtaskListProps) {
  const refreshTask = useTaskStore((state) => state.refreshTask);
  const [newTitle, setNewTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const completedCount = task.subtasks.filter((subtask) => subtask.completed).length;

  const failSave = (): void => {
    toast.error("Failed to save subtask. Please try again.");
  };

  const handleAdd = async (): Promise<void> => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    try {
      await createSubtask(task.id, title);
      await refreshTask(task.id);
    } catch {
      failSave();
    }
  };

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = task.subtasks.findIndex((subtask) => subtask.id === active.id);
    const newIndex = task.subtasks.findIndex((subtask) => subtask.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(task.subtasks, oldIndex, newIndex);
    // Optimistic: show the new order immediately, then persist and re-sync.
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map((existing) =>
        existing.id === task.id
          ? {
              ...existing,
              subtasks: reordered.map((subtask, index) => ({ ...subtask, order: index })),
            }
          : existing,
      ),
    }));
    try {
      await reorderSubtasks(
        task.id,
        reordered.map((subtask) => subtask.id),
      );
      await refreshTask(task.id);
    } catch {
      failSave();
      await refreshTask(task.id);
    }
  };

  return (
    <div className="space-y-2">
      {task.subtasks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {completedCount} of {task.subtasks.length} completed
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <SortableContext
          items={task.subtasks.map((subtask) => subtask.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-1">
            {task.subtasks.map((subtask) => (
              <SortableSubtaskRow
                key={subtask.id}
                subtask={subtask}
                onToggle={async (completed) => {
                  try {
                    await updateSubtask(subtask.id, { completed });
                    await refreshTask(task.id);
                  } catch {
                    failSave();
                  }
                }}
                onRename={async (title) => {
                  try {
                    if (title.trim() && title !== subtask.title) {
                      await updateSubtask(subtask.id, { title: title.trim() });
                    }
                    await refreshTask(task.id);
                  } catch {
                    failSave();
                  }
                }}
                onDelete={async () => {
                  try {
                    await deleteSubtask(subtask.id);
                    await refreshTask(task.id);
                  } catch {
                    failSave();
                  }
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleAdd();
        }}
      >
        <Input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Add a subtask…"
          className="h-8 text-sm"
          aria-label="New subtask title"
        />
        <Button type="submit" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Add subtask">
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

interface SortableSubtaskRowProps {
  subtask: Subtask;
  onToggle: (completed: boolean) => Promise<void>;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function SortableSubtaskRow({ subtask, onToggle, onRename, onDelete }: SortableSubtaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const [title, setTitle] = useState(subtask.title);

  // Keep the inline editor in sync when the subtask is updated elsewhere.
  useEffect(() => {
    setTitle(subtask.title);
  }, [subtask.title]);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-accent/50",
        isDragging && "z-10 bg-accent shadow-sm",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Reorder ${subtask.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={(checked) => void onToggle(checked === true)}
        aria-label={`Mark ${subtask.title} ${subtask.completed ? "incomplete" : "complete"}`}
      />
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void onRename(title)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm focus-visible:outline-none",
          subtask.completed && "text-muted-foreground line-through",
        )}
        aria-label={`Subtask title: ${subtask.title}`}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Delete subtask ${subtask.title}`}
        onClick={() => void onDelete()}
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </li>
  );
}

import type { ReactNode } from "react";
import { toast } from "sonner";
import type { Task, TaskPriority } from "@/types";
import type { UpdateTaskInput } from "@/lib/queries/tasks";
import { useTaskStore } from "@/store/useTaskStore";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { dueDatePatch } from "@/lib/reminder";
import { DATE_CHIPS, quickDate } from "@/lib/dateChips";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];

interface TaskContextMenuProps {
  task: Task;
  /** Done *today* — not `status`, which reads 'Not Started' for a recurring
   *  task that already rolled forward. Computed by the caller, which has it. */
  completed: boolean;
  children: ReactNode;
}

/**
 * Right-click menu for a task row. Every item calls an action that already
 * exists; nothing here writes to the database directly.
 */
export function TaskContextMenu({ task, completed, children }: TaskContextMenuProps) {
  const updateTask = useTaskStore((state) => state.updateTask);
  const setConfirmDeleteTask = useTaskStore((state) => state.setConfirmDeleteTask);

  const save = async (patch: UpdateTaskInput): Promise<void> => {
    try {
      await updateTask(task.id, patch);
    } catch {
      toast.error("Failed to save task. Please try again.");
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void toggleTaskComplete(task)}>
          {completed ? "Mark incomplete" : "Complete"}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>Priority</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={task.priority}
              onValueChange={(value) => void save({ priority: value as TaskPriority })}
            >
              {PRIORITIES.map((priority) => (
                <ContextMenuRadioItem key={priority} value={priority}>
                  {priority}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>Due date</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {DATE_CHIPS.map(({ chip, label }) => (
              <ContextMenuItem
                key={chip}
                onSelect={() => void save(dueDatePatch(task, quickDate(chip, new Date())))}
              >
                {label}
              </ContextMenuItem>
            ))}
            {task.dueDate && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void save(dueDatePatch(task, null))}>
                  Clear
                </ContextMenuItem>
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Same confirmation dialog the Delete key and the detail panel use.
            Opened a macrotask late on purpose: Radix restores <body>'s
            pointer-events as the menu unmounts, and a dialog mounting in the
            same tick makes that cleanup run last — leaving the whole app
            unclickable. Covered by the e2e "context menu" test. */}
        <ContextMenuItem
          onSelect={() => setTimeout(() => setConfirmDeleteTask(task.id), 0)}
          className="text-destructive"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

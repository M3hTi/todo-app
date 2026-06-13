import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTagStore } from "@/store/useTagStore";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { RecurrenceEditor, TagInput } from "@/components/tasks/TaskForm";
import { ReminderEditor } from "@/components/tasks/ReminderEditor";
import { buildReminder, dismissReminder, snoozeReminder, toDraft } from "@/lib/reminder";
import { SubtaskList } from "@/components/tasks/SubtaskList";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Completed", "Cancelled"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task }: TaskDetailProps) {
  const updateTask = useTaskStore((state) => state.updateTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const setSelectedTask = useTaskStore((state) => state.setSelectedTask);
  const categories = useCategoryStore((state) => state.categories);
  const loadTags = useTagStore((state) => state.loadTags);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-sync local editors when a different task is selected or data refreshes.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setNotes(task.notes ?? "");
  }, [task.id, task.title, task.description, task.notes]);

  const save = async (patch: Parameters<typeof updateTask>[1]): Promise<void> => {
    try {
      await updateTask(task.id, patch);
    } catch {
      toast.error("Failed to save task. Please try again.");
    }
  };

  const completed = task.status === "Completed";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">Task details</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close details"
          onClick={() => setSelectedTask(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start gap-2.5">
          <Checkbox
            checked={completed}
            onCheckedChange={() => void toggleTaskComplete(task)}
            aria-label={`Mark ${task.title} ${completed ? "incomplete" : "complete"}`}
            className="mt-2"
          />
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== task.title) void save({ title: trimmed });
              else setTitle(task.title);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            aria-label="Task title"
            className={cn(
              "border-transparent text-base font-medium shadow-none hover:border-input",
              completed && "text-muted-foreground line-through",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="detail-description">Description</Label>
          <Textarea
            id="detail-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? "")) {
                void save({ description: description.trim() || null });
              }
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={task.status}
              onValueChange={(value) => {
                const status = value as TaskStatus;
                if (status === "Completed") {
                  // Route through the shared toggle so recurring tasks roll forward.
                  void toggleTaskComplete(task);
                } else {
                  void save({ status, completedAt: null });
                }
              }}
            >
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={task.priority}
              onValueChange={(value) => void save({ priority: value as TaskPriority })}
            >
              <SelectTrigger aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={task.categoryId ?? "none"}
            onValueChange={(value) => void save({ categoryId: value === "none" ? null : value })}
          >
            <SelectTrigger aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="detail-due-date">Due date</Label>
            <Input
              id="detail-due-date"
              type="date"
              value={task.dueDate ?? ""}
              onChange={(event) =>
                void save({
                  dueDate: event.target.value || null,
                  ...(event.target.value ? {} : { dueTime: null, reminderAt: null }),
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="detail-due-time">Due time</Label>
            <Input
              id="detail-due-time"
              type="time"
              value={task.dueTime ?? ""}
              disabled={!task.dueDate}
              onChange={(event) => void save({ dueTime: event.target.value || null })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Reminder</Label>
          <ReminderEditor
            value={toDraft(task.reminder)}
            dueDate={task.dueDate}
            dueTime={task.dueTime}
            onChange={(draft) =>
              void save({ reminder: buildReminder(draft, task.dueDate, task.dueTime) ?? null })
            }
          />
          {task.reminder && !task.reminder.dismissedAt && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  task.reminder &&
                  void save({ reminder: snoozeReminder(task.reminder, new Date().toISOString()) })
                }
              >
                Snooze 15m
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  task.reminder &&
                  void save({ reminder: dismissReminder(task.reminder, new Date().toISOString()) })
                }
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Repeat</Label>
          <RecurrenceEditor
            value={task.recurringRule}
            onChange={(rule) => void save({ recurringRule: rule ?? null })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Tags</Label>
          <TagInput
            value={task.tags}
            onChange={(tags) => {
              void save({ tags }).then(() => loadTags());
            }}
          />
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label>Subtasks</Label>
          <SubtaskList task={task} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="detail-notes">Notes</Label>
          <Textarea
            id="detail-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== (task.notes ?? "")) void save({ notes: notes.trim() || null });
            }}
          />
        </div>

        <Separator />

        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <dt>Created</dt>
            <dd>{format(parseISO(task.createdAt), "MMM d, yyyy HH:mm")}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Updated</dt>
            <dd>{format(parseISO(task.updatedAt), "MMM d, yyyy HH:mm")}</dd>
          </div>
          {task.completedAt && (
            <div className="flex justify-between">
              <dt>Completed</dt>
              <dd>{format(parseISO(task.completedAt), "MMM d, yyyy HH:mm")}</dd>
            </div>
          )}
        </dl>

        <Button
          variant="destructive"
          className="w-full"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete task
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete task"
        description={`Delete "${task.title}"? This also removes its subtasks and cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          void deleteTask(task.id)
            .then(() => toast.success("Task deleted."))
            .catch(() => toast.error("Failed to delete task. Please try again."))
        }
      />
    </div>
  );
}

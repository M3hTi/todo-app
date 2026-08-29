import { useEffect, useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "@/types";
import type { UpdateTaskInput } from "@/lib/queries/tasks";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTagStore } from "@/store/useTagStore";
import { toggleTaskComplete } from "@/hooks/useTasks";
import { categoryDotColor, PRIORITY_PILL_CLASSES } from "@/lib/taskVisuals";
import { RecurrenceEditor, TagInput } from "@/components/tasks/TaskForm";
import { ReminderEditor } from "@/components/tasks/ReminderEditor";
import {
  buildReminder,
  dismissReminder,
  dueDatePatch,
  snoozeReminder,
  toDraft,
  type ReminderDraft,
} from "@/lib/reminder";
import { SubtaskList } from "@/components/tasks/SubtaskList";
import { HistoryStrip } from "@/components/tasks/HistoryStrip";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DATE_CHIPS, quickDate } from "@/lib/dateChips";
import { cn } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Completed", "Cancelled"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
const sectionLabel = "mb-2 text-[13.5px] font-semibold text-[var(--text-1)]";
const metaRow =
  "flex items-center justify-between border-b border-[var(--hairline)] py-[11px] text-left";
const metaLabel = "text-[12.5px] text-[var(--text-4b)]";

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
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft>(() => toDraft(task.reminder));

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setNotes(task.notes ?? "");
  }, [task.id, task.title, task.description, task.notes]);

  useEffect(() => {
    setReminderDraft(toDraft(task.reminder));
    // Only re-seed on task switch; mid-edit drafts must not be clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const save = async (patch: UpdateTaskInput): Promise<void> => {
    try {
      await updateTask(task.id, patch);
    } catch {
      toast.error("Failed to save task. Please try again.");
    }
  };

  const completed = task.status === "Completed";
  const category = categories.find((candidate) => candidate.id === task.categoryId);
  const dueToday = task.dueDate ? isToday(parseISO(task.dueDate)) : false;
  const subtaskTotal = task.subtasks.length;
  const subtaskDone = task.subtasks.filter((subtask) => subtask.completed).length;
  const subtaskPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-[22px] pt-[22px]">
        <span className="text-[13px] font-semibold tracking-[.04em] text-[var(--text-4)]">
          TASK DETAILS
        </span>
        <button
          type="button"
          aria-label="Close details"
          onClick={() => setSelectedTask(null)}
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--text-4)] hover:bg-[var(--surface-hover-nav)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-[22px] pb-[22px] pt-3.5">
        <div>
          <StatusPill
            task={task}
            onChange={(status) => {
              if (status === "Completed") void toggleTaskComplete(task);
              else void save({ status, completedAt: null });
            }}
          />
          <input
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
              "mt-2.5 w-full border-none bg-transparent text-[17px] font-bold leading-[1.35] outline-none",
              completed ? "text-[var(--text-done)] line-through" : "text-[var(--text-1)]",
            )}
          />
        </div>

        <div className="flex flex-col border-t border-[var(--hairline)]">
          <div className={metaRow}>
            <span className={metaLabel}>Due date</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "text-[13px] font-medium",
                    dueToday && !completed ? "text-[var(--accent-text)]" : "text-[var(--text-1)]",
                  )}
                >
                  {task.dueDate
                    ? dueToday
                      ? "Today"
                      : format(parseISO(task.dueDate), "MMM d, yyyy")
                    : "Add date"}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[316px] rounded-xl border-[var(--border)] bg-[var(--surface-raised)] p-[18px] shadow-[0_8px_28px_rgba(0,0,0,.45)]"
                align="end"
                collisionPadding={12}
              >
                <div className="mb-3 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-3">
                  {DATE_CHIPS.map(({ chip, label }) => (
                    <Button
                      key={chip}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void save(dueDatePatch(task, quickDate(chip, new Date())))}
                    >
                      {label}
                    </Button>
                  ))}
                  {task.dueDate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void save(dueDatePatch(task, null))}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Calendar
                  mode="single"
                  selected={task.dueDate ? parseISO(task.dueDate) : undefined}
                  defaultMonth={task.dueDate ? parseISO(task.dueDate) : undefined}
                  onSelect={(day) => {
                    if (day) void save(dueDatePatch(task, format(day, "yyyy-MM-dd")));
                  }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className={metaRow}>
            <span className={metaLabel}>Priority</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "rounded-[20px] px-2.5 py-[3px] text-[11px] font-semibold",
                    PRIORITY_PILL_CLASSES[task.priority],
                  )}
                >
                  {task.priority}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1.5" align="end">
                <div className="flex flex-col gap-1">
                  {PRIORITIES.map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => void save({ priority })}
                      className={cn(
                        "rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover-nav)]",
                        priority === task.priority && "font-semibold",
                      )}
                    >
                      <span
                        className={cn(
                          "rounded-[20px] px-2.5 py-[3px] text-[11px] font-semibold",
                          PRIORITY_PILL_CLASSES[priority],
                        )}
                      >
                        {priority}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className={metaRow}>
            <span className={metaLabel}>Category</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-[7px] text-[13px] font-medium text-[var(--text-1)]"
                >
                  {category && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryDotColor(category.color) }}
                    />
                  )}
                  {category?.name ?? "No category"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-1.5" align="end">
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => void save({ categoryId: null })}
                    className="rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover-nav)]"
                  >
                    No category
                  </button>
                  {categories.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => void save({ categoryId: option.id })}
                      className="flex items-center gap-[7px] rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover-nav)]"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryDotColor(option.color) }}
                      />
                      {option.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className={metaRow}>
            <span className={metaLabel}>Repeat</span>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="text-[13px] text-[var(--text-3)]">
                  {task.recurringRule ? task.recurringRule.frequency : "Does not repeat"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <RecurrenceEditor
                  value={task.recurringRule}
                  onChange={(rule) => void save({ recurringRule: rule ?? null })}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {task.recurringRule && <HistoryStrip task={task} />}

        <div>
          <p className={sectionLabel}>Description</p>
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? "")) {
                void save({ description: description.trim() || null });
              }
            }}
            className="rounded-[9px] border-[var(--border)] text-[13px]"
            placeholder="Add a description…"
          />
        </div>

        <div>
          <p className={sectionLabel}>Tags</p>
          <TagInput
            value={task.tags}
            onChange={(tags) => {
              void save({ tags }).then(() => loadTags());
            }}
          />
        </div>

        <div>
          <p className={sectionLabel}>Reminder</p>
          <ReminderEditor
            value={reminderDraft}
            dueDate={task.dueDate}
            dueTime={task.dueTime}
            onChange={(draft) => {
              setReminderDraft(draft);
              void save({ reminder: buildReminder(draft, task.dueDate, task.dueTime) ?? null });
            }}
          />
          {task.reminder && !task.reminder.dismissedAt && (
            <div className="mt-2 flex gap-2">
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

        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className={sectionLabel + " mb-0"}>Subtasks</span>
            {subtaskTotal > 0 && (
              <span className="text-xs text-[var(--text-4)]">
                {subtaskDone} of {subtaskTotal} completed
              </span>
            )}
          </div>
          {subtaskTotal > 0 && (
            <div className="mb-3 h-[5px] overflow-hidden rounded-full bg-[var(--track)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${subtaskPct}%` }}
              />
            </div>
          )}
          <SubtaskList task={task} />
        </div>

        <div>
          <p className={sectionLabel}>Notes</p>
          <Textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if (notes !== (task.notes ?? "")) void save({ notes: notes.trim() || null });
            }}
            className="min-h-[64px] rounded-[9px] border-[var(--border)] bg-[var(--notes-bg)] text-[13px] placeholder:text-[var(--text-5)]"
            placeholder="Add a note…"
          />
        </div>

        <dl className="space-y-1 border-t border-[var(--hairline)] pt-4 text-xs text-[var(--text-4)]">
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

        <Button variant="destructive" className="w-full" onClick={() => setConfirmDelete(true)}>
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

function StatusPill({
  task,
  onChange,
}: {
  task: Task;
  onChange: (status: TaskStatus) => void;
}) {
  const completed = task.status === "Completed";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-[20px] px-[11px] py-1 text-[11px] font-semibold",
            completed ? "bg-[var(--completed-bg)] text-[var(--completed-text)]" : "bg-[var(--accent-tint)] text-[var(--accent-text)]",
          )}
        >
          {completed ? "Completed" : task.status}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" align="start">
        <div className="flex flex-col gap-0.5">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onChange(status)}
              className={cn(
                "rounded-[6px] px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover-nav)]",
                status === task.status && "font-semibold text-[var(--accent-text)]",
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

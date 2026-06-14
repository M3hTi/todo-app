import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { RecurrenceFrequency, RecurringRule, TaskPriority, TaskStatus } from "@/types";
import { ReminderEditor } from "@/components/tasks/ReminderEditor";
import { DatePicker } from "@/components/shared/DatePicker";
import { buildReminder, NO_REMINDER_DRAFT, type ReminderDraft } from "@/lib/reminder";
import { useTaskStore } from "@/store/useTaskStore";
import { useCategoryStore } from "@/store/useCategoryStore";
import { useTagStore } from "@/store/useTagStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STATUSES: [TaskStatus, ...TaskStatus[]] = [
  "Not Started",
  "In Progress",
  "Completed",
  "Cancelled",
];
const PRIORITIES: [TaskPriority, ...TaskPriority[]] = ["Low", "Medium", "High", "Urgent"];
const FREQUENCIES: RecurrenceFrequency[] = ["Daily", "Weekly", "Monthly", "Yearly"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const taskFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title must be 255 characters or fewer"),
  description: z.string().max(2000, "Description must be 2000 characters or fewer"),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  categoryId: z.string(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").or(z.literal("")),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time").or(z.literal("")),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

export function TaskForm() {
  const open = useTaskStore((state) => state.taskFormOpen);
  const setOpen = useTaskStore((state) => state.setTaskFormOpen);
  const addTask = useTaskStore((state) => state.addTask);
  const categories = useCategoryStore((state) => state.categories);
  const loadTags = useTagStore((state) => state.loadTags);
  const settings = useSettingsStore((state) => state.settings);

  const [tags, setTags] = useState<string[]>([]);
  const [recurringRule, setRecurringRule] = useState<RecurringRule | undefined>(undefined);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft>(NO_REMINDER_DRAFT);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: makeDefaults(settings.defaultPriority, settings.defaultCategoryId),
  });

  useEffect(() => {
    if (open) {
      reset(makeDefaults(settings.defaultPriority, settings.defaultCategoryId));
      setTags([]);
      setRecurringRule(undefined);
      setReminderDraft(
        settings.defaultReminderMinutesBefore > 0
          ? { ...NO_REMINDER_DRAFT, enabled: true, minutesBefore: settings.defaultReminderMinutesBefore }
          : { ...NO_REMINDER_DRAFT },
      );
    }
  }, [open, reset, settings]);

  const dueDate = watch("dueDate");
  const status = watch("status");
  const priority = watch("priority");
  const categoryId = watch("categoryId");

  const onSubmit = async (values: TaskFormValues): Promise<void> => {
    try {
      await addTask({
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        status: values.status,
        priority: values.priority,
        categoryId: values.categoryId === "none" ? undefined : values.categoryId,
        dueDate: values.dueDate || undefined,
        dueTime: values.dueTime || undefined,
        reminder: buildReminder(reminderDraft, values.dueDate || undefined, values.dueTime || undefined),
        recurringRule,
        tags,
      });
      await loadTags();
      setOpen(false);
      toast.success("Task created.");
    } catch {
      toast.error("Failed to save task. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" autoFocus {...register("title")} />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" rows={2} {...register("description")} />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setValue("status", value as TaskStatus)}
              >
                <SelectTrigger aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setValue("priority", value as TaskPriority)}
              >
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={categoryId}
                onValueChange={(value) => setValue("categoryId", value)}
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
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagInput value={tags} onChange={setTags} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date">Due date</Label>
              <DatePicker
                id="task-due-date"
                ariaLabel="Due date"
                value={dueDate || undefined}
                onChange={(value) => setValue("dueDate", value ?? "", { shouldValidate: true })}
              />
              {errors.dueDate && (
                <p className="text-sm text-destructive">{errors.dueDate.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due-time">Due time</Label>
              <Input id="task-due-time" type="time" disabled={!dueDate} {...register("dueTime")} />
              {errors.dueTime && (
                <p className="text-sm text-destructive">{errors.dueTime.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reminder</Label>
            <ReminderEditor
              value={reminderDraft}
              dueDate={dueDate || undefined}
              dueTime={watch("dueTime") || undefined}
              onChange={setReminderDraft}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <RecurrenceEditor value={recurringRule} onChange={setRecurringRule} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function makeDefaults(
  defaultPriority: TaskPriority,
  defaultCategoryId: string | undefined,
): TaskFormValues {
  return {
    title: "",
    description: "",
    status: "Not Started",
    priority: defaultPriority,
    categoryId: defaultCategoryId ?? "none",
    dueDate: "",
    dueTime: "",
  };
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/** Chip-style tag editor: type a name, press Enter or comma to add. */
export function TagInput({ value, onChange }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commit = (): void => {
    const name = draft.trim().replace(/,$/, "");
    setDraft("");
    if (name && !value.includes(name)) {
      onChange([...value, name]);
    }
  };

  return (
    <div className="space-y-1.5">
      <Input
        value={draft}
        placeholder="Add tag…"
        aria-label="Add tag"
        onChange={(event) => {
          if (event.target.value.endsWith(",")) {
            setDraft(event.target.value);
            commit();
          } else {
            setDraft(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 px-1.5 py-0 text-[11px]">
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onChange(value.filter((existing) => existing !== tag))}
                className="focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

interface RecurrenceEditorProps {
  value: RecurringRule | undefined;
  onChange: (rule: RecurringRule | undefined) => void;
}

/** Compact recurrence rule editor shared by TaskForm and TaskDetail. */
export function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <Select
        value={value?.frequency ?? "none"}
        onValueChange={(frequency) => {
          if (frequency === "none") {
            onChange(undefined);
          } else {
            onChange({
              frequency: frequency as RecurrenceFrequency,
              interval: value?.interval ?? 1,
              ...(frequency === "Weekly" ? { daysOfWeek: value?.daysOfWeek ?? [] } : {}),
              ...(frequency === "Monthly" ? { dayOfMonth: value?.dayOfMonth ?? 1 } : {}),
              ...(value?.endDate ? { endDate: value.endDate } : {}),
            });
          }
        }}
      >
        <SelectTrigger aria-label="Repeat frequency">
          <SelectValue placeholder="Does not repeat" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Does not repeat</SelectItem>
          {FREQUENCIES.map((frequency) => (
            <SelectItem key={frequency} value={frequency}>
              {frequency}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Every</span>
            <Input
              type="number"
              min={1}
              className="h-8 w-16"
              aria-label="Repeat interval"
              value={value.interval}
              onChange={(event) =>
                onChange({ ...value, interval: Math.max(1, Number(event.target.value) || 1) })
              }
            />
            <span className="text-muted-foreground">
              {value.frequency === "Daily" && (value.interval === 1 ? "day" : "days")}
              {value.frequency === "Weekly" && (value.interval === 1 ? "week" : "weeks")}
              {value.frequency === "Monthly" && (value.interval === 1 ? "month" : "months")}
              {value.frequency === "Yearly" && (value.interval === 1 ? "year" : "years")}
            </span>
          </div>

          {value.frequency === "Weekly" && (
            <div className="flex gap-1" role="group" aria-label="Repeat on days">
              {WEEKDAYS.map((day, index) => {
                const active = (value.daysOfWeek ?? []).includes(index);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Repeat on ${day}`}
                    className={cn(
                      "h-7 w-7 rounded-full text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-accent",
                    )}
                    onClick={() => {
                      const current = value.daysOfWeek ?? [];
                      onChange({
                        ...value,
                        daysOfWeek: active
                          ? current.filter((existing) => existing !== index)
                          : [...current, index].sort((a, b) => a - b),
                      });
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}

          {value.frequency === "Monthly" && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">On day</span>
              <Input
                type="number"
                min={1}
                max={31}
                className="h-8 w-16"
                aria-label="Day of month"
                value={value.dayOfMonth ?? 1}
                onChange={(event) =>
                  onChange({
                    ...value,
                    dayOfMonth: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                  })
                }
              />
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Until</span>
            <DatePicker
              ariaLabel="Repeat end date"
              placeholder="No end date"
              className="h-8 w-44"
              value={value.endDate ?? undefined}
              onChange={(next) => {
                const { endDate: _endDate, ...rest } = value;
                onChange(next ? { ...rest, endDate: next } : rest);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

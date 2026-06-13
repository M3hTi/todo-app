import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReminderDraft } from "@/lib/reminder";

const MINUTES_OPTIONS = [
  { value: 0, label: "At due time" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
] as const;

const REPEAT_OPTIONS = [
  { value: 0, label: "Don't repeat" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 1440, label: "Every day" },
] as const;

type WhenValue = "none" | "relative" | "absolute";

interface ReminderEditorProps {
  value: ReminderDraft;
  dueDate: string | undefined;
  dueTime: string | undefined;
  onChange: (draft: ReminderDraft) => void;
}

/** Controlled editor for a task's single flexible reminder (relative or absolute, optional repeat). */
export function ReminderEditor({ value, dueDate, dueTime: _dueTime, onChange }: ReminderEditorProps) {
  const when: WhenValue = !value.enabled ? "none" : value.mode;
  const relativeUnavailable = !dueDate;

  const setWhen = (next: WhenValue): void => {
    if (next === "none") {
      onChange({ ...value, enabled: false });
    } else {
      onChange({ ...value, enabled: true, mode: next });
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <Select value={when} onValueChange={(next) => setWhen(next as WhenValue)}>
        <SelectTrigger aria-label="Reminder">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No reminder</SelectItem>
          <SelectItem value="relative" disabled={relativeUnavailable}>
            Before the due time
          </SelectItem>
          <SelectItem value="absolute">At a specific date &amp; time</SelectItem>
        </SelectContent>
      </Select>

      {value.enabled && value.mode === "relative" && (
        <Select
          value={String(value.minutesBefore)}
          onValueChange={(minutes) => onChange({ ...value, minutesBefore: Number(minutes) })}
        >
          <SelectTrigger aria-label="Remind me">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.enabled && value.mode === "absolute" && (
        <Input
          type="datetime-local"
          aria-label="Reminder date and time"
          value={value.at}
          onChange={(event) => onChange({ ...value, at: event.target.value })}
        />
      )}

      {value.enabled && (
        <Select
          value={String(value.repeatMinutes)}
          onValueChange={(repeat) => onChange({ ...value, repeatMinutes: Number(repeat) })}
        >
          <SelectTrigger aria-label="Repeat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPEAT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.enabled && value.mode === "relative" && relativeUnavailable && (
        <p className="text-xs text-muted-foreground">Set a due date to use a "before due" reminder.</p>
      )}
      {value.enabled && value.mode === "absolute" && !value.at && (
        <p className="text-xs text-muted-foreground">Pick a date and time for the reminder.</p>
      )}
      {value.enabled && (
        <p className="text-xs text-muted-foreground">
          Repeats stop when the task is completed or you dismiss the reminder.
        </p>
      )}
    </div>
  );
}

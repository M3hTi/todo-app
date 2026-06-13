import { addMinutes, format, parseISO, subMinutes } from "date-fns";
import type { Reminder, ReminderMode, TaskStatus } from "@/types";

export const SNOOZE_MINUTES = 15;

/** Editor state for the reminder UI; converted to/from a stored Reminder. */
export interface ReminderDraft {
  enabled: boolean;
  mode: ReminderMode;
  minutesBefore: number; // relative
  at: string;            // absolute, datetime-local string ("yyyy-MM-ddTHH:mm") or ""
  repeatMinutes: number; // 0 = no repeat
}

export const NO_REMINDER_DRAFT: ReminderDraft = {
  enabled: false,
  mode: "relative",
  minutesBefore: 15,
  at: "",
  repeatMinutes: 0,
};

/** Formats a stored ISO datetime as a datetime-local input value. */
export function toDateTimeLocal(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

/** Computes the next fire time for a draft, or undefined if it can't fire yet. */
export function computeNextFireAt(
  draft: ReminderDraft,
  dueDate: string | undefined,
  dueTime: string | undefined,
): string | undefined {
  if (draft.mode === "absolute") {
    return draft.at ? new Date(draft.at).toISOString() : undefined;
  }
  if (!dueDate) return undefined;
  const base = parseISO(`${dueDate}T${dueTime || "09:00"}`);
  return subMinutes(base, draft.minutesBefore).toISOString();
}

/** Builds a Reminder from editor state; undefined when disabled or not computable. */
export function buildReminder(
  draft: ReminderDraft,
  dueDate: string | undefined,
  dueTime: string | undefined,
): Reminder | undefined {
  if (!draft.enabled) return undefined;
  const nextFireAt = computeNextFireAt(draft, dueDate, dueTime);
  if (!nextFireAt) return undefined;

  const reminder: Reminder = { mode: draft.mode, nextFireAt };
  if (draft.mode === "relative") {
    reminder.minutesBefore = draft.minutesBefore;
  } else {
    reminder.at = new Date(draft.at).toISOString();
  }
  if (draft.repeatMinutes > 0) reminder.repeatMinutes = draft.repeatMinutes;
  return reminder;
}

/** Editor state from a stored reminder (or the disabled default). */
export function toDraft(reminder: Reminder | undefined): ReminderDraft {
  if (!reminder) return { ...NO_REMINDER_DRAFT };
  return {
    enabled: true,
    mode: reminder.mode,
    minutesBefore: reminder.minutesBefore ?? 15,
    at: reminder.at ? toDateTimeLocal(reminder.at) : "",
    repeatMinutes: reminder.repeatMinutes ?? 0,
  };
}

export function isReminderDue(
  reminder: Reminder | undefined,
  status: TaskStatus,
  nowIso: string,
): boolean {
  if (!reminder) return false;
  if (reminder.dismissedAt !== undefined) return false;
  if (status === "Completed" || status === "Cancelled") return false;
  return reminder.nextFireAt <= nowIso;
}

/** After a fire: repeat -> reschedule from now; one-shot -> mark dismissed (done). */
export function advanceAfterFire(reminder: Reminder, nowIso: string): Reminder {
  const fired: Reminder = { ...reminder, lastFiredAt: nowIso };
  if (reminder.repeatMinutes && reminder.repeatMinutes > 0) {
    fired.nextFireAt = addMinutes(new Date(nowIso), reminder.repeatMinutes).toISOString();
    fired.dismissedAt = undefined;
  } else {
    fired.dismissedAt = nowIso;
  }
  return fired;
}

export function snoozeReminder(
  reminder: Reminder,
  nowIso: string,
  minutes = SNOOZE_MINUTES,
): Reminder {
  return {
    ...reminder,
    dismissedAt: undefined,
    nextFireAt: addMinutes(new Date(nowIso), minutes).toISOString(),
  };
}

export function dismissReminder(reminder: Reminder, nowIso: string): Reminder {
  return { ...reminder, dismissedAt: nowIso };
}

/** Re-anchors a relative reminder to a new due date/time, resetting fired/dismissed state. */
export function reanchorReminder(
  reminder: Reminder,
  dueDate: string,
  dueTime: string | undefined,
): Reminder {
  if (reminder.mode !== "relative" || reminder.minutesBefore === undefined) return reminder;
  const base = parseISO(`${dueDate}T${dueTime || "09:00"}`);
  const next: Reminder = {
    mode: "relative",
    minutesBefore: reminder.minutesBefore,
    nextFireAt: subMinutes(base, reminder.minutesBefore).toISOString(),
  };
  if (reminder.repeatMinutes) next.repeatMinutes = reminder.repeatMinutes;
  return next;
}

/** Reminder for a recurring task's next occurrence: relative re-anchors; absolute is dropped. */
export function reminderForNextOccurrence(
  reminder: Reminder | undefined,
  nextDueDate: string,
  dueTime: string | undefined,
): Reminder | undefined {
  if (!reminder || reminder.mode === "absolute") return undefined;
  return reanchorReminder(reminder, nextDueDate, dueTime);
}

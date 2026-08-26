export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
export type Theme = 'Light' | 'Dark' | 'System';
export type CloseBehavior = 'ask' | 'tray' | 'quit';
export type ReminderMode = 'relative' | 'absolute';

export interface Reminder {
  mode: ReminderMode;
  minutesBefore?: number;   // relative mode: minutes before the due time
  at?: string;              // absolute mode: ISO datetime
  repeatMinutes?: number;   // undefined/0 = fire once; else repeat interval in minutes
  nextFireAt: string;       // ISO datetime of the next scheduled fire
  lastFiredAt?: string;     // ISO datetime of the most recent fire
  dismissedAt?: string;     // ISO; set on dismiss OR when a one-shot has fired — stops future fires
}

export interface RecurringRule {
  frequency: RecurrenceFrequency;
  interval: number;           // default 1
  daysOfWeek?: number[];      // 0=Sun … 6=Sat (Weekly only)
  dayOfMonth?: number;        // 1–31 (Monthly only)
  endDate?: string;           // ISO date
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;           // ISO date YYYY-MM-DD
  dueTime?: string;           // HH:mm
  categoryId?: string;
  tags: string[];             // tag names, resolved on load
  subtasks: Subtask[];
  reminder?: Reminder;
  recurringRule?: RecurringRule;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  notes?: string;
}

/** One day's completion total, as rendered by the activity heatmap. */
export interface DailyCount {
  date: string;               // ISO date YYYY-MM-DD (local)
  count: number;
}

/**
 * A task completed on a given local day. Absence of a row means "not completed
 * that day" — that is what makes per-day status independent for recurring tasks.
 * `taskId` goes null when the task is deleted; `taskTitle` is snapshotted so the
 * row can still render itself afterwards.
 */
export interface Completion {
  id: string;
  taskId: string | null;
  taskTitle: string;
  occurrenceDate: string;     // ISO date YYYY-MM-DD (local)
  completedAt: string;        // ISO datetime
  prevDueDate?: string;       // undo snapshot — the due date before roll-forward
  prevReminder?: Reminder;    // undo snapshot — the reminder before re-anchoring
}

export interface Category {
  id: string;
  name: string;
  color: string;              // hex, always present
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export interface AppSettings {
  theme: Theme;
  defaultCategoryId?: string;
  defaultPriority: TaskPriority;
  defaultReminderMinutesBefore: number;   // 0 = disabled
  notificationsEnabled: boolean;
  closeBehavior: CloseBehavior;
  launchOnStartup: boolean;
}

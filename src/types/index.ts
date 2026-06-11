export type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Cancelled';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
export type Theme = 'Light' | 'Dark' | 'System';

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
  reminderAt?: string;        // ISO datetime
  reminderShownAt?: string;
  recurringRule?: RecurringRule;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  notes?: string;
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
}

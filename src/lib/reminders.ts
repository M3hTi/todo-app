import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { useSettingsStore } from "@/store/useSettingsStore";

/**
 * Requests notification permission (first launch shows the OS prompt) and
 * persists a denial into settings so the UI can reflect it.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const settingsStore = useSettingsStore.getState();
  if (!settingsStore.settings.notificationsEnabled) return false;

  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (!granted) {
    await settingsStore.updateSetting("notificationsEnabled", false);
  }
  return granted;
}

// Completed/cancelled tasks never fire reminders.
function isReminderDue(task: Task, nowIso: string): boolean {
  return (
    task.reminderAt !== undefined &&
    task.reminderShownAt === undefined &&
    task.reminderAt <= nowIso &&
    task.status !== "Completed" &&
    task.status !== "Cancelled"
  );
}

async function canNotify(): Promise<boolean> {
  if (!useSettingsStore.getState().settings.notificationsEnabled) return false;
  return isPermissionGranted();
}

function notificationBody(task: Task): string {
  const due = [task.dueDate, task.dueTime].filter(Boolean).join(" ");
  return due ? `Due: ${due} · ${task.priority}` : task.priority;
}

/**
 * Marks reminders that elapsed while the app was closed as shown and returns
 * how many there were, so the caller can surface one grouped toast instead of
 * firing a burst of native notifications.
 */
export async function checkMissedReminders(): Promise<number> {
  const store = useTaskStore.getState();
  const nowIso = new Date().toISOString();
  const missed = store.tasks.filter((task) => isReminderDue(task, nowIso));
  for (const task of missed) {
    await store.updateTask(task.id, { reminderShownAt: nowIso });
  }
  return missed.length;
}

/**
 * Checks every intervalMs for due reminders; fires a Tauri notification,
 * stamps reminderShownAt in the DB and updates the store. Returns a cleanup
 * function that stops the loop.
 */
export function startReminderLoop(intervalMs = 60_000): () => void {
  let cancelled = false;

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    const store = useTaskStore.getState();
    const nowIso = new Date().toISOString();
    const due = store.tasks.filter((task) => isReminderDue(task, nowIso));
    if (due.length === 0) return;

    const allowed = await canNotify();
    for (const task of due) {
      if (cancelled) return;
      if (allowed) {
        sendNotification({ title: task.title, body: notificationBody(task) });
      }
      await store.updateTask(task.id, { reminderShownAt: nowIso });
    }
  };

  const intervalId = window.setInterval(() => void tick(), intervalMs);
  void tick();

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}

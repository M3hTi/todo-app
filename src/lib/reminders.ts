import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import type { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
import { refreshIfDayChanged } from "@/store/useCompletionStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  advanceAfterFire,
  dismissReminder,
  isReminderDue,
  snoozeReminder,
} from "@/lib/reminder";

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

async function canNotify(): Promise<boolean> {
  if (!useSettingsStore.getState().settings.notificationsEnabled) return false;
  return isPermissionGranted();
}

function notificationBody(task: Task): string {
  const due = [task.dueDate, task.dueTime].filter(Boolean).join(" ");
  return due ? `Due: ${due} · ${task.priority}` : task.priority;
}

/** Looks up the freshest copy of a task's reminder (it may have changed). */
function currentReminder(taskId: string) {
  return useTaskStore.getState().tasks.find((task) => task.id === taskId)?.reminder;
}

/** Sonner toast with Snooze/Dismiss, shown when the window is focused. */
function showInAppReminder(task: Task): void {
  toast(task.title, {
    description: notificationBody(task),
    action: {
      label: "Snooze 15m",
      onClick: () => {
        const reminder = currentReminder(task.id);
        if (reminder) {
          void useTaskStore
            .getState()
            .updateTask(task.id, { reminder: snoozeReminder(reminder, new Date().toISOString()) });
        }
      },
    },
    cancel: {
      label: "Dismiss",
      onClick: () => {
        const reminder = currentReminder(task.id);
        if (reminder) {
          void useTaskStore
            .getState()
            .updateTask(task.id, { reminder: dismissReminder(reminder, new Date().toISOString()) });
        }
      },
    },
  });
}

/**
 * Marks reminders that elapsed while the app was closed as fired/advanced and
 * returns how many there were, so the caller can show one grouped toast instead
 * of a burst of notifications.
 */
export async function checkMissedReminders(): Promise<number> {
  const store = useTaskStore.getState();
  const nowIso = new Date().toISOString();
  const missed = store.tasks.filter((task) => isReminderDue(task.reminder, task.status, nowIso));
  for (const task of missed) {
    if (task.reminder) {
      await store.updateTask(task.id, { reminder: advanceAfterFire(task.reminder, nowIso) });
    }
  }
  return missed.length;
}

/**
 * Checks every intervalMs for due reminders; fires (native notification when
 * the window is unfocused, in-app toast with Snooze/Dismiss when focused), then
 * advances the reminder (repeat -> reschedule; one-shot -> done). Returns a
 * cleanup function that stops the loop.
 */
export function startReminderLoop(intervalMs = 60_000): () => void {
  let cancelled = false;

  const tick = async (): Promise<void> => {
    if (cancelled) return;

    // Midnight rollover. The app is built to stay open for days (close-to-tray +
    // autostart), so "today" cannot be resolved once at boot — yesterday's
    // checkbox state and heatmap column would persist into the new day. This
    // rides the existing minute tick rather than owning a timer, so it must sit
    // ABOVE the early return below or it never runs on a quiet tick.
    await refreshIfDayChanged();

    const store = useTaskStore.getState();
    const nowIso = new Date().toISOString();
    const due = store.tasks.filter((task) => isReminderDue(task.reminder, task.status, nowIso));
    if (due.length === 0) return;

    const allowed = await canNotify();
    for (const task of due) {
      if (cancelled) return;
      if (!task.reminder) continue;
      let surfaced = false;
      if (document.hasFocus()) {
        showInAppReminder(task);
        surfaced = true;
      } else if (allowed) {
        sendNotification({ title: task.title, body: notificationBody(task) });
        surfaced = true;
      }
      // Only consume the reminder once it has actually been surfaced; otherwise
      // leave it pending so it fires when the window regains focus or
      // notifications are re-enabled — never silently swallow it.
      if (surfaced) {
        await store.updateTask(task.id, { reminder: advanceAfterFire(task.reminder, nowIso) });
      }
    }
  };

  const intervalId = window.setInterval(() => void tick(), intervalMs);
  void tick();

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}

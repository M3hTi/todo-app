import { invoke } from "@tauri-apps/api/core";
import { format, parseISO } from "date-fns";
import type { Task } from "@/types";

export interface TrayMenuItem {
  id: string;
  label: string;
}

export interface TrayPayload {
  tooltip: string;
  overdue: number;
  today: TrayMenuItem[];
  upcoming: TrayMenuItem[];
}

const MAX_ITEMS = 10;

function isOpen(task: Task): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

/** Pure: turns the task list into the data the native tray needs. */
export function buildTrayPayload(tasks: Task[], now: Date): TrayPayload {
  const todayStr = format(now, "yyyy-MM-dd");
  const open = tasks.filter(isOpen);

  const dueToday = open.filter((task) => task.dueDate === todayStr);
  const upcoming = open
    .filter((task) => task.dueDate !== undefined && task.dueDate > todayStr)
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  const overdue = open.filter(
    (task) => task.dueDate !== undefined && task.dueDate < todayStr,
  ).length;

  const today = dueToday.slice(0, MAX_ITEMS).map((task) => ({
    id: task.id,
    label: task.dueTime ? `${task.title}  ${task.dueTime}` : task.title,
  }));
  const upcomingItems = upcoming.slice(0, MAX_ITEMS).map((task) => ({
    id: task.id,
    label: `${task.title}  ${format(parseISO(task.dueDate as string), "EEE")}`,
  }));

  return {
    tooltip: `Today: ${dueToday.length} · Overdue: ${overdue}`,
    overdue,
    today,
    upcoming: upcomingItems,
  };
}

/** Pushes the freshly built payload to the native tray. */
export async function pushTrayPayload(tasks: Task[], now: Date): Promise<void> {
  await invoke("update_tray", { payload: buildTrayPayload(tasks, now) });
}

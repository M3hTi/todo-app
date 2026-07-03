import type { TaskPriority } from "@/types";

/** Priority pill colors from the redesign; Low keeps the prior neutral style (not specced). */
export const PRIORITY_PILL_CLASSES: Record<TaskPriority, string> = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-700",
  Urgent: "bg-red-100 text-red-700",
};

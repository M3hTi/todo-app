import type { TaskPriority } from "@/types";

/** Priority pill colors from the redesign (light + dark, via CSS custom properties). */
export const PRIORITY_PILL_CLASSES: Record<TaskPriority, string> = {
  Low: "bg-[var(--low-bg)] text-[var(--low-text)]",
  Medium: "bg-[var(--medium-bg)] text-[var(--medium-text)]",
  High: "bg-[var(--high-bg)] text-[var(--high-text)]",
  Urgent: "bg-[var(--urgent-bg)] text-[var(--urgent-text)]",
};

/** Maps a seeded default category's light hex to its dark-mode CSS variable; custom colors pass through unchanged. */
const DEFAULT_CATEGORY_COLOR_VARS: Record<string, string> = {
  "#10b981": "var(--cat-personal)",
  "#f59e0b": "var(--cat-shopping)",
  "#8b5cf6": "var(--cat-study)",
  "#3b82f6": "var(--cat-work)",
};

export function categoryDotColor(hex: string): string {
  return DEFAULT_CATEGORY_COLOR_VARS[hex.toLowerCase()] ?? hex;
}

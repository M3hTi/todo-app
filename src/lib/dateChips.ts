import { addDays, format, nextMonday, nextSaturday } from "date-fns";

export type QuickChip = "today" | "tomorrow" | "weekend" | "nextWeek";

const FMT = "yyyy-MM-dd";

/** Resolves a quick-pick chip to a YYYY-MM-DD date string relative to `now`. */
export function quickDate(chip: QuickChip, now: Date): string {
  switch (chip) {
    case "today":
      return format(now, FMT);
    case "tomorrow":
      return format(addDays(now, 1), FMT);
    case "weekend":
      return format(nextSaturday(now), FMT);
    case "nextWeek":
      return format(nextMonday(now), FMT);
  }
}

/** The quick-pick chips, in display order. Shared by the detail panel and the
 *  task row's context menu so the two can't drift apart. */
export const DATE_CHIPS: { chip: QuickChip; label: string }[] = [
  { chip: "today", label: "Today" },
  { chip: "tomorrow", label: "Tomorrow" },
  { chip: "weekend", label: "This weekend" },
  { chip: "nextWeek", label: "Next week" },
];

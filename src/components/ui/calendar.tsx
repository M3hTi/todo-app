import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/** Theme-matched calendar built on react-day-picker v9. */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-0", className)}
      classNames={{
        months: "flex flex-col",
        month: "flex flex-col gap-2",
        month_caption: "flex justify-center pt-1 pb-2 relative items-center h-8",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-0 top-0 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-0 top-0 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_grid: "border-collapse",
        weekdays: "grid grid-cols-7",
        weekday: "flex h-8 w-10 items-center justify-center text-[11px] font-medium text-muted-foreground",
        week: "grid grid-cols-7",
        day: "flex h-10 w-10 items-center justify-center p-0 text-center text-sm relative [&:has([aria-selected])]:rounded-md",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 p-0 font-normal aria-selected:opacity-100",
        ),
        selected: "bg-primary text-primary-foreground rounded-md hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground rounded-md",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}

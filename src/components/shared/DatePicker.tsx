import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { quickDate, type QuickChip } from "@/lib/dateChips";
import { cn } from "@/lib/utils";

const CHIPS: { chip: QuickChip; label: string }[] = [
  { chip: "today", label: "Today" },
  { chip: "tomorrow", label: "Tomorrow" },
  { chip: "weekend", label: "This weekend" },
  { chip: "nextWeek", label: "Next week" },
];

interface DatePickerProps {
  value: string | undefined; // YYYY-MM-DD
  onChange: (value: string | undefined) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

/** Calendar-popover date field with quick chips. Emits YYYY-MM-DD or undefined. */
export function DatePicker({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  const choose = (next: string | undefined): void => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(parseISO(value), "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[316px] rounded-xl border-[var(--border)] bg-[var(--surface-raised)] p-[18px] shadow-[0_8px_28px_rgba(0,0,0,.45)]"
        align="end"
        collisionPadding={12}
      >
        <div className="mb-3 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-3">
          {CHIPS.map(({ chip, label }) => (
            <Button
              key={chip}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => choose(quickDate(chip, new Date()))}
            >
              {label}
            </Button>
          ))}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => choose(undefined)}
            >
              Clear
            </Button>
          )}
        </div>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(day) => choose(day ? format(day, "yyyy-MM-dd") : undefined)}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

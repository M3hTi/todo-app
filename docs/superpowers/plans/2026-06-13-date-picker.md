# Calendar Date Picker — Implementation Plan (3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `<input type="date">` fields with a themed calendar popover plus quick chips (Today / Tomorrow / This weekend / Next week).

**Architecture:** Add `react-day-picker` (calendar) and `@radix-ui/react-popover` (popover) as shadcn-style primitives under `src/components/ui/`. A `DatePicker` wrapper composes the popover + calendar + quick chips and emits a `YYYY-MM-DD` string (or `undefined`), so the existing zod schema, DB shape, and recurrence logic are unchanged. Quick-chip date math lives in a pure, unit-tested helper.

**Tech Stack:** React 18 + TypeScript (strict), Radix UI, react-day-picker v9, date-fns v4, Tailwind + CSS-variable theme tokens, Vitest.

**Prerequisites & order:** Execute AFTER Plan 2 (reminder rework). This plan edits `TaskForm.tsx` and `TaskDetail.tsx`, whose due-date handlers were updated in Plan 2 (Task 6) to re-anchor relative reminders — this plan swaps the input *element* and routes its value into those same handlers. Work continues on branch `feature/tray-window-lifecycle`. All commands run from `d:\ToDo App\todo-app`.

**Scope / deferred:**
- **Due-date fields and the recurrence "Until" field** get the calendar popover. The **due-time** field stays the native `<input type="time">` — the time picker was not the friction point and a native time input is fine. (A time popover is an easy later add-on.)
- The **absolute-reminder datetime** input added in Plan 2 stays a native `datetime-local` input; it's out of this plan's scope.

---

### Task 1: Add dependencies + Popover primitive

**Files:**
- Modify: `package.json` (via npm install)
- Create: `src/components/ui/popover.tsx`

- [ ] **Step 1: Install**

Run:
```bash
npm install react-day-picker @radix-ui/react-popover
```

- [ ] **Step 2: Create the Popover primitive**

Create `src/components/ui/popover.tsx`:

```tsx
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes (new primitive, not yet used).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/popover.tsx
git commit -m "build: add react-day-picker + radix popover; add Popover primitive"
```

---

### Task 2: Calendar primitive

**Files:**
- Create: `src/components/ui/calendar.tsx`

- [ ] **Step 1: Create the Calendar primitive (react-day-picker v9, themed with Tailwind tokens)**

Create `src/components/ui/calendar.tsx`:

```tsx
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
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center h-9",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 top-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 top-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:rounded-md",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
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
```

Note: these `classNames` keys (`month_caption`, `button_previous`, `day_button`, `Chevron` component, etc.) are the react-day-picker **v9** API. If `npm install` resolved a different major version, `npm run build` / runtime rendering will reveal it — confirm the key names on the react-day-picker v9 docs and adjust. The structure stays the same.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/calendar.tsx
git commit -m "feat(ui): add themed Calendar primitive (react-day-picker v9)"
```

---

### Task 3: Quick-chip date math (pure, TDD) + DatePicker

**Files:**
- Create: `src/lib/dateChips.ts`
- Test: `src/lib/dateChips.test.ts`
- Create: `src/components/shared/DatePicker.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dateChips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDay, parseISO } from "date-fns";
import { quickDate } from "./dateChips";

// 2026-06-17 is a Wednesday.
const NOW = new Date("2026-06-17T12:00:00");

describe("quickDate", () => {
  it("today returns today's date", () => {
    expect(quickDate("today", NOW)).toBe("2026-06-17");
  });
  it("tomorrow returns the next day", () => {
    expect(quickDate("tomorrow", NOW)).toBe("2026-06-18");
  });
  it("weekend returns a future Saturday", () => {
    const d = quickDate("weekend", NOW);
    expect(getDay(parseISO(d))).toBe(6); // Saturday
    expect(d > "2026-06-17").toBe(true);
  });
  it("nextWeek returns a future Monday", () => {
    const d = quickDate("nextWeek", NOW);
    expect(getDay(parseISO(d))).toBe(1); // Monday
    expect(d > "2026-06-17").toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test`
Expected: FAIL — module `./dateChips` not found.

- [ ] **Step 3: Implement `dateChips.ts`**

Create `src/lib/dateChips.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test`
Expected: PASS — `dateChips` + existing `reminder`/`tray` suites green.

- [ ] **Step 5: Create the `DatePicker` component**

Create `src/components/shared/DatePicker.tsx`:

```tsx
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
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-wrap gap-1 border-b p-2">
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
```

Note: `autoFocus` is react-day-picker v9's replacement for v8's `initialFocus`. If the installed version differs, adjust.

- [ ] **Step 6: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dateChips.ts src/lib/dateChips.test.ts src/components/shared/DatePicker.tsx
git commit -m "feat(ui): DatePicker with quick chips + tested chip date math"
```

---

### Task 4: Swap the native date inputs for `DatePicker`

**Files:**
- Modify: `src/components/tasks/TaskForm.tsx` (due-date field + recurrence "Until" field)
- Modify: `src/components/tasks/TaskDetail.tsx` (due-date field)

- [ ] **Step 1: TaskForm — due date**

In `src/components/tasks/TaskForm.tsx`, add the import:
```ts
import { DatePicker } from "@/components/shared/DatePicker";
```
Replace the due-date `<Input type="date" ...>` (the one with `id="task-due-date"`) with:
```tsx
              <DatePicker
                id="task-due-date"
                ariaLabel="Due date"
                value={dueDate || undefined}
                onChange={(value) => setValue("dueDate", value ?? "", { shouldValidate: true })}
              />
```
(`dueDate` is already `watch("dueDate")`; the time field's `disabled={!dueDate}` keeps working.)

- [ ] **Step 2: TaskForm — recurrence "Until"**

In the `RecurrenceEditor` (same file), replace the "Until" `<Input type="date" ...>` (the one with `aria-label="Repeat end date"`) with:
```tsx
            <DatePicker
              ariaLabel="Repeat end date"
              placeholder="No end date"
              className="h-8 w-44"
              value={value.endDate ?? undefined}
              onChange={(next) => {
                const { endDate: _endDate, ...rest } = value;
                onChange(next ? { ...rest, endDate: next } : rest);
              }}
            />
```

- [ ] **Step 3: TaskDetail — due date**

In `src/components/tasks/TaskDetail.tsx`, add the import:
```ts
import { DatePicker } from "@/components/shared/DatePicker";
```
Replace the due-date `<Input type="date" id="detail-due-date" ...>` element with a `DatePicker` that routes into the same due-date handler logic established in Plan 2 (re-anchor relative reminder on change, clear on removal). Replace the `<Input ...>` with:
```tsx
            <DatePicker
              id="detail-due-date"
              ariaLabel="Due date"
              value={task.dueDate}
              onChange={(value) => {
                const newDue = value ?? null;
                const patch: Parameters<typeof updateTask>[1] = { dueDate: newDue };
                if (!newDue) {
                  patch.dueTime = null;
                  if (task.reminder?.mode === "relative") patch.reminder = null;
                } else if (task.reminder?.mode === "relative") {
                  patch.reminder = reanchorReminder(task.reminder, newDue, task.dueTime);
                }
                void save(patch);
              }}
            />
```
(This mirrors the handler written in Plan 2 Task 6, adapted from `event.target.value` to the `value` argument. `reanchorReminder` is already imported from Plan 2.)

- [ ] **Step 4: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/TaskForm.tsx src/components/tasks/TaskDetail.tsx
git commit -m "feat(ui): use calendar DatePicker for due date and recurrence end date"
```

---

### Task 5: Verification

**Files:** none.

- [ ] **Step 1: Tests + build**

Run: `npm run test` then `npm run build`
Expected: all suites pass; `tsc` + Vite build clean.

- [ ] **Step 2: Manual smoke test (human)** — pending human:
  1. New-task form: click the **Due date** field → calendar popover opens, themed for light/dark; pick a date → the field shows e.g. "Jun 20, 2026"; the Due time field enables.
  2. Quick chips: **Today / Tomorrow / This weekend / Next week** each set a sensible date and close the popover; **Clear** removes the date.
  3. Recurrence → set a repeat, then the **Until** field uses the same popover.
  4. Task detail: the **Due date** field is the popover; changing it still re-anchors a relative reminder (from Plan 2); clearing it removes the time (and a relative reminder).
  5. The chosen dates persist (reload the app) and appear correctly in list/calendar views.

- [ ] **Step 3: Final commit (if fixups needed)**

```bash
git add -A
git commit -m "test: verify calendar date picker"
```

---

## Self-Review (against design spec §5)

**Coverage:**
- Calendar popover replacing native date input → `Calendar` (Task 2) + `Popover` (Task 1) + `DatePicker` (Task 3), swapped in (Task 4). ✔
- Quick chips Today / Tomorrow / This weekend / Next week → `quickDate` + `DatePicker` chips (Task 3). ✔
- Applied to the due-date fields (TaskForm + TaskDetail) and the recurrence "Until" field → Task 4. ✔
- Output stays `YYYY-MM-DD`, so zod schema / DB / recurrence unchanged → `DatePicker` emits `YYYY-MM-DD` (Task 3). ✔
- Themed for light/dark via existing tokens → `Calendar` uses `bg-primary`/`bg-accent`/`text-muted-foreground` + `buttonVariants` (Task 2). ✔
- Time popover → intentionally deferred (documented in scope); due-time stays native. ✔ (scoped)

**Placeholder scan:** None. Every code step has complete content; the two version-note callouts (react-day-picker v9 class keys, `autoFocus`) are concrete adjustment guidance, not deferred work.

**Type/name consistency:** `quickDate`/`QuickChip` match between `dateChips.ts` (Task 3) and `DatePicker.tsx` (Task 3). `DatePicker` prop shape (`value: string | undefined`, `onChange: (value: string | undefined) => void`) is used consistently at all three call sites (Task 4). `Calendar`/`Popover`/`PopoverTrigger`/`PopoverContent` exports match their imports.

**Cross-plan dependency:** Task 4's TaskDetail edit reuses `reanchorReminder` and the due-date handler shape introduced in Plan 2 (Task 6); this plan must run after Plan 2.

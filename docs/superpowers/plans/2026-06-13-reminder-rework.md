# Reminder Rework — Implementation Plan (2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single relative-only reminder with one flexible reminder rule per task — relative ("30 min before due") OR absolute ("Jun 20, 10:00"), with an optional repeat (every 15 min … daily) that stops when the task is done or the reminder is dismissed, plus Snooze.

**Architecture:** A `Reminder` object is stored per task as a JSON blob in a new `tasks.reminder_json` column (mirroring the existing `recurring_rule_json` pattern). All scheduling math lives in a new pure module `src/lib/reminder.ts` (unit-tested). The minute-interval loop in `src/lib/reminders.ts` reads `task.reminder`, fires (native notification when the window is unfocused, in-app sonner toast with Snooze/Dismiss when focused), and advances the reminder. New settings are NOT needed.

**Tech Stack:** React 18 + TypeScript (strict), Zustand, SQLite via `@tauri-apps/plugin-sql`, `@tauri-apps/plugin-notification`, date-fns v4, Vitest.

**Prerequisites:** Plan 1 is implemented (branch `feature/tray-window-lifecycle`, Vitest configured). Work continues on that branch (or a fresh branch off it). All commands run from `d:\ToDo App\todo-app`.

**Incremental-safety note:** The new `reminder` field is added ALONGSIDE the legacy `reminderAt`/`reminderShownAt` fields; every consumer is migrated across Tasks 4–7, and the legacy fields are removed only in Task 8. This keeps `npm run build` green after every task.

**Scope / deferred:**
- **One reminder per task** (per the approved design). Not multiple.
- **No end-time or fixed-count repeat** — repeat stops only on task done/cancel or dismiss.
- **Native OS-toast action buttons** (Snooze/Dismiss on the Windows toast itself) are an OPTIONAL final task (Task 10), marked best-effort because Windows toast-action support across the plugin/WebView2 is uneven and can't be verified headlessly. The guaranteed Snooze/Dismiss paths are the in-app toast (when focused) and the task detail panel (always).

---

### Task 1: Add the `Reminder` type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the `Reminder` type and field**

In `src/types/index.ts`, add after the `Theme`/`CloseBehavior` type aliases:

```ts
export type ReminderMode = 'relative' | 'absolute';

export interface Reminder {
  mode: ReminderMode;
  minutesBefore?: number;   // relative mode: minutes before the due time
  at?: string;              // absolute mode: ISO datetime
  repeatMinutes?: number;   // undefined/0 = fire once; else repeat interval in minutes
  nextFireAt: string;       // ISO datetime of the next scheduled fire
  lastFiredAt?: string;     // ISO datetime of the most recent fire
  dismissedAt?: string;     // ISO; set on dismiss OR when a one-shot has fired — stops future fires
}
```

Then add a `reminder` field to the `Task` interface (leave the existing `reminderAt`/`reminderShownAt` lines in place for now — they are removed in Task 8):

```ts
  reminderAt?: string;        // DEPRECATED — removed in reminder-rework Task 8
  reminderShownAt?: string;   // DEPRECATED — removed in reminder-rework Task 8
  reminder?: Reminder;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes (purely additive optional field).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(reminders): add Reminder type"
```

---

### Task 2: Persist `reminder` — migration v2 + query mapping

**Files:**
- Modify: `src/lib/db.ts` (the `MIGRATIONS` array, ~line 36)
- Modify: `src/lib/queries/tasks.ts`

- [ ] **Step 1: Add migration v2**

In `src/lib/db.ts`, append a second entry to the `MIGRATIONS` array (after the version-1 object, before the closing `]`):

```ts
  {
    version: 2,
    statements: [
      `ALTER TABLE tasks ADD COLUMN reminder_json TEXT`,
      `UPDATE tasks
         SET reminder_json = json_object('mode', 'absolute', 'at', reminder_at, 'nextFireAt', reminder_at)
       WHERE reminder_at IS NOT NULL AND reminder_json IS NULL`,
      `UPDATE tasks
         SET reminder_json = json_set(reminder_json, '$.dismissedAt', reminder_shown_at)
       WHERE reminder_shown_at IS NOT NULL AND reminder_json IS NOT NULL`,
    ],
  },
```

(The legacy `reminder_at`/`reminder_shown_at` columns are left in place — SQLite column drops are risky — and simply stop being read once Task 8 lands.)

- [ ] **Step 2: Map the new column in the query layer**

In `src/lib/queries/tasks.ts`:

(a) Add to the `TaskRow` interface (after `recurring_rule_json`):
```ts
  reminder_json: string | null;
```

(b) Update the `TASK_COLUMNS` constant to include `reminder_json` (keep the legacy columns for now):
```ts
const TASK_COLUMNS =
  "id, title, description, status, priority, due_date, due_time, category_id, " +
  "reminder_at, reminder_shown_at, reminder_json, recurring_rule_json, sort_order, created_at, " +
  "updated_at, completed_at, notes";
```

(c) Add a parser next to `parseRule`:
```ts
function parseReminder(json: string | null): import("@/types").Reminder | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as import("@/types").Reminder;
  } catch {
    return undefined;
  }
}
```

(d) In `mapTask`, add the mapped field (keep the legacy `reminderAt`/`reminderShownAt` lines):
```ts
    reminder: parseReminder(row.reminder_json),
```

(e) Add `reminder` to both input types:
```ts
// in CreateTaskInput:
  reminder?: import("@/types").Reminder;
// in UpdateTaskInput:
  reminder?: import("@/types").Reminder | null;
```

(f) In `createTask`, update the INSERT. Change the column list to match `TASK_COLUMNS` (now 17 columns) and the placeholders to `$1 … $17`, inserting the `reminder_json` value right after the `reminder_shown_at` value (which stays `null`):
```ts
    await db.execute(
      `INSERT INTO tasks (${TASK_COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        input.title,
        input.description ?? null,
        input.status ?? "Not Started",
        input.priority ?? "Medium",
        input.dueDate ?? null,
        input.dueTime ?? null,
        input.categoryId ?? null,
        input.reminderAt ?? null,
        null,
        input.reminder ? JSON.stringify(input.reminder) : null,
        input.recurringRule ? JSON.stringify(input.recurringRule) : null,
        next,
        now,
        now,
        null,
        input.notes ?? null,
      ],
    );
```
And add `reminder: input.reminder,` to the returned object literal (after `reminderShownAt: undefined,`).

(g) In `updateTask`, add a set-clause for the reminder (after the `reminderShownAt` clause):
```ts
    if (patch.reminder !== undefined) {
      set("reminder_json", patch.reminder ? JSON.stringify(patch.reminder) : null);
    }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/queries/tasks.ts
git commit -m "feat(reminders): persist reminder as JSON + migrate legacy reminders"
```

---

### Task 3: Reminder scheduling helpers (pure, TDD)

**Files:**
- Create: `src/lib/reminder.ts`
- Test: `src/lib/reminder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/reminder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  advanceAfterFire,
  buildReminder,
  dismissReminder,
  isReminderDue,
  reanchorReminder,
  reminderForNextOccurrence,
  snoozeReminder,
  toDraft,
  type ReminderDraft,
} from "./reminder";
import type { Reminder } from "@/types";

const baseDraft: ReminderDraft = {
  enabled: true,
  mode: "relative",
  minutesBefore: 30,
  at: "",
  repeatMinutes: 0,
};

describe("buildReminder", () => {
  it("returns undefined when disabled", () => {
    expect(buildReminder({ ...baseDraft, enabled: false }, "2026-06-20", "10:00")).toBeUndefined();
  });

  it("computes a relative reminder as due minus minutesBefore", () => {
    const r = buildReminder(baseDraft, "2026-06-20", "10:00");
    expect(r?.mode).toBe("relative");
    expect(r?.minutesBefore).toBe(30);
    // 10:00 local minus 30 min = 09:30 local
    expect(r?.nextFireAt).toBe(new Date("2026-06-20T09:30:00").toISOString());
  });

  it("relative reminder needs a due date", () => {
    expect(buildReminder(baseDraft, undefined, undefined)).toBeUndefined();
  });

  it("defaults a missing due time to 09:00 for relative reminders", () => {
    const r = buildReminder({ ...baseDraft, minutesBefore: 0 }, "2026-06-20", "");
    expect(r?.nextFireAt).toBe(new Date("2026-06-20T09:00:00").toISOString());
  });

  it("builds an absolute reminder from the local datetime", () => {
    const r = buildReminder(
      { ...baseDraft, mode: "absolute", at: "2026-06-20T15:00" },
      undefined,
      undefined,
    );
    expect(r?.mode).toBe("absolute");
    expect(r?.at).toBe(new Date("2026-06-20T15:00").toISOString());
    expect(r?.nextFireAt).toBe(new Date("2026-06-20T15:00").toISOString());
  });

  it("includes repeatMinutes only when > 0", () => {
    expect(buildReminder({ ...baseDraft, repeatMinutes: 0 }, "2026-06-20", "10:00")?.repeatMinutes).toBeUndefined();
    expect(buildReminder({ ...baseDraft, repeatMinutes: 60 }, "2026-06-20", "10:00")?.repeatMinutes).toBe(60);
  });
});

describe("toDraft", () => {
  it("returns a disabled default for no reminder", () => {
    expect(toDraft(undefined)).toMatchObject({ enabled: false, mode: "relative" });
  });

  it("round-trips a relative reminder", () => {
    const r: Reminder = { mode: "relative", minutesBefore: 15, repeatMinutes: 60, nextFireAt: "2026-06-20T09:45:00.000Z" };
    expect(toDraft(r)).toMatchObject({ enabled: true, mode: "relative", minutesBefore: 15, repeatMinutes: 60 });
  });
});

describe("isReminderDue", () => {
  const now = "2026-06-20T10:00:00.000Z";
  const due: Reminder = { mode: "absolute", at: "2026-06-20T09:00:00.000Z", nextFireAt: "2026-06-20T09:00:00.000Z" };

  it("is due when nextFireAt has passed and task is open", () => {
    expect(isReminderDue(due, "Not Started", now)).toBe(true);
  });
  it("is not due when dismissed", () => {
    expect(isReminderDue({ ...due, dismissedAt: now }, "Not Started", now)).toBe(false);
  });
  it("is not due for completed/cancelled tasks", () => {
    expect(isReminderDue(due, "Completed", now)).toBe(false);
    expect(isReminderDue(due, "Cancelled", now)).toBe(false);
  });
  it("is not due before nextFireAt", () => {
    expect(isReminderDue({ ...due, nextFireAt: "2026-06-20T11:00:00.000Z" }, "Not Started", now)).toBe(false);
  });
  it("is not due when there is no reminder", () => {
    expect(isReminderDue(undefined, "Not Started", now)).toBe(false);
  });
});

describe("advanceAfterFire", () => {
  const now = "2026-06-20T10:00:00.000Z";
  it("dismisses a one-shot reminder", () => {
    const r: Reminder = { mode: "absolute", nextFireAt: now };
    const next = advanceAfterFire(r, now);
    expect(next.lastFiredAt).toBe(now);
    expect(next.dismissedAt).toBe(now);
  });
  it("reschedules a repeating reminder from now", () => {
    const r: Reminder = { mode: "absolute", nextFireAt: now, repeatMinutes: 15 };
    const next = advanceAfterFire(r, now);
    expect(next.dismissedAt).toBeUndefined();
    expect(next.nextFireAt).toBe(new Date("2026-06-20T10:15:00.000Z").toISOString());
  });
});

describe("snoozeReminder / dismissReminder", () => {
  const now = "2026-06-20T10:00:00.000Z";
  it("snooze moves nextFireAt 15 minutes out and un-dismisses", () => {
    const r: Reminder = { mode: "absolute", nextFireAt: now, dismissedAt: now };
    const s = snoozeReminder(r, now);
    expect(s.dismissedAt).toBeUndefined();
    expect(s.nextFireAt).toBe(new Date("2026-06-20T10:15:00.000Z").toISOString());
  });
  it("dismiss sets dismissedAt", () => {
    const r: Reminder = { mode: "absolute", nextFireAt: now };
    expect(dismissReminder(r, now).dismissedAt).toBe(now);
  });
});

describe("reanchorReminder / reminderForNextOccurrence", () => {
  it("re-anchors a relative reminder to a new due date and resets state", () => {
    const r: Reminder = { mode: "relative", minutesBefore: 30, nextFireAt: "2026-06-20T09:30:00.000Z", lastFiredAt: "x", dismissedAt: "y" };
    const next = reanchorReminder(r, "2026-06-27", "10:00");
    expect(next.nextFireAt).toBe(new Date("2026-06-27T09:30:00").toISOString());
    expect(next.lastFiredAt).toBeUndefined();
    expect(next.dismissedAt).toBeUndefined();
  });
  it("drops absolute reminders for the next occurrence", () => {
    const r: Reminder = { mode: "absolute", at: "2026-06-20T09:00:00.000Z", nextFireAt: "2026-06-20T09:00:00.000Z" };
    expect(reminderForNextOccurrence(r, "2026-06-27", "10:00")).toBeUndefined();
  });
  it("re-anchors relative reminders for the next occurrence", () => {
    const r: Reminder = { mode: "relative", minutesBefore: 60, nextFireAt: "2026-06-20T09:00:00.000Z" };
    expect(reminderForNextOccurrence(r, "2026-06-27", "10:00")?.nextFireAt).toBe(
      new Date("2026-06-27T09:00:00").toISOString(),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test`
Expected: FAIL — module `./reminder` not found / no such exports.

- [ ] **Step 3: Implement `reminder.ts`**

Create `src/lib/reminder.ts`:

```ts
import { addMinutes, format, parseISO, subMinutes } from "date-fns";
import type { Reminder, ReminderMode, TaskStatus } from "@/types";

export const SNOOZE_MINUTES = 15;

/** Editor state for the reminder UI; converted to/from a stored Reminder. */
export interface ReminderDraft {
  enabled: boolean;
  mode: ReminderMode;
  minutesBefore: number; // relative
  at: string;            // absolute, datetime-local string ("yyyy-MM-ddTHH:mm") or ""
  repeatMinutes: number; // 0 = no repeat
}

export const NO_REMINDER_DRAFT: ReminderDraft = {
  enabled: false,
  mode: "relative",
  minutesBefore: 15,
  at: "",
  repeatMinutes: 0,
};

/** Formats a stored ISO datetime as a datetime-local input value. */
export function toDateTimeLocal(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

/** Computes the next fire time for a draft, or undefined if it can't fire yet. */
export function computeNextFireAt(
  draft: ReminderDraft,
  dueDate: string | undefined,
  dueTime: string | undefined,
): string | undefined {
  if (draft.mode === "absolute") {
    return draft.at ? new Date(draft.at).toISOString() : undefined;
  }
  if (!dueDate) return undefined;
  const base = parseISO(`${dueDate}T${dueTime || "09:00"}`);
  return subMinutes(base, draft.minutesBefore).toISOString();
}

/** Builds a Reminder from editor state; undefined when disabled or not computable. */
export function buildReminder(
  draft: ReminderDraft,
  dueDate: string | undefined,
  dueTime: string | undefined,
): Reminder | undefined {
  if (!draft.enabled) return undefined;
  const nextFireAt = computeNextFireAt(draft, dueDate, dueTime);
  if (!nextFireAt) return undefined;

  const reminder: Reminder = { mode: draft.mode, nextFireAt };
  if (draft.mode === "relative") {
    reminder.minutesBefore = draft.minutesBefore;
  } else {
    reminder.at = new Date(draft.at).toISOString();
  }
  if (draft.repeatMinutes > 0) reminder.repeatMinutes = draft.repeatMinutes;
  return reminder;
}

/** Editor state from a stored reminder (or the disabled default). */
export function toDraft(reminder: Reminder | undefined): ReminderDraft {
  if (!reminder) return { ...NO_REMINDER_DRAFT };
  return {
    enabled: true,
    mode: reminder.mode,
    minutesBefore: reminder.minutesBefore ?? 15,
    at: reminder.at ? toDateTimeLocal(reminder.at) : "",
    repeatMinutes: reminder.repeatMinutes ?? 0,
  };
}

export function isReminderDue(
  reminder: Reminder | undefined,
  status: TaskStatus,
  nowIso: string,
): boolean {
  if (!reminder) return false;
  if (reminder.dismissedAt !== undefined) return false;
  if (status === "Completed" || status === "Cancelled") return false;
  return reminder.nextFireAt <= nowIso;
}

/** After a fire: repeat → reschedule from now; one-shot → mark dismissed (done). */
export function advanceAfterFire(reminder: Reminder, nowIso: string): Reminder {
  const fired: Reminder = { ...reminder, lastFiredAt: nowIso };
  if (reminder.repeatMinutes && reminder.repeatMinutes > 0) {
    fired.nextFireAt = addMinutes(new Date(nowIso), reminder.repeatMinutes).toISOString();
    fired.dismissedAt = undefined;
  } else {
    fired.dismissedAt = nowIso;
  }
  return fired;
}

export function snoozeReminder(
  reminder: Reminder,
  nowIso: string,
  minutes = SNOOZE_MINUTES,
): Reminder {
  return {
    ...reminder,
    dismissedAt: undefined,
    nextFireAt: addMinutes(new Date(nowIso), minutes).toISOString(),
  };
}

export function dismissReminder(reminder: Reminder, nowIso: string): Reminder {
  return { ...reminder, dismissedAt: nowIso };
}

/** Re-anchors a relative reminder to a new due date/time, resetting fired/dismissed state. */
export function reanchorReminder(
  reminder: Reminder,
  dueDate: string,
  dueTime: string | undefined,
): Reminder {
  if (reminder.mode !== "relative" || reminder.minutesBefore === undefined) return reminder;
  const base = parseISO(`${dueDate}T${dueTime || "09:00"}`);
  const next: Reminder = {
    mode: "relative",
    minutesBefore: reminder.minutesBefore,
    nextFireAt: subMinutes(base, reminder.minutesBefore).toISOString(),
  };
  if (reminder.repeatMinutes) next.repeatMinutes = reminder.repeatMinutes;
  return next;
}

/** Reminder for a recurring task's next occurrence: relative re-anchors; absolute is dropped. */
export function reminderForNextOccurrence(
  reminder: Reminder | undefined,
  nextDueDate: string,
  dueTime: string | undefined,
): Reminder | undefined {
  if (!reminder || reminder.mode === "absolute") return undefined;
  return reanchorReminder(reminder, nextDueDate, dueTime);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test`
Expected: PASS — all `reminder` tests plus the existing `tray` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminder.ts src/lib/reminder.test.ts
git commit -m "feat(reminders): pure reminder scheduling helpers with tests"
```

---

### Task 4: Rework the reminder loop

**Files:**
- Modify (replace contents): `src/lib/reminders.ts`

- [ ] **Step 1: Replace `reminders.ts`**

Replace the entire contents of `src/lib/reminders.ts` with:

```ts
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import type { Task } from "@/types";
import { useTaskStore } from "@/store/useTaskStore";
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

/** Looks up the freshest copy of a task (its reminder may have changed). */
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
 * advances the reminder (repeat → reschedule; one-shot → done). Returns a
 * cleanup function that stops the loop.
 */
export function startReminderLoop(intervalMs = 60_000): () => void {
  let cancelled = false;

  const tick = async (): Promise<void> => {
    if (cancelled) return;
    const store = useTaskStore.getState();
    const nowIso = new Date().toISOString();
    const due = store.tasks.filter((task) => isReminderDue(task.reminder, task.status, nowIso));
    if (due.length === 0) return;

    const allowed = await canNotify();
    for (const task of due) {
      if (cancelled) return;
      if (!task.reminder) continue;
      if (document.hasFocus()) {
        showInAppReminder(task);
      } else if (allowed) {
        sendNotification({ title: task.title, body: notificationBody(task) });
      }
      await store.updateTask(task.id, { reminder: advanceAfterFire(task.reminder, nowIso) });
    }
  };

  const intervalId = window.setInterval(() => void tick(), intervalMs);
  void tick();

  return () => {
    cancelled = true;
    window.clearInterval(intervalId);
  };
}
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass (the loop now reads `task.reminder`; legacy fields are untouched and still present).

- [ ] **Step 3: Commit**

```bash
git add src/lib/reminders.ts
git commit -m "feat(reminders): loop fires the new reminder model with snooze/dismiss"
```

---

### Task 5: `ReminderEditor` component + integrate into TaskForm and TaskDetail

**Files:**
- Create: `src/components/tasks/ReminderEditor.tsx`
- Modify: `src/components/tasks/TaskForm.tsx`
- Modify: `src/components/tasks/TaskDetail.tsx`

- [ ] **Step 1: Create `ReminderEditor.tsx`**

Create `src/components/tasks/ReminderEditor.tsx`:

```tsx
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReminderDraft } from "@/lib/reminder";

const MINUTES_OPTIONS = [
  { value: 0, label: "At due time" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
] as const;

const REPEAT_OPTIONS = [
  { value: 0, label: "Don't repeat" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 1440, label: "Every day" },
] as const;

type WhenValue = "none" | "relative" | "absolute";

interface ReminderEditorProps {
  value: ReminderDraft;
  dueDate: string | undefined;
  dueTime: string | undefined;
  onChange: (draft: ReminderDraft) => void;
}

/** Controlled editor for a task's single flexible reminder (relative or absolute, optional repeat). */
export function ReminderEditor({ value, dueDate, dueTime, onChange }: ReminderEditorProps) {
  const when: WhenValue = !value.enabled ? "none" : value.mode;
  const relativeUnavailable = !dueDate;

  const setWhen = (next: WhenValue): void => {
    if (next === "none") {
      onChange({ ...value, enabled: false });
    } else {
      onChange({ ...value, enabled: true, mode: next });
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <Select value={when} onValueChange={(next) => setWhen(next as WhenValue)}>
        <SelectTrigger aria-label="Reminder">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No reminder</SelectItem>
          <SelectItem value="relative" disabled={relativeUnavailable}>
            Before the due time
          </SelectItem>
          <SelectItem value="absolute">At a specific date &amp; time</SelectItem>
        </SelectContent>
      </Select>

      {value.enabled && value.mode === "relative" && (
        <Select
          value={String(value.minutesBefore)}
          onValueChange={(minutes) => onChange({ ...value, minutesBefore: Number(minutes) })}
        >
          <SelectTrigger aria-label="Remind me">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.enabled && value.mode === "absolute" && (
        <Input
          type="datetime-local"
          aria-label="Reminder date and time"
          value={value.at}
          onChange={(event) => onChange({ ...value, at: event.target.value })}
        />
      )}

      {value.enabled && (
        <Select
          value={String(value.repeatMinutes)}
          onValueChange={(repeat) => onChange({ ...value, repeatMinutes: Number(repeat) })}
        >
          <SelectTrigger aria-label="Repeat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPEAT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.enabled && value.mode === "relative" && relativeUnavailable && (
        <p className="text-xs text-muted-foreground">Set a due date to use a "before due" reminder.</p>
      )}
      {value.enabled && (
        <p className="text-xs text-muted-foreground">
          Repeats stop when the task is completed or you dismiss the reminder.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into `TaskForm.tsx`**

In `src/components/tasks/TaskForm.tsx`:

(a) Remove the now-unused `computeReminderAt` function (lines ~67-76) and the `REMINDER_OPTIONS` const (lines ~44-52). Remove `parseISO, subMinutes` from the `date-fns` import (verify they are not used elsewhere in the file — they are only used by `computeReminderAt`). Add imports:
```ts
import { ReminderEditor } from "@/components/tasks/ReminderEditor";
import { buildReminder, NO_REMINDER_DRAFT, type ReminderDraft } from "@/lib/reminder";
```

(b) Remove `reminderMinutes: z.string(),` from `taskFormSchema`.

(c) Add reminder draft state next to `recurringRule` state (~line 87):
```ts
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft>(NO_REMINDER_DRAFT);
```

(d) In the `open` effect reset (~line 101-113), replace the reminder-related reset. After `setRecurringRule(undefined);` add:
```ts
      setReminderDraft(
        settings.defaultReminderMinutesBefore > 0
          ? { ...NO_REMINDER_DRAFT, enabled: true, minutesBefore: settings.defaultReminderMinutesBefore }
          : { ...NO_REMINDER_DRAFT },
      );
```

(e) Remove `const reminderMinutes = watch("reminderMinutes");` (~line 119).

(f) In `onSubmit`, replace the `reminderAt:` line with:
```ts
        reminder: buildReminder(reminderDraft, values.dueDate || undefined, values.dueTime || undefined),
```

(g) Replace the entire "Reminder" `<div>` block (the `<Label>Reminder</Label>` + the reminder `<Select>` ~lines 247-267) with:
```tsx
          <div className="space-y-1.5">
            <Label>Reminder</Label>
            <ReminderEditor
              value={reminderDraft}
              dueDate={dueDate || undefined}
              dueTime={watch("dueTime") || undefined}
              onChange={setReminderDraft}
            />
          </div>
```

(h) Update `makeDefaults` to drop `reminderMinutes` from its return object and signature (remove the `defaultReminderMinutesBefore` parameter and the `reminderMinutes` field). Update the two call sites accordingly (`useForm` defaultValues and the `open` effect `reset(...)`).

- [ ] **Step 3: Integrate into `TaskDetail.tsx`**

In `src/components/tasks/TaskDetail.tsx`:

(a) Add imports:
```ts
import { ReminderEditor } from "@/components/tasks/ReminderEditor";
import { buildReminder, dismissReminder, snoozeReminder, toDraft } from "@/lib/reminder";
import { Button } from "@/components/ui/button";
```
(`Button` is already imported — keep just one import.)

(b) Replace the "Reminder" block (the `<Label htmlFor="detail-reminder">` + the `datetime-local` `<Input>`, ~lines 215-230) with:
```tsx
        <div className="space-y-1.5">
          <Label>Reminder</Label>
          <ReminderEditor
            value={toDraft(task.reminder)}
            dueDate={task.dueDate}
            dueTime={task.dueTime}
            onChange={(draft) =>
              void save({ reminder: buildReminder(draft, task.dueDate, task.dueTime) ?? null })
            }
          />
          {task.reminder && !task.reminder.dismissedAt && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  task.reminder &&
                  void save({ reminder: snoozeReminder(task.reminder, new Date().toISOString()) })
                }
              >
                Snooze 15m
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  task.reminder &&
                  void save({ reminder: dismissReminder(task.reminder, new Date().toISOString()) })
                }
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
```

(c) In the due-date `onChange` (~line 195-200), the legacy `reminderAt: null` clear is removed/handled in Task 6 — leave it for now (it still compiles since `reminderAt` exists until Task 8).

- [ ] **Step 4: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tasks/ReminderEditor.tsx src/components/tasks/TaskForm.tsx src/components/tasks/TaskDetail.tsx
git commit -m "feat(reminders): ReminderEditor in task form and detail, with snooze/dismiss"
```

---

### Task 6: Recurrence roll-forward + due-date re-anchoring

**Files:**
- Modify: `src/hooks/useTasks.ts`
- Modify: `src/components/tasks/TaskDetail.tsx`

- [ ] **Step 1: Rework recurrence roll-forward in `useTasks.ts`**

Replace the `date-fns` import line (it imported `differenceInMinutes, parseISO, subMinutes` for the old `shiftReminder`):
```ts
import type { Task } from "@/types";
import { selectFilteredTasks, useTaskStore } from "@/store/useTaskStore";
import { getNextDueDate, isRuleExpired } from "@/lib/recurrence";
import { reminderForNextOccurrence } from "@/lib/reminder";
```
(Remove the `import { differenceInMinutes, parseISO, subMinutes } from "date-fns";` line entirely — it is now unused.)

In `doToggle`, in the recurring branch, replace the `reminderAt`/`reminderShownAt` patch lines with `reminder`:
```ts
    await store.updateTask(task.id, {
      status: "Not Started",
      dueDate: nextDueDate,
      completedAt: null,
      reminder: reminderForNextOccurrence(task.reminder, nextDueDate, task.dueTime),
    });
    return;
```

Delete the entire `shiftReminder` function (~lines 56-63).

- [ ] **Step 2: Re-anchor / clear the reminder when the due date changes in `TaskDetail.tsx`**

In `src/components/tasks/TaskDetail.tsx`, add the import:
```ts
import { reanchorReminder } from "@/lib/reminder";
```
(Combine with the existing `@/lib/reminder` import from Task 5 into one line: `import { buildReminder, dismissReminder, reanchorReminder, snoozeReminder, toDraft } from "@/lib/reminder";`)

Replace the due-date `<Input>` `onChange` (~lines 195-200) with logic that re-anchors a relative reminder to the new date and clears a relative reminder when the date is removed (absolute reminders are independent of the due date and are left alone):
```tsx
              onChange={(event) => {
                const newDue = event.target.value || null;
                const patch: Parameters<typeof updateTask>[1] = { dueDate: newDue };
                if (!newDue) {
                  patch.dueTime = null;
                  if (task.reminder?.mode === "relative") patch.reminder = null;
                } else if (task.reminder?.mode === "relative") {
                  patch.reminder = reanchorReminder(task.reminder, newDue, task.dueTime);
                }
                void save(patch);
              }}
```

Also update the due-time `<Input>` `onChange` (~line 210) to re-anchor a relative reminder when the time changes:
```tsx
              onChange={(event) => {
                const newTime = event.target.value || null;
                const patch: Parameters<typeof updateTask>[1] = { dueTime: newTime };
                if (task.dueDate && task.reminder?.mode === "relative") {
                  patch.reminder = reanchorReminder(task.reminder, task.dueDate, newTime ?? undefined);
                }
                void save(patch);
              }}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTasks.ts src/components/tasks/TaskDetail.tsx
git commit -m "feat(reminders): re-anchor relative reminders on recurrence and due-date change"
```

---

### Task 7: Update export / import

**Files:**
- Modify: `src/features/settings/SettingsView.tsx`

- [ ] **Step 1: Add a reminder schema and accept it in `taskSchema`**

In `src/features/settings/SettingsView.tsx`, add a `reminderSchema` before `taskSchema` (after `recurringRuleSchema`):
```ts
const reminderSchema = z.object({
  mode: z.enum(["relative", "absolute"]),
  minutesBefore: z.number().optional(),
  at: z.string().optional(),
  repeatMinutes: z.number().optional(),
  nextFireAt: z.string(),
  lastFiredAt: z.string().optional(),
  dismissedAt: z.string().optional(),
});
```
Add `reminder` to `taskSchema` (keep `reminderAt`/`reminderShownAt` optional so OLD export files still import):
```ts
  reminderAt: z.string().optional(),
  reminderShownAt: z.string().optional(),
  reminder: reminderSchema.optional(),
```

- [ ] **Step 2: Write `reminder_json` on import (with legacy fallback)**

In `importData`, update the tasks INSERT. Change the column list and placeholders to include `reminder_json` and build the value from the new `reminder` field, falling back to a legacy absolute reminder when only `reminderAt` is present:
```ts
      const reminderJson = task.reminder
        ? JSON.stringify(task.reminder)
        : task.reminderAt
          ? JSON.stringify({
              mode: "absolute",
              at: task.reminderAt,
              nextFireAt: task.reminderAt,
              ...(task.reminderShownAt ? { dismissedAt: task.reminderShownAt } : {}),
            })
          : null;

      await db.execute(
        `INSERT INTO tasks (id, title, description, status, priority, due_date, due_time,
          category_id, reminder_json, recurring_rule_json, sort_order,
          created_at, updated_at, completed_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          task.id,
          task.title,
          task.description ?? null,
          task.status,
          task.priority,
          task.dueDate ?? null,
          task.dueTime ?? null,
          categoryId,
          reminderJson,
          task.recurringRule ? JSON.stringify(task.recurringRule) : null,
          task.sortOrder,
          task.createdAt,
          task.updatedAt,
          task.completedAt ?? null,
          task.notes ?? null,
        ],
      );
```
(Export needs no code change — it serializes the in-memory `Task` objects, which now carry `reminder` and no longer carry `reminderAt`/`reminderShownAt` after Task 8.)

- [ ] **Step 3: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsView.tsx
git commit -m "feat(reminders): export/import the new reminder field with legacy fallback"
```

---

### Task 8: Remove the legacy reminder fields

Now that every consumer reads `reminder`, drop the deprecated `reminderAt`/`reminderShownAt` from the TypeScript surface. (The DB columns stay; they are simply never read or written.)

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/queries/tasks.ts`
- Modify: `src/features/settings/SettingsView.tsx`

- [ ] **Step 1: Remove from the `Task` type**

In `src/types/index.ts`, delete the two deprecated lines:
```ts
  reminderAt?: string;        // DEPRECATED — removed in reminder-rework Task 8
  reminderShownAt?: string;   // DEPRECATED — removed in reminder-rework Task 8
```

- [ ] **Step 2: Remove from the query layer**

In `src/lib/queries/tasks.ts`:
- Remove `reminder_at` and `reminder_shown_at` from the `TaskRow` interface.
- Remove them from `TASK_COLUMNS` (now: `... category_id, reminder_json, recurring_rule_json, ...`).
- Remove `reminderAt: row.reminder_at ?? undefined,` and `reminderShownAt: row.reminder_shown_at ?? undefined,` from `mapTask`.
- Remove `reminderAt?: string;` from `CreateTaskInput` and `reminderAt?: string | null;` / `reminderShownAt?: string | null;` from `UpdateTaskInput`.
- In `createTask`: the INSERT now uses the shortened `TASK_COLUMNS` (15 columns). Update placeholders to `$1 … $15` and remove the `input.reminderAt ?? null,` and the standalone `null,` (the old `reminder_shown_at` value). The values array becomes:
```ts
      [
        id,
        input.title,
        input.description ?? null,
        input.status ?? "Not Started",
        input.priority ?? "Medium",
        input.dueDate ?? null,
        input.dueTime ?? null,
        input.categoryId ?? null,
        input.reminder ? JSON.stringify(input.reminder) : null,
        input.recurringRule ? JSON.stringify(input.recurringRule) : null,
        next,
        now,
        now,
        null,
        input.notes ?? null,
      ],
```
- In `createTask`'s returned object, remove `reminderAt: input.reminderAt,` and `reminderShownAt: undefined,` (keep `reminder: input.reminder,`).
- In `updateTask`, remove the `if (patch.reminderAt !== undefined) ...` and `if (patch.reminderShownAt !== undefined) ...` set-clauses (keep the `reminder` clause).

- [ ] **Step 3: Remove legacy fields from the export schema**

In `src/features/settings/SettingsView.tsx`, remove `reminderAt: z.string().optional(),` and `reminderShownAt: z.string().optional(),` from `taskSchema` IF you want exports to stop carrying them. **Keep them** if you still want to import old files — but since the import code reads `task.reminderAt` as a fallback (Task 7), the schema entries must remain for those old files to parse. **Decision: keep them in the schema** (they are harmless optional fields and preserve backward-compatible import). No change in this step beyond confirming the import fallback still type-checks now that `Task.reminderAt` is gone — the fallback reads `task.reminderAt` off the *parsed export object* (typed by `exportFileSchema`, not `Task`), so it remains valid.

- [ ] **Step 4: Verify build + tests**

Run: `npm run build` then `npm run test`
Expected: both pass with zero references to `reminderAt`/`reminderShownAt` remaining in `src/` except the export-file schema/import fallback in `SettingsView.tsx`.

Verify no stragglers:
```bash
git grep -n "reminderAt\|reminderShownAt" -- "src/*"
```
Expected: matches ONLY in `src/features/settings/SettingsView.tsx` (the export-file schema + import fallback).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/queries/tasks.ts src/features/settings/SettingsView.tsx
git commit -m "refactor(reminders): drop deprecated reminderAt/reminderShownAt fields"
```

---

### Task 9: Verification

**Files:** none.

- [ ] **Step 1: Unit tests**

Run: `npm run test`
Expected: `reminder` + `tray` suites all PASS.

- [ ] **Step 2: Build + Rust check**

Run: `npm run build` then `cd src-tauri && cargo check`
Expected: both succeed (no Rust changes in this plan, so cargo check is incremental/clean).

- [ ] **Step 3: Manual smoke test (human)** — cannot be automated; record as pending for the human:
  1. Create a task due today in ~2 minutes with "Before the due time → At due time" + "Every 15 minutes"; with the window focused, confirm the in-app toast appears at the fire time with Snooze/Dismiss; Snooze pushes it 15 min; Dismiss stops it.
  2. Minimize to tray; confirm a native OS notification fires when unfocused.
  3. Set an **absolute** reminder for ~1 minute out on a task with no due date; confirm it fires.
  4. Complete a recurring task with a relative reminder; confirm the rolled-forward occurrence keeps the reminder re-anchored to the new due date.
  5. Change a task's due date in the detail panel; confirm a relative reminder follows it.
  6. Confirm an existing DB's old reminders still appear (migrated) and don't re-fire if already shown.
  7. Export then re-import; confirm reminders survive the round-trip.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test: verify reminder rework"
```

---

### Task 10 (OPTIONAL, best-effort): Native OS-toast Snooze/Dismiss buttons

Adds Snooze/Dismiss buttons to the Windows toast itself (not just the in-app toast). Marked optional because Windows toast-action support via the plugin/WebView2 is uneven and cannot be verified headlessly; the in-app toast + detail-panel buttons already provide guaranteed Snooze/Dismiss.

**Files:**
- Modify: `src-tauri/capabilities/default.json` (if additional notification action permissions are required by the installed plugin version)
- Modify: `src/lib/reminders.ts`

- [ ] **Step 1: Register action types + handle actions**

In `src/lib/reminders.ts`, on first use register a reminder action type and attach an action listener, then pass the action type when sending the native notification:
```ts
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  registerActionTypes,
  onAction,
} from "@tauri-apps/plugin-notification";
```
Add a one-time setup (call from `ensureNotificationPermission` after permission is granted):
```ts
let actionsRegistered = false;
async function registerReminderActions(): Promise<void> {
  if (actionsRegistered) return;
  actionsRegistered = true;
  await registerActionTypes([
    {
      id: "reminder",
      actions: [
        { id: "snooze", title: "Snooze 15 min" },
        { id: "dismiss", title: "Dismiss" },
      ],
    },
  ]);
  await onAction((notification) => {
    // notification.id maps to the task; resolve and snooze/dismiss accordingly.
    // (Implement id→task mapping by passing the task id as the notification id
    //  when sending: sendNotification({ id: hashOf(task.id), ... }).)
  });
}
```
Then in the loop's unfocused branch send with `actionTypeId: "reminder"`.

- [ ] **Step 2: Verify build + manual test**

Run: `npm run build`. Manually verify on Windows whether the toast shows the buttons and the action callback fires. If the installed plugin version's `onAction`/`registerActionTypes` API differs or buttons don't render, STOP and leave this task unmerged — the in-app + detail-panel paths remain the supported Snooze/Dismiss surfaces. Do not block the plan on this.

- [ ] **Step 3: Commit (only if it works)**

```bash
git add src/lib/reminders.ts src-tauri/capabilities/default.json
git commit -m "feat(reminders): best-effort native toast snooze/dismiss actions"
```

---

## Self-Review (against design spec §4)

**Coverage:**
- Flexible per-task reminder (relative OR absolute) → `Reminder` type (Task 1), `ReminderEditor` (Task 5), `buildReminder` (Task 3). ✔
- Optional repeat (15m/30m/hourly/2h/daily) → `repeatMinutes` + `advanceAfterFire` (Tasks 3, 4), repeat select (Task 5). ✔
- Stop on done/cancel or dismiss → `isReminderDue` + `dismissReminder` (Task 3). ✔
- JSON-blob storage + migration v2 backfill from `reminder_at`/`reminder_shown_at` → Task 2. ✔
- Loop rework, missed-while-closed handling → Task 4. ✔
- Snooze + Dismiss: in-app toast (focused) + detail-panel buttons guaranteed; native toast buttons best-effort → Tasks 4, 5, 10. ✔
- Recurrence interplay (re-anchor relative, drop absolute) + due-date change re-anchor → Task 6. ✔
- Export/import updated, backward compatible → Task 7. ✔
- Legacy field removal → Task 8. ✔

**Placeholder scan:** Only Task 10 (explicitly optional/best-effort) contains an illustrative comment for the id→task mapping; it is gated behind "implement only if the API works on your version" and is not on the required path. All required tasks contain complete code.

**Type/name consistency:** `Reminder`/`ReminderMode` (types) used identically in `reminder.ts`, `reminders.ts`, `tasks.ts`, `ReminderEditor`, `useTasks`. `ReminderDraft`, `buildReminder`, `toDraft`, `isReminderDue`, `advanceAfterFire`, `snoozeReminder`, `dismissReminder`, `reanchorReminder`, `reminderForNextOccurrence` names match across Tasks 3–7. The `reminder_json` column name matches between migration (Task 2), query mapping (Task 2), and import (Task 7).

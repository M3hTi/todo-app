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

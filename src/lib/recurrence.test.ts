import { describe, it, expect } from "vitest";
import type { RecurringRule } from "@/types";
import {
  getNextDueDate,
  isOccurrenceOn,
  isRuleExpired,
  nextDueDateAfterCompletion,
} from "./recurrence";

// 2026-06-17 is a Wednesday (getDay === 3); 2026 is NOT a leap year (Feb has 28 days).
const rule = (partial: Partial<RecurringRule> & Pick<RecurringRule, "frequency">): RecurringRule => ({
  interval: 1,
  ...partial,
});

describe("getNextDueDate — Daily", () => {
  it("advances by one day with interval 1", () => {
    expect(getNextDueDate(rule({ frequency: "Daily" }), "2026-06-17")).toBe("2026-06-18");
  });

  it("advances by interval days when interval > 1", () => {
    expect(getNextDueDate(rule({ frequency: "Daily", interval: 3 }), "2026-06-17")).toBe(
      "2026-06-20",
    );
  });
});

describe("getNextDueDate — Weekly", () => {
  it("picks the next selected weekday later this week", () => {
    // From Wed (3); selected Mon/Wed/Fri -> next is Fri (2026-06-19).
    expect(
      getNextDueDate(rule({ frequency: "Weekly", daysOfWeek: [1, 3, 5] }), "2026-06-17"),
    ).toBe("2026-06-19");
  });

  it("wraps to the first selected weekday interval weeks ahead when none remain this week", () => {
    // From Fri (5); selected Mon/Wed -> none after Fri, so first selected (Mon) next week = 2026-06-22.
    expect(
      getNextDueDate(rule({ frequency: "Weekly", daysOfWeek: [1, 3] }), "2026-06-19"),
    ).toBe("2026-06-22");
  });

  it("adds 7 * interval days when no specific weekdays are set", () => {
    // From Wed, interval 2, no daysOfWeek -> +14 days = 2026-07-01 (also a Wednesday).
    expect(
      getNextDueDate(rule({ frequency: "Weekly", interval: 2, daysOfWeek: [] }), "2026-06-17"),
    ).toBe("2026-07-01");
  });
});

describe("getNextDueDate — Monthly", () => {
  it("clamps dayOfMonth to the length of the target month", () => {
    // Jan -> Feb 2026; day 31 clamps to Feb 28.
    expect(
      getNextDueDate(rule({ frequency: "Monthly", dayOfMonth: 31 }), "2026-01-15"),
    ).toBe("2026-02-28");
  });

  it("advances by interval months when interval > 1", () => {
    // Jan + 2 months = March; day 10.
    expect(
      getNextDueDate(rule({ frequency: "Monthly", interval: 2, dayOfMonth: 10 }), "2026-01-20"),
    ).toBe("2026-03-10");
  });
});

describe("getNextDueDate — Yearly", () => {
  it("clamps Feb 29 to Feb 28 in a non-leap target year", () => {
    // 2024-02-29 (leap) + 1 year -> 2025-02-28 (date-fns clamps).
    expect(getNextDueDate(rule({ frequency: "Yearly" }), "2024-02-29")).toBe("2025-02-28");
  });

  it("advances by interval years when interval > 1", () => {
    expect(getNextDueDate(rule({ frequency: "Yearly", interval: 3 }), "2026-06-17")).toBe(
      "2029-06-17",
    );
  });
});

describe("isRuleExpired", () => {
  const ending = rule({ frequency: "Daily", endDate: "2026-06-30" });

  it("is expired when the next occurrence falls after endDate", () => {
    expect(isRuleExpired(ending, "2026-07-01")).toBe(true);
  });

  it("is NOT expired when the next occurrence lands exactly on endDate (strict boundary)", () => {
    expect(isRuleExpired(ending, "2026-06-30")).toBe(false);
  });

  it("is not expired when the next occurrence is before endDate", () => {
    expect(isRuleExpired(ending, "2026-06-29")).toBe(false);
  });

  it("is never expired when the rule has no endDate", () => {
    expect(isRuleExpired(rule({ frequency: "Daily" }), "2099-01-01")).toBe(false);
  });
});

describe("nextDueDateAfterCompletion — due-date anchor (ADR-0002)", () => {
  it("on-time completion advances one step from the due date", () => {
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Daily" }), "2026-06-17", "2026-06-17"),
    ).toBe("2026-06-18");
  });

  it("keeps a weekly task on its weekday when completed late (not completion-relative)", () => {
    // due Mon 2026-06-15, completed Wed 2026-06-17 -> next Mon 2026-06-22.
    expect(
      nextDueDateAfterCompletion(
        rule({ frequency: "Weekly", daysOfWeek: [1] }),
        "2026-06-15",
        "2026-06-17",
      ),
    ).toBe("2026-06-22");
  });

  it("keeps a daily-interval task on its due-date phase when completed late", () => {
    // due 2026-06-01, every 3 days, completed 2026-06-02 -> grid 06-01/04/07 => 06-04 (not 06-05).
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Daily", interval: 3 }), "2026-06-01", "2026-06-02"),
    ).toBe("2026-06-04");
  });

  it("skips missed monthly occurrences across a month boundary", () => {
    // due Jan 15, monthly day-15, completed Mar 20 -> Apr 15 (Feb & Mar skipped).
    expect(
      nextDueDateAfterCompletion(
        rule({ frequency: "Monthly", dayOfMonth: 15 }),
        "2026-01-15",
        "2026-03-20",
      ),
    ).toBe("2026-04-15");
  });

  it("keeps the due-date day-of-month when none is specified (not the completion day)", () => {
    // due Jan 15 (no dayOfMonth), completed Mar 20 -> Apr 15, not Apr 20.
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Monthly" }), "2026-01-15", "2026-03-20"),
    ).toBe("2026-04-15");
  });

  it("skips missed yearly occurrences and preserves the due month/day", () => {
    // due 2024-06-17, completed 2026-08-01 -> 2027-06-17 (not 2027-08-01).
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Yearly" }), "2024-06-17", "2026-08-01"),
    ).toBe("2027-06-17");
  });

  it("clamps Feb 29 under the new anchor", () => {
    // due 2024-02-29, completed 2025-03-01 -> 2026-02-28.
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Yearly" }), "2024-02-29", "2025-03-01"),
    ).toBe("2026-02-28");
  });

  it("does NOT spring back to Feb 29 in a later leap year (ADR-0002 accepted limitation)", () => {
    // due 2027-02-28, completed 2027-03-01 -> 2028-02-28 even though 2028 is a leap year.
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Yearly" }), "2027-02-28", "2027-03-01"),
    ).toBe("2028-02-28");
  });

  it("advances past a future due date when completed early", () => {
    // due 2026-06-20, completed 2026-06-15 -> 2026-06-21 (current cycle consumed).
    expect(
      nextDueDateAfterCompletion(rule({ frequency: "Daily" }), "2026-06-20", "2026-06-15"),
    ).toBe("2026-06-21");
  });

  it("falls back to completion-anchor when the task has no due date (no-op vs old behavior)", () => {
    const today = "2026-06-02";
    const r1 = rule({ frequency: "Daily", interval: 3 });
    expect(nextDueDateAfterCompletion(r1, undefined, today)).toBe(getNextDueDate(r1, today));
    const r2 = rule({ frequency: "Monthly" });
    expect(nextDueDateAfterCompletion(r2, undefined, today)).toBe(getNextDueDate(r2, today));
    const r3 = rule({ frequency: "Weekly", daysOfWeek: [1, 4] });
    expect(nextDueDateAfterCompletion(r3, undefined, today)).toBe(getNextDueDate(r3, today));
  });
});

describe("nextDueDateAfterCompletion + isRuleExpired (endDate boundary, ADR-0002)", () => {
  it("next occurrence landing exactly on endDate is still valid", () => {
    const r = rule({ frequency: "Weekly", daysOfWeek: [1], endDate: "2026-06-22" });
    const next = nextDueDateAfterCompletion(r, "2026-06-15", "2026-06-17");
    expect(next).toBe("2026-06-22");
    expect(isRuleExpired(r, next)).toBe(false);
  });

  it("next occurrence past endDate expires the rule", () => {
    const r = rule({ frequency: "Weekly", daysOfWeek: [1], endDate: "2026-06-21" });
    const next = nextDueDateAfterCompletion(r, "2026-06-15", "2026-06-17");
    expect(next).toBe("2026-06-22");
    expect(isRuleExpired(r, next)).toBe(true);
  });
});

describe("isOccurrenceOn — telling a missed day from an unscheduled one", () => {
  it("daily every 1 day matches every day up to the anchor", () => {
    const rule: RecurringRule = { frequency: "Daily", interval: 1 };
    for (const day of ["2026-08-20", "2026-08-25", "2026-08-26"]) {
      expect(isOccurrenceOn(rule, day, "2026-08-27")).toBe(true);
    }
  });

  it("daily every 3 days matches only the on-cycle days", () => {
    const rule: RecurringRule = { frequency: "Daily", interval: 3 };
    expect(isOccurrenceOn(rule, "2026-08-24", "2026-08-27")).toBe(true);
    expect(isOccurrenceOn(rule, "2026-08-21", "2026-08-27")).toBe(true);
    expect(isOccurrenceOn(rule, "2026-08-25", "2026-08-27")).toBe(false);
    expect(isOccurrenceOn(rule, "2026-08-26", "2026-08-27")).toBe(false);
  });

  it("weekly Mon+Wed treats Tuesday as unscheduled, not missed", () => {
    // 2026-08-24 Mon, 25 Tue, 26 Wed
    const rule: RecurringRule = { frequency: "Weekly", interval: 1, daysOfWeek: [1, 3] };
    expect(isOccurrenceOn(rule, "2026-08-24", "2026-08-26")).toBe(true);
    expect(isOccurrenceOn(rule, "2026-08-25", "2026-08-26")).toBe(false);
    expect(isOccurrenceOn(rule, "2026-08-26", "2026-08-26")).toBe(true);
  });

  it("fortnightly weekly skips the off week", () => {
    const rule: RecurringRule = { frequency: "Weekly", interval: 2, daysOfWeek: [1] };
    expect(isOccurrenceOn(rule, "2026-08-24", "2026-08-24")).toBe(true);
    expect(isOccurrenceOn(rule, "2026-08-17", "2026-08-24")).toBe(false);
    expect(isOccurrenceOn(rule, "2026-08-10", "2026-08-24")).toBe(true);
  });

  it("monthly clamps a 31st rule to a short month, matching getNextDueDate", () => {
    const rule: RecurringRule = { frequency: "Monthly", interval: 1, dayOfMonth: 31 };
    expect(isOccurrenceOn(rule, "2026-06-30", "2026-08-31")).toBe(true);
    expect(isOccurrenceOn(rule, "2026-06-29", "2026-08-31")).toBe(false);
    expect(isOccurrenceOn(rule, "2026-07-31", "2026-08-31")).toBe(true);
  });

  it("yearly matches the same month and day only", () => {
    const rule: RecurringRule = { frequency: "Yearly", interval: 1 };
    expect(isOccurrenceOn(rule, "2025-08-26", "2026-08-26")).toBe(true);
    expect(isOccurrenceOn(rule, "2025-08-25", "2026-08-26")).toBe(false);
  });

  it("never matches past the rule's endDate", () => {
    const rule: RecurringRule = { frequency: "Daily", interval: 1, endDate: "2026-08-20" };
    expect(isOccurrenceOn(rule, "2026-08-19", "2026-08-27")).toBe(true);
    expect(isOccurrenceOn(rule, "2026-08-21", "2026-08-27")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import type { RecurringRule } from "@/types";
import { getNextDueDate, isRuleExpired } from "./recurrence";

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

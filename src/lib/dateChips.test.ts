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

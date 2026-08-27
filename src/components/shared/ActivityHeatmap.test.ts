import { describe, it, expect } from "vitest";
import { buildGrid, intensityLevel } from "./ActivityHeatmap";

describe("intensityLevel", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 2],
    [6, 3],
    [9, 3],
    [10, 4],
    [99, 4],
  ])("count %i -> level %i", (count, level) => {
    expect(intensityLevel(count)).toBe(level);
  });

  it("treats a negative count as empty rather than throwing", () => {
    expect(intensityLevel(-1)).toBe(0);
  });
});

describe("buildGrid", () => {
  // 2026-08-26 is a Wednesday, so its week runs Sun 23 .. Sat 29.
  const END = new Date(2026, 7, 26);

  it("always yields exactly weeks * 7 cells", () => {
    for (const weeks of [1, 5, 53]) {
      expect(buildGrid([], weeks, END)).toHaveLength(weeks * 7);
    }
  });

  it("keeps endDate in the final column and flags the days after it", () => {
    const cells = buildGrid([], 3, END);
    const lastColumn = cells.slice(-7);

    expect(lastColumn.map((cell) => cell.date)).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
    expect(lastColumn.filter((cell) => !cell.future).at(-1)?.date).toBe("2026-08-26");
    expect(lastColumn.filter((cell) => cell.future).map((cell) => cell.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  it("starts on a Sunday so rows stay weekday-aligned", () => {
    const cells = buildGrid([], 4, END);
    expect(cells[0]?.date).toBe("2026-08-02"); // a Sunday
    // Every 7th cell is the same weekday — that is what grid-rows-7 relies on.
    for (let index = 0; index < cells.length; index += 7) {
      expect(new Date(cells[index]?.date as string).getUTCDay()).toBe(0);
    }
  });

  it("zero-fills days absent from the data", () => {
    const cells = buildGrid([{ date: "2026-08-26", count: 4 }], 2, END);
    expect(cells.find((cell) => cell.date === "2026-08-26")?.count).toBe(4);
    expect(cells.find((cell) => cell.date === "2026-08-25")?.count).toBe(0);
    expect(cells.every((cell) => typeof cell.count === "number")).toBe(true);
  });

  it("ignores data outside the rendered window instead of misplacing it", () => {
    const cells = buildGrid(
      [
        { date: "2020-01-01", count: 9 },
        { date: "2026-08-24", count: 2 },
      ],
      2,
      END,
    );
    expect(cells.some((cell) => cell.date === "2020-01-01")).toBe(false);
    expect(cells.find((cell) => cell.date === "2026-08-24")?.count).toBe(2);
  });
});

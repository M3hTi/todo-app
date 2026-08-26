// GitHub-style activity grid. Pure CSS grid — `grid-flow-col` + `grid-rows-7`
// lays out one column per week with weekday-aligned rows, so there is no
// positioning math and no charting dependency.
import { useMemo } from "react";
import { addDays, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import type { DailyCount } from "@/types";

const CELL_PX = 11;
const GAP_PX = 3;
const DEFAULT_WEEKS = 53;

/**
 * Fixed thresholds rather than a share of the year's busiest day: a square keeps
 * the same colour as history grows, and nothing has to be recomputed when a new
 * record day lands.
 */
export function intensityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

export interface HeatmapCell {
  date: string;
  count: number;
  /** Past the requested end date — occupies its slot but renders as a blank. */
  future: boolean;
}

/**
 * Always returns exactly `weeks * 7` cells, starting on the Sunday that keeps
 * `endDate` in the final column. Days with no completions come back as zero, and
 * days after `endDate` are flagged `future` so the last column can be partial
 * without breaking weekday alignment.
 */
export function buildGrid(
  data: readonly DailyCount[],
  weeks: number,
  endDate: Date,
): HeatmapCell[] {
  const counts = new Map(data.map((row) => [row.date, row.count]));
  const endKey = format(endDate, "yyyy-MM-dd");
  const start = subWeeks(startOfWeek(endDate, { weekStartsOn: 0 }), weeks - 1);

  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = format(addDays(start, index), "yyyy-MM-dd");
    return { date, count: counts.get(date) ?? 0, future: date > endKey };
  });
}

const WEEKDAY_ROWS: ReadonlyArray<{ row: number; label: string }> = [
  { row: 2, label: "Mon" },
  { row: 4, label: "Wed" },
  { row: 6, label: "Fri" },
];

interface ActivityHeatmapProps {
  data: readonly DailyCount[];
  weeks?: number;
  endDate?: Date;
}

export function ActivityHeatmap({
  data,
  weeks = DEFAULT_WEEKS,
  endDate = new Date(),
}: ActivityHeatmapProps) {
  const { cells, total, months } = useMemo(() => {
    const built = buildGrid(data, weeks, endDate);
    const sum = built.reduce((acc, cell) => acc + (cell.future ? 0 : cell.count), 0);

    // One label per column, printed only when that column opens a new month.
    const labels: Array<string | null> = [];
    let previous = "";
    for (let column = 0; column < weeks; column += 1) {
      const first = built[column * 7];
      const month = first ? first.date.slice(0, 7) : "";
      labels.push(month !== previous && first ? format(parseISO(first.date), "MMM") : null);
      previous = month;
    }
    return { cells: built, total: sum, months: labels };
  }, [data, weeks, endDate]);

  const columnTemplate = `repeat(${weeks}, ${CELL_PX}px)`;

  return (
    <figure className="m-0">
      <figcaption className="mb-3.5 flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-[var(--text-1)]">Activity</span>
        <span className="text-[13px] text-[var(--text-3)]">
          {total} {total === 1 ? "completion" : "completions"} in the last year
        </span>
      </figcaption>

      {/* The dashboard's scroll container is overflow-x-hidden, so the grid owns
          its own scroll context rather than pushing the page sideways. */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2">
          <div
            className="grid shrink-0 grid-rows-7 pt-[15px] text-[9px] leading-none text-[var(--text-3)]"
            style={{ gap: `${GAP_PX}px` }}
            aria-hidden="true"
          >
            {Array.from({ length: 7 }, (_, row) => (
              <div key={row} className="flex h-[11px] items-center">
                {WEEKDAY_ROWS.find((entry) => entry.row === row + 1)?.label ?? ""}
              </div>
            ))}
          </div>

          <div>
            <div
              className="mb-1 grid text-[9px] leading-none text-[var(--text-3)]"
              style={{ gridTemplateColumns: columnTemplate, columnGap: `${GAP_PX}px` }}
              aria-hidden="true"
            >
              {months.map((label, index) => (
                <div key={index} className="h-[10px] whitespace-nowrap">
                  {label}
                </div>
              ))}
            </div>

            <div
              role="grid"
              aria-label={`Task completions per day over the last ${weeks} weeks`}
              className="grid grid-flow-col grid-rows-7"
              style={{ gap: `${GAP_PX}px` }}
            >
              {cells.map((cell) =>
                cell.future ? (
                  <div key={cell.date} style={{ width: CELL_PX, height: CELL_PX }} />
                ) : (
                  <div
                    key={cell.date}
                    role="gridcell"
                    title={cellLabel(cell)}
                    aria-label={cellLabel(cell)}
                    style={{
                      width: CELL_PX,
                      height: CELL_PX,
                      background: `var(--heat-${intensityLevel(cell.count)})`,
                    }}
                    className="rounded-[2px]"
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[11px] text-[var(--text-3)]">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            style={{ width: CELL_PX, height: CELL_PX, background: `var(--heat-${level})` }}
            className="rounded-[2px]"
          />
        ))}
        <span>More</span>
      </div>
    </figure>
  );
}

function cellLabel(cell: HeatmapCell): string {
  const day = format(parseISO(cell.date), "MMM d, yyyy");
  if (cell.count === 0) return `No tasks completed on ${day}`;
  return `${cell.count} ${cell.count === 1 ? "task" : "tasks"} completed on ${day}`;
}

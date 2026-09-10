# Retroactive Check-off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-09-10-retroactive-check-off.md`
> **Decision:** `docs/adr/0005-retroactive-completion.md` — the write rules are settled there, don't re-derive them.

**Goal:** a past day in the history strip can be corrected in place — click a
missed square to record it, click a recorded one to clear it — and the
correction writes nothing but the completion log.

**The constraint that shapes the whole plan:** no migration, no new query
function, no new store field, no new component, no new dependency. The write
paths (`markDone` / `unmarkDone`), the grading (`buildDayStrip`) and the surface
(`HistoryStrip`, rendered in both the detail panel and `/habits`) all exist and
are correct. Target diff: **one pure function, one component, plus tests and
docs.**

**Stack:** unchanged — React 18 + TS strict, Zustand, `@tauri-apps/plugin-sql`,
date-fns, Tailwind + CSS-variable tokens, Vitest.

---

## Settled decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Retroactive writes touch only `task_completions`.** No `status`, `dueDate`, `reminder` or roll-forward. | ADR-0005. Today's checkbox has side effects that are correct for today and wrong for a day three weeks gone. |
| 2 | **Today is not editable from the strip.** | The checkbox owns today, including the roll-forward. One day, one write path. |
| 3 | **A retroactive clear ignores the row's snapshot.** | The anchor has moved on, possibly many steps. Re-anchoring the live schedule to fix a historical record is the worse bug. |
| 4 | **Only `missed` (add) and `done` / `done-off-schedule` (clear) past cells are actionable.** | Correcting the record, not logging arbitrary work. A day the rule never asked for stays read-only. |
| 5 | **One pure function, `retroActionFor`, holds the entire branch.** | It is the only logic in the feature; putting it in the component would put it beyond the test suite. |
| 6 | **The strip's effect depends on `completionsByTask`, not `todayDone`.** | `todayDone` does not move when a past day is written. `withCompletionDay` hands out a fresh `Map` on every add *and* clear, so one dep covers both — and `load` sets it too. |
| 7 | **Refetch after the write instead of patching local state.** | The existing component contract is "the squares and the numbers describe one load". One extra round trip per click keeps it. |
| 8 | **Actionable and non-actionable cells share one wrapper height.** | A button with a real hit area next to an 18px `div` makes the row jag. Same box, different element. |
| 9 | **A muted `click a day to fix it` in the strip header, only when something is actionable.** | An 11px square with an invisible action is not a shipped feature. |

**Explicit non-goals:** one-off tasks, days the rule never scheduled, history older than `HABIT_WINDOW_DAYS`, a confirm dialog, a `retroactive` flag/column, bulk catch-up, any change to the tray, Today, Overdue or reminders.

---

## Phase 1 — The decision, on disk

### Task 1.1: ADR-0005

**Files:** `docs/adr/0005-retroactive-completion.md` (already written)

- [ ] **Step 1:** Read it. If any step below contradicts it, the step is wrong.
- [ ] **Step 2:** Confirm the two claims it rests on are still true in the code:
      `logCompletion` is keyed `(task_id, occurrence_date)` with
      `ON CONFLICT DO NOTHING`, and `useCompletionStore.markDone` guards only
      `todayDone` by date. Both are in `src/lib/queries/completions.ts` and
      `src/store/useCompletionStore.ts`. If either has drifted, stop and re-spec.

---

## Phase 2 — The derivation

### Task 2.1: `retroActionFor` in `src/lib/completions.ts`

**Files:** Modify `src/lib/completions.ts`

- [ ] **Step 1:** Add the type and function directly below `buildDayStrip` — it
      grades what `buildDayStrip` produced, so it belongs next to it.

```ts
/** What clicking a day in the history strip does, or nothing. */
export type RetroAction = "add" | "clear" | null;

/**
 * Whether a strip cell can be corrected, and how (ADR-0005).
 *
 * Only the past is editable, and only days the rule asked for or days already
 * recorded. **Today is never editable here** — the checkbox owns today, and it
 * also rolls a recurring record forward; two write paths for one day is how a
 * reminder gets re-anchored by accident.
 */
export function retroActionFor(cell: DayCell, today: string): RetroAction {
  if (cell.date >= today) return null;
  if (cell.state === "missed") return "add";
  if (cell.state === "done" || cell.state === "done-off-schedule") return "clear";
  // not-scheduled: the rule never asked for this day. Recording work there is
  // "log arbitrary work", a different feature.
  return null;
}
```

- [ ] **Step 2:** `npx tsc --noEmit` — clean.

### Task 2.2: Tests

**Files:** Modify `src/lib/completions.test.ts`

- [ ] **Step 1:** Add a `describe("retroActionFor")` block with one case per row
      of the spec's table — build the cells inline, this needs no fixture:

```ts
const cell = (date: string, state: DayState): DayCell => ({ date, state });

it("offers to record a missed day in the past", () => {
  expect(retroActionFor(cell("2026-09-08", "missed"), "2026-09-10")).toBe("add");
});
it("offers to clear a recorded day, on or off schedule", () => {
  expect(retroActionFor(cell("2026-09-08", "done"), "2026-09-10")).toBe("clear");
  expect(retroActionFor(cell("2026-09-08", "done-off-schedule"), "2026-09-10")).toBe("clear");
});
it("leaves today to the checkbox", () => {
  expect(retroActionFor(cell("2026-09-10", "missed"), "2026-09-10")).toBeNull();
  expect(retroActionFor(cell("2026-09-10", "done"), "2026-09-10")).toBeNull();
});
it("edits neither the future nor days the rule never asked for", () => {
  expect(retroActionFor(cell("2026-09-11", "pending"), "2026-09-10")).toBeNull();
  expect(retroActionFor(cell("2026-09-08", "not-scheduled"), "2026-09-10")).toBeNull();
});
```

- [ ] **Step 2:** `npm test` — green.

---

## Phase 3 — The surface

### Task 3.1: `HistoryStrip` becomes editable

**Files:** Modify `src/components/tasks/HistoryStrip.tsx`

- [ ] **Step 1:** Pull the two writers and the map off the store, and swap the
      effect's `todayDone` dependency for `completionsByTask` (decision 6). The
      `todayDone` subscription goes away entirely.

```ts
const markDone = useCompletionStore((state) => state.markDone);
const unmarkDone = useCompletionStore((state) => state.unmarkDone);
const completionsByTask = useCompletionStore((state) => state.completionsByTask);
// …
}, [task.id, task.recurringRule, task.dueDate, task.createdAt, dayKey, completionsByTask]);
```

- [ ] **Step 2:** Add the click handler. Both branches write the log and nothing
      else — that is ADR-0005 in nine lines.

```ts
const correctDay = async (cell: DayCell, action: Exclude<RetroAction, null>): Promise<void> => {
  try {
    if (action === "add") {
      // No prevDueDate/prevReminder: nothing is being rolled forward.
      await markDone({
        taskId: task.id,
        taskTitle: task.title,
        occurrenceDate: cell.date,
        completedAt: new Date().toISOString(),
      });
    } else {
      // ponytail: the row's roll-forward snapshot is deliberately ignored —
      // the anchor has moved on since (ADR-0005).
      await unmarkDone(task.id, cell.date);
    }
  } catch {
    toast.error("Failed to update history. Please try again.");
  }
};
```

- [ ] **Step 3:** Render each cell through one wrapper so the row keeps a single
      height (decision 8). The colour moves to an inner `span`; the hit area is
      the wrapper.

```tsx
{data.cells.map((cell) => {
  const day = format(parseISO(cell.date), "EEE MMM d");
  const action = retroActionFor(cell, dayKey);
  const label =
    action === "add" ? `Mark ${day} as done`
    : action === "clear" ? `Clear ${day}`
    : `${day} — ${STATE_TEXT[cell.state]}`;
  const square = (
    <span className={`block h-[18px] w-full rounded-[3px] ${STATE_STYLE[cell.state]}`} />
  );
  return action ? (
    <button
      key={cell.date}
      type="button"
      title={`${day} — ${STATE_TEXT[cell.state]} · ${label}`}
      aria-label={label}
      onClick={() => void correctDay(cell, action)}
      className="h-[30px] flex-1 rounded-[4px] py-1.5 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-text)]"
    >
      {square}
    </button>
  ) : (
    <div key={cell.date} title={label} aria-label={label} className="h-[30px] flex-1 py-1.5">
      {square}
    </div>
  );
})}
```

- [ ] **Step 4:** The container holds buttons now, so drop `role="list"` from it
      and the `role="listitem"` from the plain cells; keep the group label as
      `role="group"` + the same `aria-label`. A list of buttons that claims to be
      a list reads wrong in a screen reader.

- [ ] **Step 5:** Header line (decision 9) — only when something is actionable:

```tsx
const editable = data.cells.some((cell) => retroActionFor(cell, dayKey) !== null);
// …
<div className="mb-2 flex items-baseline justify-between gap-3">
  <p className="text-[13px] font-semibold tracking-[.04em] text-[var(--text-4)]">
    LAST {HABIT_WINDOW_DAYS} DAYS
  </p>
  {editable && <p className="text-[11px] text-[var(--text-4)]">click a day to fix it</p>}
</div>
```

- [ ] **Step 6:** Update the file's header comment — the strip is a write surface
      now, not a read-only one. Name ADR-0005.
- [ ] **Step 7:** `npx tsc --noEmit` and `npm test` — clean and green.

### Task 3.2: Confirm the free surfaces

**Files:** none — verification only

- [ ] **Step 1:** `src/components/tasks/TaskDetail.tsx` and
      `src/features/habits/HabitsView.tsx` render `HistoryStrip` unchanged.
      **Do not edit them.** If either needs a change, the component grew a prop
      it should not have.

---

## Phase 4 — Verify, document, release

### Task 4.1: Automated gates

- [ ] **Step 1:** `npx tsc --noEmit`
- [ ] **Step 2:** `npm test`
- [ ] **Step 3:** `npm run e2e:build` then `npm run test:e2e` — this change writes
      to the database, which is the suite's stated release gate (CLAUDE.md).

### Task 4.2: Verify in the real app

Native behaviour is verified in the Tauri window, never in `npm run dev` — the
sql plugin is not there and the whole feature is a write.

- [ ] **Step 1:** `npm run tauri dev`. Screenshot the window with
      `PrintWindow(PW_RENDERFULLCONTENT)` — a foreground `CopyFromScreen` grabs
      the wrong window.
- [ ] **Step 2:** On a recurring task with a red square: click it. Expect the
      square green, the stats line's streak/adherence to move, the row's
      `N missed` badge to drop by one, and the dashboard heatmap to gain a count
      on that day.
- [ ] **Step 3:** Click it again. Expect it red, every number back.
- [ ] **Step 4:** Confirm the task's **due date and reminder did not move** across
      both clicks — that is the entire decision.
- [ ] **Step 5:** Check the same task on `/habits` — same strip, same numbers,
      clickable there too.
- [ ] **Step 6:** Read the on-disk DB **with its WAL sidecar** (copying the `.db`
      alone shows stale data and fakes a failed write) and confirm exactly one
      row appeared and disappeared, with `prev_due_date` / `prev_reminder_json`
      null on the retroactive row.
- [ ] **Step 7:** Restart the app; the corrected day is still corrected.

### Task 4.3: Documentation

- [ ] **Step 1:** `CONTEXT.md` — delete the **retroactive check-off** entry from
      *Standing non-goals* (it is shipped behaviour now, and a stale non-goal is
      worse than none). Extend the **Completion** and **Habit stats** entries:
      past days in the strip are editable, the write is log-only, today belongs to
      the checkbox. Point at ADR-0005.
- [ ] **Step 2:** `CONTEXT.md` — *Current state* gets the v0.8.0 paragraph, and
      *Roadmap* points at this plan.
- [ ] **Step 3:** `docs/ROADMAP.md` — mark the tiers done.

### Task 4.4: Release

- [ ] **Step 1:** Bump `package.json` and `src-tauri/tauri.conf.json` to `0.8.0`
      (both — they are checked against each other).
- [ ] **Step 2:** Commit, PR, merge, tag `v0.8.0` — the release workflow builds,
      signs and drafts the GitHub Release with `latest.json`.
- [ ] **Step 3:** Confirm the draft release carries the signed `.msi` and
      `latest.json`. Without the signing secrets the in-app updater gets nothing.

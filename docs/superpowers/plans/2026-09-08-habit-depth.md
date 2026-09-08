# Habit Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-09-08-habit-depth.md` — read it first; the definitions there are settled, don't re-derive them.

**Goal:** every recurring task tells you its streak, its adherence and its recent
misses — in the task detail, on the task row, and on one new `/habits` view.

**The constraint that shapes the whole plan:** no migration, no new query
function, no new dependency. `task_completions` + `isOccurrenceOn` already hold
every fact; this is a derivation and four render sites. Target diff: one new
component file, one new pure function, edits to five existing files.

**Stack:** unchanged — React 18 + TS strict, Zustand, `@tauri-apps/plugin-sql`,
date-fns, Tailwind + CSS-variable tokens, Vitest.

---

## Settled decisions

| # | Decision | Why |
|---|---|---|
| 1 | **One pure function, `habitStats`,** feeds the detail line, the row badge and the habits view. | Three screens disagreeing about a streak is worse than no streak. It also puts every branch behind one test file. |
| 2 | **Pending days never count as misses**, and a pending *today* does not break a streak. | A streak that expires at 00:01 and comes back when you tick the box is a bug that reads as one. |
| 3 | **Unscheduled days are skipped by the streak walk**, not treated as breaks. | A Mon/Wed habit would otherwise never exceed a 2-day streak. |
| 4 | **Off-schedule completions count in neither side of adherence.** | They satisfied nothing the rule asked for; counting them as hits lets a 3x/week habit score 300%. The strip still shows them (`done-off-schedule`). |
| 5 | **No stats at all for a rule with no due date.** | No anchor means nothing is scheduled, so adherence and streak are undefined, not zero. The same rule the calendar adopted in v0.6.0. |
| 6 | **The strip widens 14 to 30 days**, `HABIT_WINDOW_DAYS`. | One window for every number on screen. The cells are `flex-1`; 30 of them still render. |
| 7 | **Streak lookback hard-bounded at 366 days** and at the task's creation day. | An anchor years back would otherwise walk thousands of `isOccurrenceOn` calls on every render. |
| 8 | **The missed badge is driven from the completion store**, not a per-row query. | One extra call to the range read `load` already makes; N rows firing N queries is the thing to avoid. |
| 9 | **`/habits` reuses `HistoryStrip` per row**, including its per-task fetch. | It is written, tested and correct. One query per habit on a view opened deliberately is a fine price; ceiling noted in a comment. |

**Explicit non-goals:** retroactive check-off (the spec records the upgrade path), per-habit targets, streak notifications, adherence for one-off tasks, changing what the heatmap counts, backfilling missed rows.

---

## Phase 1 — The derivation

### Task 1.1: `habitStats` in `src/lib/completions.ts`

**Files:** Modify `src/lib/completions.ts`

- [ ] **Step 1:** Export the two constants next to the existing exports.

```ts
/** Trailing window for adherence, the missed badge and the day strip. */
export const HABIT_WINDOW_DAYS = 30;
/** Hard bound on the streak walk — an old anchor must not walk forever. */
export const STREAK_LOOKBACK_DAYS = 366;
```

- [ ] **Step 2:** Add the result type and the signature. Reuse `buildDayStrip`
  for the window counts — it already resolves scheduled / done / missed /
  not-scheduled correctly, including the `createdAt` floor and `endDate`.

```ts
export interface HabitStats {
  /** Days in the window the rule asked for that are already past, or done. */
  scheduled: number;
  done: number;
  missed: number;
  /** done / scheduled, or null when nothing was owed in the window. */
  adherence: number | null;
  /** Consecutive scheduled days done, walking back from today. */
  streak: number;
}

export function habitStats(
  rule: RecurringRule | undefined,
  anchorDueDate: string | undefined,
  createdAt: string,
  completedDates: ReadonlySet<string>,
  today: string,
): HabitStats | null
```

- [ ] **Step 3:** Return `null` immediately when `!rule || !anchorDueDate` — a
  dateless repeat has no schedule, so every number below is undefined rather
  than zero (decision 5).

- [ ] **Step 4:** Window counts. `buildDayStrip(rule, anchorDueDate, createdAt,
  completedDates, HABIT_WINDOW_DAYS, today)`, then count cells: `done` = state
  `done` (**not** `done-off-schedule`, decision 4), `missed` = state `missed`,
  `scheduled` = `done + missed`. `adherence` = `scheduled === 0 ? null : done / scheduled`.

- [ ] **Step 5:** The streak walk. Start at `today`; if today is scheduled and
  not done, step back one day before counting anything (decision 2). Then loop
  at most `STREAK_LOOKBACK_DAYS` times:
  - stop when the day is before the task's creation day;
  - `completedDates.has(day)` → `streak += 1`, step back;
  - else `isOccurrenceOn(rule, day, anchorDueDate)` → **stop** (a missed scheduled day ends the streak);
  - else step back without counting (unscheduled, decision 3).

- [ ] **Step 6:** Add a `ponytail:` comment on the walk naming the ceiling:
  linear per call, memoized at the call sites; precompute in the store only if a
  long list measurably drags.

### Task 1.2: Tests

**Files:** Modify `src/lib/completions.test.ts`

- [ ] **Step 1:** Cover, with a fixed `today` and explicit date sets:
  - daily rule, every day done → streak equals the window, adherence 1;
  - daily rule, missed the day before yesterday → streak counts only the days since;
  - daily rule, **today not yet done** → streak unchanged from yesterday's value (decision 2);
  - Mon/Wed rule with empty Tuesdays → the streak spans them (decision 3);
  - Mon/Wed rule completed on a Tuesday → that completion moves neither `done` nor `missed` (decision 4);
  - task created 3 days ago → nothing before creation is missed, streak capped at 3;
  - rule past its `endDate` → days after it are neither scheduled nor missed;
  - rule with `dueDate: undefined` → `null` (decision 5).
- [ ] **Step 2:** `npm run test` green.

---

## Phase 2 — Task detail

### Task 2.1: Stats line on `HistoryStrip`

**Files:** Modify `src/components/tasks/HistoryStrip.tsx`

- [ ] **Step 1:** Replace the local `const DAYS = 14` with `HABIT_WINDOW_DAYS`
  (decision 6); the heading and the `aria-label` follow the constant.
- [ ] **Step 2:** Call `habitStats` with the completion dates the component
  already fetched — **no second query**. Set it in the same state update as the
  cells, so the strip and the numbers can never describe different loads.
- [ ] **Step 3:** Render one line under the grid when stats are non-null:
  `🔥 5-day streak · 12 of 14 scheduled days · 86%`. Drop the streak clause at 0,
  drop the percentage when `adherence` is null. Round with `Math.round`. Existing
  type and token classes only — no new component, no chart.
- [ ] **Step 4:** The header's `n done · m missed` count now duplicates the new
  line. Delete it.

---

## Phase 3 — The missed badge on the task row

### Task 3.1: Per-task completion dates in the store

**Files:** Modify `src/store/useCompletionStore.ts`

- [ ] **Step 1:** Add `completionsByTask: Map<string, Set<string>>` to the state,
  initialised empty.
- [ ] **Step 2:** In `load`, add a third promise to the existing `Promise.all`:
  `getTaskCompletionsInRange(windowStart, today)` with
  `windowStart = format(subDays(now, HABIT_WINDOW_DAYS - 1), "yyyy-MM-dd")`.
  Group the rows into the map. **No new query function** — this read already
  exists for the calendar.
- [ ] **Step 3:** Keep it in sync in `markDone` (add the date to that task's set,
  creating the set if absent) and `unmarkDone` (delete the date). Both already
  rebuild the other two derived fields; build a **new** `Map` the same way or
  Zustand will not re-render.
- [ ] **Step 4:** The existing `catch` in `load` must still leave the map empty
  and let startup continue — history is additive.

### Task 3.2: The badge

**Files:** Modify `src/components/tasks/TaskCard.tsx`

- [ ] **Step 1:** Read `completionsByTask` and `dayKey` from the store and derive
  `habitStats(task.recurringRule, task.dueDate, task.createdAt, dates ?? EMPTY, dayKey)`
  in a `useMemo` keyed on those inputs (module-level `const EMPTY = new Set<string>()`,
  so a task with no completions doesn't allocate on every render).
- [ ] **Step 2:** Render nothing when stats are `null` or `missed === 0`.
  Otherwise a small badge in the existing overdue treatment (`--urgent-bg` /
  `--urgent-text`) reading `3 missed`, with
  `aria-label="3 missed days in the last 30"`. It states a fact; it is not a
  button and opens nothing.
- [ ] **Step 3:** Place it with the existing row metadata, after the due-date
  chip, so it inherits the row's truncation instead of widening rows.

### Task 3.3: Store test

**Files:** Create `src/store/useCompletionStore.test.ts`

- [ ] **Step 1:** Mock `@/lib/queries/completions` the way the other store tests
  mock their query modules. Assert that `load` builds the map, `markDone` adds
  the date, `unmarkDone` removes it, and that each produces a **new** `Map`.
- [ ] **Step 2:** `npm run test` green.

---

## Phase 4 — The `/habits` view

### Task 4.1: The view

**Files:** Create `src/features/habits/HabitsView.tsx`; modify `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/shared/CommandPalette.tsx`

- [ ] **Step 1:** `HabitsView` = `tasks.filter((t) => t.recurringRule)` from the
  task store, sorted by title, each rendered as a card: the task title as a
  button that selects the task the way `TaskListPage` does (so detail still opens
  in one click), above `<HistoryStrip task={task} />` — which after Phase 2
  already carries the strip *and* the stats. No data loading in this file.
- [ ] **Step 2:** `ponytail:` comment naming the ceiling — one query per habit,
  because `HistoryStrip` self-fetches; batch through `getTaskCompletionsInRange`
  if anyone ever has enough habits to notice.
- [ ] **Step 3:** `EmptyState` when there are no recurring tasks, worded so it
  says what a habit is here (a task with a repeat rule), not just "nothing yet".
- [ ] **Step 4:** Route `/habits` in `App.tsx` and a `Repeat` (lucide) nav item
  in `NAV_ITEMS`, after Calendar.
- [ ] **Step 5:** Add the view to `CommandPalette.tsx` — it enumerates the seven
  views by hand and would otherwise silently miss the eighth.

---

## Phase 5 — Verify and ship

- [ ] **Step 1:** `npx tsc --noEmit` and `npm run test` both clean.
- [ ] **Step 2:** Run the real app against the real database. With a daily habit
  carrying a deliberate 2-day gap and a Mon/Wed habit, confirm all four surfaces
  agree: detail strip, row badge, `/habits`, and the calendar's done/missed
  grading for the same days. Screenshot the Tauri window with
  `PrintWindow(PW_RENDERFULLCONTENT)`; if you inspect the database directly, copy
  the `-wal` sidecar with it or you are reading stale rows.
- [ ] **Step 3:** Check the midnight path: with the app open, let `dayKey` move
  forward (the 60s tick's `refreshIfDayChanged`) and confirm the badge and the
  streak re-derive instead of freezing on yesterday.
- [ ] **Step 4:** Update `CONTEXT.md` — add **Habit stats** to the ubiquitous
  language (the definitions, one paragraph, pointing at the spec) and remove
  *Adherence metrics* from the standing non-goals, since this ships it. Leave the
  other non-goals alone.
- [ ] **Step 5:** Bump to **v0.7.0** in `package.json`, `src-tauri/tauri.conf.json`
  and `src-tauri/Cargo.toml`, sync the lockfiles, commit, tag `v0.7.0`, push the
  tag, and publish the draft release the workflow creates.

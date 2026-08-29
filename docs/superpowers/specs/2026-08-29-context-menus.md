# Spec: Right-click context menu on task rows

- **Date:** 2026-08-29
- **Status:** Implemented and verified against the real app, 2026-08-29
- **App:** Todo App — Tauri v2 + React 18/TS, SQLite

## Goal

Right-clicking a task row opens a menu, at the cursor, of the actions that
already exist for that task. No schema change, no new store action, no new
query function.

## Scope

**In:** `TaskCard` — rendered in exactly one place (`TaskListPage.tsx:119`), so
this covers Today / Upcoming / All Tasks / category lists.

**Out:** calendar day chips (`CalendarView.tsx:170`, `:232`), the dashboard
today list (`DashboardView.tsx:215`), sidebar tag chips, Settings category rows,
subtask rows. The last three already expose their one or two actions as visible
buttons. The menu component takes a `task` and is exported, so adding it to the
calendar or dashboard later is a one-line wrap per site — decided after using it,
not before.

## The menu

```
Mark incomplete            ← "Complete" when not done
─────────────────
Priority           ▸  Low · Medium · High · Urgent   (radio, current marked)
Due date           ▸  Today · Tomorrow · This weekend · Next week
                      ─────────  Clear   (only when the task has a due date)
─────────────────
Delete
```

- The toggle label reads `isDoneToday(task, todayDone)`, **not** `status` — a
  recurring task done today is back to `Not Started` and would otherwise read
  "Complete" while showing a checked box.
- Priority uses radio items so the current priority is visible without closing
  the menu.
- No items are disabled on Completed / Cancelled tasks: rescheduling or
  reprioritising a finished task before reopening it is legitimate.
- No `Del` shortcut hint on Delete — the Delete key acts on the *selected* row,
  and right-click does not select (see Selection below).
- Dropped after grilling: "Open details" (left-click already does it), "Category ▸"
  (one click away once a row is selected), Duplicate (new behavior, not a menu item).

## Actions

Every item calls something that exists today. Failures reuse the established
pattern: `try/catch` → `toast.error("Failed to save task. Please try again.")`,
exactly as `TaskDetail.save` and `toggleTaskComplete` do. No success toasts.

| Item | Calls |
|---|---|
| Complete / Mark incomplete | `toggleTaskComplete(task)` (already toasts on failure) |
| Priority ▸ | `updateTask(id, { priority })` |
| Due date ▸ | `updateTask(id, dueDatePatch(task, date))` — see below |
| Delete | `setConfirmDeleteTask(id)` → the shared `ConfirmDialog` in `AppShell` |

## The reminder reanchor (the one real correctness risk)

`updateTask` does **not** reschedule reminders. `TaskDetail.tsx:170` and `:203`
reanchor a relative reminder by hand after a due-date change, and the Clear
button at `:184` nulls it. A menu that wrote a bare `{ dueDate }` would leave a
"30 min before due" reminder pointing at the **old** date, silently.

Fix by extraction, not by copying a fourth time:

```ts
// src/lib/reminder.ts
export function dueDatePatch(task: Task, dueDate: string | null): UpdateTaskInput
```

- `dueDate` set + relative reminder → `reanchorReminder(reminder, dueDate, task.dueTime)`
- `dueDate` set + absolute reminder → untouched
- `dueDate === null` → `{ dueDate: null, dueTime: null, reminder: null }` when the
  reminder is relative

`TaskDetail`'s three hand-copied blocks collapse onto it. Net line count goes
**down**. `DATE_CHIPS` moves from `TaskDetail.tsx:34` to `lib/dateChips.ts` so
the menu and the detail panel cannot drift apart.

## Selection

Right-click does not fire `TaskCard`'s `onClick` (left-click only), so
`selectedTaskId` and the detail panel are untouched — no panel sliding in and
shifting layout under an open menu. Radix stamps `data-state="open"` on the
trigger; style it with the same ring the selected row uses, so the menu's target
is unmistakable. Marks a target, does not navigate — Explorer / VS Code behavior.

## Implementation

- `npm i @radix-ui/react-context-menu` — tenth Radix primitive alongside the nine
  vendored; ~15 of its ~20 deps are already on disk via popover/select/dialog, so
  the real delta is about 3 packages. It buys cursor positioning, viewport
  collision flip, submenu open/close intent, roving arrow-key focus, typeahead,
  Escape, outside-click, focus return to the row, and the Windows Menu /
  Shift+F10 key (which fires `contextmenu` on the focused row — rows are already
  tabbable and arrow-navigable, so keyboard access needs no extra shortcut).
  Rejected: anchoring the installed Popover at the cursor (it is `role="dialog"`;
  menu semantics, roving focus and both submenus would be hand-rolled — the code
  the dependency exists to delete) and a hand-rolled div (no keyboard nav, no
  focus return, no collision handling; below the accessibility floor).
- `src/components/ui/context-menu.tsx` — shadcn primitive, themed like the
  existing `popover.tsx`.
- `src/components/tasks/TaskContextMenu.tsx` — the items.
- `TaskCard` wraps its own root: `ContextMenu > Trigger asChild > <the existing row div>`.
  Callers untouched; the `data-state=open` highlight lands on the same element as
  the selected-row ring, keeping both in one `className`.

## Native WebView2 menu

Nothing suppresses it today, so right-clicking anywhere in the app currently
offers "Reload / Save as / Print". Radix replaces it on rows; leaving it
everywhere else reads as broken next to a real menu one row below.

Four lines in `AppShell`: a `contextmenu` listener that `preventDefault`s unless
the target is an `input`, `textarea` or `contenteditable` — so copy/paste and
spellcheck survive in the title and notes fields — gated on `import.meta.env.PROD`
so Inspect Element still works in `npm run tauri dev`.

## Verification

- **Unit:** `dueDatePatch` cases in `reminder.test.ts` — relative reanchors,
  absolute untouched, clear nulls it, 09:00 fallback. `quickDate` was already
  covered by `dateChips.test.ts`.
- **E2E, against the real desktop app** (tauri-driver + msedgedriver): nine
  checks, all passing — menu contents; row marked via `data-state=open` with the
  detail panel *not* opening; Escape; the priority radio showing and changing the
  current value; `Clear` appearing only once a due date exists; the toggle
  relabelling itself; delete through the shared dialog; the native-menu
  suppression (dispatch `contextmenu` and read `defaultPrevented` — prevented on
  a heading, not on `#task-search`); and the reanchor end-to-end, reading
  `reminder_json` back out of SQLite after setting a due date from the menu.
- **One test kept permanently** in `e2e/smoke.test.mjs` (a deviation from the
  "no e2e" call during grilling — see the regression below). The rest was a
  throwaway script.
- No component test: `vitest` runs `environment: "node"` over `*.test.ts` only
  and no `@testing-library` is installed.

## Regression found and fixed during verification

Deleting from the menu opened the confirm dialog in the same tick that Radix was
unmounting the menu. Radix restores `<body>`'s `pointer-events` on unmount, that
cleanup ran last, and the app was left with `pointer-events: none` on `<body>` —
**dead to the mouse**, while every DOM-level assertion still passed. The
detail-panel delete path was unaffected, which is how it was isolated.

Fixed by opening the dialog one macrotask later (`setTimeout(…, 0)` in the
item's `onSelect`, commented at the call site). The smoke-suite test ends on a
plain nav click, because that is the only assertion the frozen state fails.

## Non-goals

Duplicate task, copy title, multi-select bulk actions, a menu on empty list space,
a calendar inside the submenu, any Rust-side or native-menu work.

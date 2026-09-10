# Roadmap — correcting the record (post-v0.7)

*Written 2026-09-10 against v0.7.1. Supersedes the post-v0.6 "habit depth"
roadmap, all four tiers of which shipped in v0.7.0 (kept as a record at the
bottom).*

**Status: all four tiers landed in v0.8.0.** The diff was one pure function
(`retroActionFor`), one component (`HistoryStrip`) and four tests — the
"no migration, no new query, no new store field" claim below held.

## The theme

v0.4–v0.7 built the log, graded it, and put it on screen: streaks, adherence, a
`N missed` badge, a `/habits` page. The app now tells you a habit is going badly
and gives you no reply. **"I did that one, I just forgot to tick it"** currently
requires opening SQLite.

This is one pass that makes the history editable — and *only* the history. The
red squares are already on screen, already correctly graded, already in two
places. They just aren't clickable.

- **Decision:** `docs/adr/0005-retroactive-completion.md` — what a retroactive
  write may and may not touch. Written first, because the roadmap it replaces
  said this was a decision before it was a feature.
- **Spec:** `docs/superpowers/specs/2026-09-10-retroactive-check-off.md`
- **Plan:** `docs/superpowers/plans/2026-09-10-retroactive-check-off.md` — four
  phases, subagent-driven, ending at v0.8.0.

## Tiers

1. **ADR-0005** — a retroactive write touches `task_completions` and nothing
   else: no `status`, no `dueDate`, no reminder re-anchor, no roll-forward. Today
   stays the checkbox's, because the checkbox's side effects are right for today
   and wrong for three weeks ago.
2. **`retroActionFor()`** — one pure function over a strip cell: `add` on a past
   `missed` day, `clear` on a past recorded one, `null` everywhere else. The only
   branch in the feature, so the only thing that needs a test.
3. **The strip's cells become buttons.** Same 30 squares, same grading, same
   stats line — plus a real hit area, keyboard focus, an imperative label and a
   `click a day to fix it` hint. Writes go through the store's existing
   `markDone` / `unmarkDone`, which already take an arbitrary date.
4. **The task detail and `/habits` get it for free** — both already render
   `HistoryStrip`, and neither file changes. If one needs a prop, tier 3 went
   wrong.

**No migration, no new query, no new store field, no new component, no new
dependency.** Every piece exists; this pass makes an existing read surface
writable.

## Explicitly not on this roadmap

- **Bulk catch-up** ("mark the whole week") — the natural next ask if the strip
  proves fiddly for a real backlog. It reuses the same write, so it is a UI
  decision, not an architectural one. Wait for the complaint.
- **Logging work on days the rule never scheduled** — "log arbitrary work" is a
  different feature from "correct the record". The rule is the schedule.
- **Editing history older than the strip's 30 days** — the window is the bound.
- **Marking a retroactive row as retroactive** — no reader; a column with no
  reader is a migration for nothing.
- **Retroactive completion of one-off tasks** — their record is `status` +
  `completedAt`, a different write path, and the strip doesn't render for them.
- **Per-habit targets ("3× a week")** — still a second schedule competing with
  the rule.
- **Cloud sync / multi-device** — still a rearchitecture, not a feature.
- **OS-level reminder scheduling** — ADR-0001 stands; don't relitigate.

---

## Previous roadmap — post-v0.6 "habit depth", all landed in v0.7.0

Kept as a record; the detail lives in
`docs/superpowers/specs/2026-09-08-habit-depth.md` and in CONTEXT.md.

1. **`habitStats()`** — one pure function over `task_completions` +
   `isOccurrenceOn`, the single source for every habit number in the app.
2. **Stats in the task detail** — the history strip widened to 30 days and gained
   `🔥 5-day streak · 12 of 14 scheduled days · 86%`.
3. **`N missed` badge on the task row** — driven from the completion store, not a
   per-row query.
4. **`/habits` view** — every recurring task, its strip and its stats on one page.

Delivered with no migration, no new query and no new dependency, as specified.
v0.7.1 then stopped the calendar painting past occurrences of recurring tasks.

## Roadmap before that — post-v0.2, all landed in v0.3.0

CI, the signed auto-updater, the E2E smoke suite, launch-time DB backups, the
global quick-add hotkey, search across notes/tags/subtasks, the Ctrl+K command
palette and the reminder copy fix. Detail is in git history and CONTEXT.md; the
two operational constraints that outlived the pass — the
`TAURI_SIGNING_PRIVATE_KEY` secrets and **the repo must stay public** or the
update feed 404s — live in CLAUDE.md.

# Roadmap — habit depth (post-v0.6)

*Written 2026-09-08 against v0.6.1. Supersedes the post-v0.2 roadmap, all ten
items of which shipped in v0.3.0 (kept as a record at the bottom).*

## The theme

The completion log (v0.4), the missed-occurrence catch-up (v0.5) and the
per-occurrence calendar (v0.6) put per-day truth on disk and graded it. The app
still never says **how a habit is going**. This roadmap is one pass that answers
that from data already stored — no migration, no new query, no new dependency.

- **Spec:** `docs/superpowers/specs/2026-09-08-habit-depth.md` — the definitions
  (scheduled / done / missed / adherence / streak) and what is deliberately out.
- **Plan:** `docs/superpowers/plans/2026-09-08-habit-depth.md` — five phases,
  subagent-driven, ending at v0.7.0.

## Tiers

1. **`habitStats()`** — one pure function over `task_completions` +
   `isOccurrenceOn`, the single source for every number below. Tested first,
   because it is the only real logic in the pass.
2. **Stats in the task detail** — the history strip widens to 30 days and gains
   `🔥 5-day streak · 12 of 14 scheduled days · 86%`, from the completion dates
   it already fetches.
3. **`N missed` badge on the task row** — post-ADR-0004 a habit missed all week
   reads as a healthy task due today. This is the badge CONTEXT.md named as the
   upgrade path. Driven from the completion store, not a per-row query.
4. **`/habits` view** — every recurring task, its strip and its stats on one
   page, reusing the components above.

## Explicitly not on this roadmap

- **Retroactive check-off** — the obvious next ask once misses are visible, and
  a write path that must not roll `dueDate` or re-anchor a reminder. A decision
  (probably an ADR) before it is a feature; the spec records the upgrade path.
- **Per-habit targets ("3× a week")** — a second schedule competing with the
  rule. The rule is the schedule.
- **Streak notifications / gamification** — the number is the feedback.
- **Cloud sync / multi-device** — still a rearchitecture, not a feature.
- **OS-level reminder scheduling** — ADR-0001 stands; don't relitigate.

---

## Previous roadmap — post-v0.2, all landed in v0.3.0

Kept as a record; the detail lives in the git history and in CONTEXT.md.

1. **v0.2.3 released** — the first release this automation delivered end to end.
2. **CONTEXT.md refreshed** — hardening pass marked done.
3. **CI on push/PR** — `.github/workflows/ci.yml`: `npm ci` → `tsc --noEmit` → `vitest run`.
4. **Auto-updater** — `tauri-plugin-updater`, signed artifacts, once-per-launch check.
   **Operationally required:** the `TAURI_SIGNING_PRIVATE_KEY` /
   `..._PASSWORD` repo secrets, and **the repo must stay public** — the release
   feed 404s to anyone unauthenticated, and a baked-in token would leak. Mirror
   `latest.json` + the installers publicly if that ever changes.
5. **E2E smoke suite** — `e2e/smoke.test.mjs` via `tauri-driver` + WebDriver, own bundle identifier so it can never touch real tasks.
6. **On-launch DB backup rotation** — `backup_db`, newest 5 kept, WAL sidecars included.
7. **Global quick-add hotkey** — Ctrl+Alt+A, reusing the tray's `tray://add-task`.
8. **Search across notes/tags/subtasks** — delivered **without** FTS5, as one predicate over the in-memory list.
9. **Command palette (Ctrl+K)** — `cmdk`, tasks plus view navigation.
10. **Reminder copy nit** — Notifications settings states that reminders fire only while the app runs (ADR-0001).

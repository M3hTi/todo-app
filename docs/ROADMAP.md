# Roadmap — elevating the app beyond v0.2

*Written 2026-07-04 against v0.2.3; every tier below was executed on 2026-08-25
and shipped in v0.3.0. Supersedes the (completed) hardening roadmap in
CONTEXT.md.*

## Status

All ten items are landed. What follows is the record of what each turned into —
keep it until the next roadmap replaces it.

## Tier 0 — Ship what already exists ✅

1. **Release v0.2.3.** Straggler docs committed, `v0.2.3` tagged and pushed, the
   release workflow ran green, and the draft was published — the first release
   this automation has ever delivered end-to-end. The stale, never-published
   v0.2.0 draft was deleted.
2. **CONTEXT.md refreshed** — hardening pass marked done, roadmap section now
   points here.

## Tier 1 — Engineering floor ✅

3. **CI on push/PR** — `.github/workflows/ci.yml`: `npm ci` → `tsc --noEmit` →
   `vitest run`, on `main` pushes and every PR. Ubuntu, frontend only; the Rust
   shell is compiled by the release build, which is where a Windows runner earns
   its cost.
4. **Auto-updater** — `tauri-plugin-updater` + `tauri-plugin-process`, signing
   keypair generated, `createUpdaterArtifacts` on, `includeUpdaterJson` in the
   release workflow. `src/lib/updater.ts` checks the release feed once per launch
   and offers a one-click download-install-restart; failures are silent, since an
   unreachable endpoint is not a problem for an offline-first app.
   **Operationally required:** the `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secrets — without them the bundle
   step of the release workflow fails.
   **Blocked at runtime while the repo is private:** v0.3.0 ships a correctly
   signed `latest.json`, but `https://github.com/M3hTi/todo-app/releases/latest/download/latest.json`
   returns 404 to anyone unauthenticated, so `check()` finds nothing and the
   toast never appears. Baking a token into the client would leak it. The fix is
   to make the repo public, or to mirror `latest.json` + the installers to a
   public location and point `plugins.updater.endpoints` there.

## Tier 2 — Kill the manual-GUI-verification bottleneck ✅

5. **E2E smoke suite** — `e2e/smoke.test.mjs`, driven by `tauri-driver` + Edge
   WebDriver through `webdriverio`, run by node's built-in test runner (no wdio
   runner, no mocha). Five scenarios: launch → add a task → search it by its
   description → complete it → relaunch and verify both the task and its
   completion persisted. Builds with an overridden bundle identifier so the suite
   owns its own database and can never touch real tasks. Setup in `e2e/README.md`.
   *Reminder-setting and recurrence roll-forward stayed in the unit suite
   (`reminder.test.ts`, `recurrence.test.ts`) — driving Radix selects through
   WebDriver buys coverage those tests already have.*
6. **On-launch SQLite backup rotation** — `backup_db` in `src-tauri/src/lib.rs`
   snapshots `todo-app.db` plus its `-wal`/`-shm` sidecars into
   `backups/<timestamp>/` before the frontend opens the database, keeping the
   newest 5.

## Tier 3 — Raise the product ceiling ✅

7. **Global quick-add hotkey** — Ctrl+Alt+A anywhere surfaces the window with
   the new-task form open, reusing the tray's existing `tray://add-task` event.
   Combination is fixed; a failed registration is logged, not fatal.
8. **Full-text search** — **delivered without FTS5.** Search now matches
   description, notes, tags and subtask titles as well as the title, as one
   predicate over the already-in-memory task list. `loadTasks` reads the whole
   table anyway, so an FTS5 table plus sync triggers would have bought ranking
   and prefix tokens at the cost of a migration and a write path to keep in sync.
   The upgrade is still there if a list ever outgrows a per-keystroke scan.
9. **Command palette (Ctrl+K)** — `cmdk` in `CommandPalette.tsx`: every task
   (matched on title, tags and notes) plus New task and the seven views. Built on
   `Command.Dialog` directly rather than adding a shadcn `ui/command.tsx` wrapper.
10. **Parked copy nit** — Notifications settings now states that reminders only
    fire while the app is running (ADR-0001).

## Explicitly not on the roadmap

- **Cloud sync / multi-device** — contradicts the local-first single-user
  architecture; a rearchitecture, not a feature. Revisit only if the
  product's goal changes.
- **OS-level reminder scheduling** — ADR-0001 ratified in-app polling; don't
  relitigate.

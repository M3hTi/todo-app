# Roadmap — elevating the app beyond v0.2

*Written 2026-07-04, against v0.2.3. Ordered by value-for-effort; each tier
assumes the one before it. Supersedes the (completed) hardening roadmap in
CONTEXT.md.*

## Where the project stands

- v0.2.3 is feature-complete with ~70 unit tests and a working tag-triggered
  release workflow (`.github/workflows/release.yml`).
- **But:** the only GitHub release ever created is the v0.2.0 draft, still
  unpublished. 0.2.1–0.2.3 were never tagged. No CI runs on push/PR — tests
  and typecheck are local-only. The hardening roadmap in CONTEXT.md is fully
  landed but still written as "in flight".

## Tier 0 — Ship what already exists (an hour, do first)

1. **Commit stragglers + release v0.2.3.** Commit the CLAUDE.md edit and
   untracked `docs/agents/`, tag `v0.2.3`, push the tag, publish the draft
   release. The automation exists and has never delivered a release end-to-end.
2. **Refresh CONTEXT.md** — mark the hardening pass done, point its roadmap
   section here.

## Tier 1 — Engineering floor (a weekend)

3. **CI on push/PR.** One ~20-line workflow: `npm ci`, `tsc --noEmit`,
   `vitest run`. Today `main` can break silently between releases; this is the
   cheapest insurance in the plan.
4. **Auto-updater.** `tauri-plugin-updater` + signing keypair; extend the
   release workflow to emit `latest.json`. Replaces manual-MSI-download +
   UAC reinstall with in-app updates — the single biggest
   "hobby app → real product" jump available.

## Tier 2 — Kill the manual-GUI-verification bottleneck (1–2 weekends)

5. **E2E smoke suite** via `tauri-driver` + Edge WebDriver. ~5 scenarios:
   launch → add task → set reminder → complete recurring task → relaunch →
   verify persistence. Every native-touching change currently blocks on manual
   GUI verification before dependent work can stack; this removes most of it.
6. **On-launch SQLite backup rotation.** Copy the DB to `backups/`, keep last
   N — a few lines. The DB in `%APPDATA%` is the only copy of user data with
   no sync; one corruption is total loss.

## Tier 3 — Raise the product ceiling (pick by taste, any order)

7. **Global quick-add hotkey** (`global-shortcut` plugin) — capture a task
   from anywhere without focusing the app. Marquee feature for a
   tray-resident todo app.
8. **Full-text search** across titles/notes/tags via SQLite FTS5 — already in
   SQLite, zero new dependencies.
9. **Command palette (Ctrl+K)** — `cmdk` pairs with the existing Radix stack;
   becomes the front door for search + quick actions.
10. **Parked copy nit** — one line in Notifications settings stating reminders
    only fire while the app runs (ADR-0001).

## Explicitly not on the roadmap

- **Cloud sync / multi-device** — contradicts the local-first single-user
  architecture; a rearchitecture, not a feature. Revisit only if the
  product's goal changes.
- **OS-level reminder scheduling** — ADR-0001 ratified in-app polling; don't
  relitigate.

## If you only do three things

Publish v0.2.3 → add CI → add the updater. That takes the project from
"works on my machine, releases by hand" to a self-updating product with a
guarded main branch — the biggest level-up per hour spent.

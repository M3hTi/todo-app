# Todo App — Agent Instructions

## Commands

- `npm run tauri dev` — run the full desktop app (React frontend + Rust tray/window shell).
- `npm run dev` — frontend only in a browser; native plugins (sql, tray, notification) are unavailable.
- `npm test` — run the Vitest suite (`npm run test:watch` to watch). Run before claiming a change works.
- `npx tsc --noEmit` — typecheck under strict mode (also runs inside `npm run build`).
- `npm run tauri build` — produce the `.msi` installer.
- `npm run e2e:build` then `npm run test:e2e` — WebDriver smoke suite against the
  real desktop app (isolated database; needs `tauri-driver` + `msedgedriver` —
  see `e2e/README.md`). Run it before releasing native-shell or persistence changes.
- Use `npm`, not yarn. All commands run on Windows.

## Architecture

Local-first Windows desktop todo app: a Tauri v2 native shell wrapping a React 18 + TypeScript (strict) frontend, with all persistence in SQLite via `@tauri-apps/plugin-sql`.

- **Data flow (one direction):** UI components → Zustand stores (`src/store/`) → typed query modules (`src/lib/queries/`) → SQLite. Stores never mutate state without a corresponding DB write.
- **Rust side (`src-tauri/src/lib.rs`):** registers plugins (sql, notification, dialog, fs, opener, autostart, updater, process, global-shortcut) and owns *only* the native shell — tray icon/menu/tooltip, close-to-tray window interception, the launch-time DB backup rotation, the system-wide Ctrl+Alt+A quick-add, and the `update_tray`/`quit_app` commands. It holds no task/business logic; the frontend pushes tray state in and decides close behavior.
- **Releases:** tag `vX.Y.Z` → `.github/workflows/release.yml` builds, signs and drafts a GitHub Release with `latest.json`; the in-app updater (`src/lib/updater.ts`) polls it on launch. Signing needs the `TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD` repo secrets. **The updater cannot actually reach that feed while the repo is private** — the download URL 404s unauthenticated. `.github/workflows/ci.yml` typechecks and tests every push/PR.
- **Shared types:** live exclusively in `src/types/index.ts`.
- **Styling:** Tailwind CSS v3 + shadcn/ui primitives (`src/components/ui/`); CSS-variable theme tokens in `src/styles/globals.css` (light/dark via the `dark` class).
- **Routing:** React Router v6 in hash mode; views in `src/features/` are thin wrappers over the shared `TaskList` with pre-applied filters.

## Conventions

- TypeScript strict; no `any` unless unavoidable and commented.
- Import shared types from `src/types/index.ts` — never redefine them.
- Import alias `@/` → `src/`.
- DB query functions are typed, wrapped in try/catch, and throw `DbError`; raw DB errors are never shown to the user.
- Tauri v2 permissions are declared in `src-tauri/capabilities/default.json` (not `tauri.conf.json`).

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `M3hTi/todo-app` (via the `gh` CLI); external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root (created lazily, not upfront). See `docs/agents/domain.md`.

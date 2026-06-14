# Todo App — Agent Instructions

## Architecture

A local-first Windows desktop todo app built on Tauri v2 with a React 18 + TypeScript (strict) frontend. All persistence goes through SQLite via `@tauri-apps/plugin-sql`. The Rust side (`src-tauri/src/lib.rs`) registers plugins (sql, notification, dialog, fs, opener, autostart) and owns only the native tray/window shell — the system-tray icon/menu/tooltip, the close-to-tray window interception, and the `update_tray`/`quit_app` commands — but holds no task/business logic: the React frontend pushes tray state in and decides close behavior. Data flows one way: UI components → Zustand stores (`src/store/`) → typed query modules (`src/lib/queries/`) → SQLite; stores never mutate state without a corresponding DB write. Shared domain types live exclusively in `src/types/index.ts`. Styling is Tailwind CSS v3 with shadcn/ui primitives (`src/components/ui/`) and CSS-variable theme tokens in `src/styles/globals.css` (light/dark via `dark` class). Routing uses React Router v6 in hash mode; views in `src/features/` are thin wrappers over the shared `TaskList` with pre-applied filters.

## Conventions

- TypeScript strict mode; no `any` unless unavoidable and commented.
- All shared types come from `src/types/index.ts` — never redefine them.
- Import alias `@/` → `src/`.
- DB query functions are typed, wrapped in try/catch, and throw `DbError` objects; raw DB errors are never shown to the user.
- Tauri v2 permissions are declared in `src-tauri/capabilities/default.json` (not `tauri.conf.json`).
- Use `npm` (not yarn); all commands must run on Windows.
- `npm run tauri dev` for development, `npm run tauri build` for the `.msi` installer.

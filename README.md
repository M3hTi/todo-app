# Todo App

## Overview

A local-first todo desktop app for Windows built with Tauri v2 and React 18. All data lives in a SQLite database on your machine — no accounts, no cloud, no telemetry. The UI is a three-column layout (navigation sidebar, task list, detail panel) with a dashboard, calendar, recurring tasks, reminders via native Windows notifications, and JSON/CSV import-export.

## Features

- Tasks with status, priority, due date/time, category, tags, subtasks, notes and reminders
- Views: All Tasks, Today, Upcoming (grouped by date), Completed, Overdue, per-category
- Dashboard with stat cards, completion-rate ring, day streak and a 7-day completion chart
- Calendar month view with per-day task pills and a day drawer
- Recurring tasks: daily, weekly (specific days), monthly (specific day), yearly, with optional end date
- Reminders via native Windows notifications while the app is running; missed reminders surface as a grouped toast on launch
- Search (debounced), filters (status / priority / category / tags) and sorting
- Drag-to-reorder subtasks
- Light / Dark / System theme
- JSON export & merge-import, CSV export
- Keyboard shortcuts (see table below)
- Danger-zone full data reset (type `RESET` to confirm)

## Prerequisites

- Node.js 18+
- Rust (stable) — install via [rustup](https://rustup.rs)
- Visual Studio Build Tools 2022 with the "Desktop development with C++" workload (MSVC linker + Windows SDK)
- WebView2 runtime (preinstalled on Windows 10/11)

## Installation

```bash
git clone <repo>
cd todo-app
npm install
```

## Development

```bash
npm run tauri dev
```

The first run compiles the Rust side and takes a few minutes; subsequent runs are fast.

## Build for Windows

```bash
npm run tauri build
```

Outputs to `src-tauri/target/release/bundle/`.

Installer path: `src-tauri/target/release/bundle/msi/todo-app_0.1.0_x64_en-US.msi`

## Data storage location

All data is stored in a single SQLite database (WAL mode) at:

```
%APPDATA%\com.asus.todo-app\todo-app.db
```

Back it up by copying the file, or use **Settings → Data → Export JSON**.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+N` | Open new task modal |
| `Ctrl+F` | Focus search input |
| `Ctrl+D` | Mark selected task complete |
| `Delete` | Delete selected task (with confirm) |
| `Ctrl+1` | Navigate to Today |
| `Ctrl+2` | Navigate to Upcoming |
| `Ctrl+,` | Navigate to Settings |
| `Escape` | Close modal / deselect task |
| `↑` / `↓` | Move focus between tasks in a list |

## Known limitations

- Reminders only fire while the app is running (no background daemon)
- No cloud sync (by design — local-first)
- No mobile support
- Recurring task history is not preserved (the same record is rolled forward)
- No offline-first conflict resolution (single device)

## Future improvements

- System tray with background reminder daemon
- Drag-to-reorder tasks in the list (manual sort exists, reorder UI does not)
- Natural-language quick-add ("tomorrow 5pm pay rent")
- Optional encrypted sync between devices
- Per-category default settings and custom views
- Localization

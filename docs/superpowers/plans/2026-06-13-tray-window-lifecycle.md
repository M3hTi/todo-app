# Tray, Window Lifecycle & Launch-on-Startup — Implementation Plan (1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the window's "X" minimize to the system tray (IDM-style, with a first-run prompt), add a tray menu listing today's/upcoming tasks plus quick actions and a tooltip count, and add a "launch on startup" option.

**Architecture:** Rust owns only the native tray icon, tray menu, tooltip, and the window-close interception. It holds no task logic: the React frontend (the source of truth via SQLite) pushes tray contents in through an `update_tray` command (debounced) whenever tasks change, and Rust emits events (`close-requested`, `tray://open-task`, `tray://add-task`) back to the frontend, which decides what to do.

**Tech Stack:** Tauri v2 (`tray-icon` feature, `tauri-plugin-autostart`), React 18 + TypeScript, Zustand, SQLite via `@tauri-apps/plugin-sql`, Vitest (new, for pure logic).

**Scope note:** This is plan 1 of 3 derived from `docs/superpowers/specs/2026-06-13-tray-reminders-datepicker-design.md`. Plan 2 = reminder rework (spec §4); Plan 3 = date picker (spec §5). A distinct "alert" tray icon for the overdue badge is intentionally **out of scope here** — overdue is surfaced via the tray tooltip count; swapping the icon image is a later cosmetic add-on that needs an art asset.

---

## Prerequisites

- `npm install` already run in `todo-app/` (it has been).
- A Rust toolchain + Tauri prerequisites are installed (the project already builds).
- All commands run from `d:\ToDo App\todo-app` (the project root with `package.json`) unless a path says otherwise.

---

### Task 0: Initialize version control (recommended)

This workspace is **not** a git repo yet, so the commit steps below have nothing to commit into. Initialize one so each task is a checkpoint. If you prefer not to use git, skip this task and treat every "Commit" step as a no-op checkpoint.

**Files:** none (creates `.git/`)

- [ ] **Step 1: Initialize the repo and make a baseline commit**

```bash
git init
git add -A
git commit -m "chore: baseline before tray/window-lifecycle work"
```

---

### Task 1: Add dependencies and Vitest

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Enable the `tray-icon` Tauri feature and add the autostart crate**

In `src-tauri/Cargo.toml`, change the `tauri` dependency line and add the autostart plugin under `[dependencies]`:

```toml
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-notification = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-autostart = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Add the JS autostart plugin and Vitest**

Run:

```bash
npm install @tauri-apps/plugin-autostart
npm install -D vitest
```

- [ ] **Step 3: Add test scripts**

In `package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4: Create the Vitest config (mirrors the Vite `@` alias)**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Verify the toolchain still resolves**

Run: `npm run test`
Expected: Vitest runs and reports **"No test files found"** (no tests yet) and exits 0.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml package.json package-lock.json vitest.config.ts
git commit -m "build: add tray-icon feature, autostart plugin, and vitest"
```

---

### Task 2: Extend `AppSettings` with `closeBehavior` and `launchOnStartup`

These are key-value JSON settings rows, so no DB schema migration is needed — only the default maps (duplicated across four files today) and the export schema.

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/db.ts:104-109`
- Modify: `src/store/useSettingsStore.ts:13-18`
- Modify: `src/lib/queries/settings.ts:4-9`
- Modify: `src/features/settings/SettingsView.tsx:91-97`

- [ ] **Step 1: Add the type and the two new fields**

In `src/types/index.ts`, add the `CloseBehavior` type near the other type aliases (after the `Theme` line) and the two fields to `AppSettings`:

```ts
export type CloseBehavior = 'ask' | 'tray' | 'quit';
```

```ts
export interface AppSettings {
  theme: Theme;
  defaultCategoryId?: string;
  defaultPriority: TaskPriority;
  defaultReminderMinutesBefore: number;   // 0 = disabled
  notificationsEnabled: boolean;
  closeBehavior: CloseBehavior;
  launchOnStartup: boolean;
}
```

- [ ] **Step 2: Add defaults in `db.ts`**

In `src/lib/db.ts`, update `DEFAULT_SETTINGS` (around line 104):

```ts
const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  theme: "System",
  defaultPriority: "Medium",
  defaultReminderMinutesBefore: 15,
  notificationsEnabled: true,
  closeBehavior: "ask",
  launchOnStartup: false,
};
```

- [ ] **Step 3: Add defaults in `useSettingsStore.ts`**

In `src/store/useSettingsStore.ts`, update `DEFAULT_SETTINGS` (around line 13):

```ts
const DEFAULT_SETTINGS: AppSettings = {
  theme: "System",
  defaultPriority: "Medium",
  defaultReminderMinutesBefore: 15,
  notificationsEnabled: true,
  closeBehavior: "ask",
  launchOnStartup: false,
};
```

- [ ] **Step 4: Add defaults in `queries/settings.ts`**

In `src/lib/queries/settings.ts`, update `DEFAULTS` (around line 4):

```ts
const DEFAULTS: AppSettings = {
  theme: "System",
  defaultPriority: "Medium",
  defaultReminderMinutesBefore: 15,
  notificationsEnabled: true,
  closeBehavior: "ask",
  launchOnStartup: false,
};
```

- [ ] **Step 5: Keep export/import backward-compatible**

In `src/features/settings/SettingsView.tsx`, update `settingsSchema` (around line 91) so old export files (without the new keys) still import cleanly via `.default(...)`:

```ts
const settingsSchema = z.object({
  theme: z.enum(["Light", "Dark", "System"]),
  defaultCategoryId: z.string().optional(),
  defaultPriority: z.enum(["Low", "Medium", "High", "Urgent"]),
  defaultReminderMinutesBefore: z.number(),
  notificationsEnabled: z.boolean(),
  closeBehavior: z.enum(["ask", "tray", "quit"]).default("ask"),
  launchOnStartup: z.boolean().default(false),
});
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`
Expected: `tsc` passes with no type errors and Vite builds.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/db.ts src/store/useSettingsStore.ts src/lib/queries/settings.ts src/features/settings/SettingsView.tsx
git commit -m "feat(settings): add closeBehavior and launchOnStartup settings"
```

---

### Task 3: Rust native shell (tray, close interception, autostart, commands)

This replaces `src-tauri/src/lib.rs` wholesale. It compiles to a working tray + close interception; the frontend wiring comes in later tasks.

**Files:**
- Modify (replace contents): `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the full `lib.rs`**

Replace the entire contents of `src-tauri/src/lib.rs` with:

```rust
// Rust owns only the native tray/window shell. All task & reminder logic lives
// in the React frontend, which pushes tray state in via `update_tray`.
use serde::Deserialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;

#[derive(Deserialize)]
struct TrayMenuItem {
    id: String,
    label: String,
}

#[derive(Deserialize)]
struct TrayPayload {
    tooltip: String,
    today: Vec<TrayMenuItem>,
    upcoming: Vec<TrayMenuItem>,
}

/// Shows, unminimizes and focuses the main window.
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Builds the tray context menu from the frontend-supplied payload.
fn build_tray_menu(
    app: &AppHandle,
    payload: &TrayPayload,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mut builder = MenuBuilder::new(app);

    if !payload.today.is_empty() {
        let header = MenuItemBuilder::with_id(
            "header:today",
            format!("Today ({})", payload.today.len()),
        )
        .enabled(false)
        .build(app)?;
        builder = builder.item(&header);
        for task in &payload.today {
            let item =
                MenuItemBuilder::with_id(format!("open-task:{}", task.id), &task.label).build(app)?;
            builder = builder.item(&item);
        }
    }

    if !payload.upcoming.is_empty() {
        let header = MenuItemBuilder::with_id("header:upcoming", "Upcoming")
            .enabled(false)
            .build(app)?;
        builder = builder.item(&header);
        for task in &payload.upcoming {
            let item =
                MenuItemBuilder::with_id(format!("open-task:{}", task.id), &task.label).build(app)?;
            builder = builder.item(&item);
        }
    }

    let add = MenuItemBuilder::with_id("add-task", "+ Add task…").build(app)?;
    let show = MenuItemBuilder::with_id("show", "Show Todo App").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    builder
        .separator()
        .item(&add)
        .separator()
        .item(&show)
        .item(&quit)
        .build()
}

/// Replaces the tray menu and tooltip with fresh data from the frontend.
#[tauri::command]
fn update_tray(app: AppHandle, payload: TrayPayload) -> Result<(), String> {
    let menu = build_tray_menu(&app, &payload).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        tray.set_tooltip(Some(&payload.tooltip))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Fully exits the app (invoked by the frontend when the user chooses "Quit").
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![update_tray, quit_app])
        .setup(|app| {
            let menu = MenuBuilder::new(app)
                .item(&MenuItemBuilder::with_id("show", "Show Todo App").build(app)?)
                .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
                .build()?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Todo App")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    if let Some(task_id) = id.strip_prefix("open-task:") {
                        let _ = app.emit("tray://open-task", task_id.to_string());
                        show_main(app);
                    } else if id == "add-task" {
                        let _ = app.emit("tray://add-task", ());
                        show_main(app);
                    } else if id == "show" {
                        show_main(app);
                    } else if id == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // Launched by autostart with --minimized: start hidden in the tray.
            if std::env::args().any(|arg| arg == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Type-check the Rust crate**

Run: `cd src-tauri && cargo check`
Expected: compiles successfully (warnings OK).

Note: Tauri 2.x has had minor renames across point releases. If `cargo check` flags a name (e.g. `show_menu_on_left_click`, `tray_by_id`, `MouseButtonState`), confirm the exact symbol on docs.rs for your installed `tauri` version and adjust — the structure stays the same.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tray): native tray, close interception, autostart, tray commands"
```

---

### Task 4: Grant the new capabilities

**Files:**
- Modify (replace contents): `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add tray, window, and autostart permissions**

Replace the contents of `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window capability: window, tray, menu, notification, fs, dialog, sql, autostart",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-set-title",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-unminimize",
    "core:window:allow-set-focus",
    "core:tray:default",
    "core:menu:default",
    "opener:default",
    "notification:default",
    "dialog:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    {
      "identifier": "fs:scope",
      "allow": [{ "path": "**" }, { "path": "$HOME/**" }, { "path": "$APPDATA/**" }]
    },
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
  ]
}
```

- [ ] **Step 2: Verify the app launches with the tray (static menu for now)**

Run: `npm run tauri dev`
Expected: the app builds and runs; a tray icon appears. Right-click → a menu with "Show Todo App" and "Quit". Click "X" on the window → the window does **not** close (a console/devtools confirm event will be visible once Task 7 wires it; for now the window simply stays open because close is prevented). "Quit" in the tray exits the app. Close the dev process when satisfied.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat(tray): grant tray, window, and autostart capabilities"
```

---

### Task 5: Tray payload builder (pure logic, TDD)

A pure function that turns the task list into the tray payload (today list, upcoming list, overdue count, tooltip). This is the one piece worth unit-testing.

**Files:**
- Create: `src/lib/tray.ts`
- Test: `src/lib/tray.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tray.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTrayPayload } from "./tray";
import type { Task } from "@/types";

function makeTask(partial: Partial<Task>): Task {
  return {
    id: "t1",
    title: "Task",
    status: "Not Started",
    priority: "Medium",
    tags: [],
    subtasks: [],
    sortOrder: 0,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...partial,
  };
}

const NOW = new Date("2026-06-13T12:00:00");

describe("buildTrayPayload", () => {
  it("lists open tasks due today with their time", () => {
    const tasks = [
      makeTask({ id: "a", title: "Pay rent", dueDate: "2026-06-13", dueTime: "09:00" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.today).toEqual([{ id: "a", label: "Pay rent  09:00" }]);
  });

  it("lists upcoming tasks sorted by date ascending", () => {
    const tasks = [
      makeTask({ id: "b", title: "Later", dueDate: "2026-06-20" }),
      makeTask({ id: "c", title: "Sooner", dueDate: "2026-06-16" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.upcoming.map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("counts overdue open tasks and excludes completed/cancelled", () => {
    const tasks = [
      makeTask({ id: "d", dueDate: "2026-06-10" }),
      makeTask({ id: "e", dueDate: "2026-06-10", status: "Completed" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.overdue).toBe(1);
    expect(payload.tooltip).toBe("Today: 0 · Overdue: 1");
  });

  it("excludes completed/cancelled tasks from the today list", () => {
    const tasks = [
      makeTask({ id: "f", title: "Done", dueDate: "2026-06-13", status: "Completed" }),
    ];
    const payload = buildTrayPayload(tasks, NOW);
    expect(payload.today).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test`
Expected: FAIL — `buildTrayPayload` is not exported / module `./tray` has no such export.

- [ ] **Step 3: Implement `tray.ts`**

Create `src/lib/tray.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { format, parseISO } from "date-fns";
import type { Task } from "@/types";

export interface TrayMenuItem {
  id: string;
  label: string;
}

export interface TrayPayload {
  tooltip: string;
  overdue: number;
  today: TrayMenuItem[];
  upcoming: TrayMenuItem[];
}

const MAX_ITEMS = 10;

function isOpen(task: Task): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

/** Pure: turns the task list into the data the native tray needs. */
export function buildTrayPayload(tasks: Task[], now: Date): TrayPayload {
  const todayStr = format(now, "yyyy-MM-dd");
  const open = tasks.filter(isOpen);

  const dueToday = open.filter((task) => task.dueDate === todayStr);
  const upcoming = open
    .filter((task) => task.dueDate !== undefined && task.dueDate > todayStr)
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  const overdue = open.filter(
    (task) => task.dueDate !== undefined && task.dueDate < todayStr,
  ).length;

  const today = dueToday.slice(0, MAX_ITEMS).map((task) => ({
    id: task.id,
    label: task.dueTime ? `${task.title}  ${task.dueTime}` : task.title,
  }));
  const upcomingItems = upcoming.slice(0, MAX_ITEMS).map((task) => ({
    id: task.id,
    label: `${task.title}  ${format(parseISO(task.dueDate as string), "EEE")}`,
  }));

  return {
    tooltip: `Today: ${dueToday.length} · Overdue: ${overdue}`,
    overdue,
    today,
    upcoming: upcomingItems,
  };
}

/** Pushes the freshly built payload to the native tray. */
export async function pushTrayPayload(tasks: Task[], now: Date): Promise<void> {
  await invoke("update_tray", { payload: buildTrayPayload(tasks, now) });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test`
Expected: PASS — all four `buildTrayPayload` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tray.ts src/lib/tray.test.ts
git commit -m "feat(tray): tray payload builder with tests"
```

---

### Task 6: `useTray` hook — debounced push + click routing

**Files:**
- Create: `src/hooks/useTray.ts`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useTray.ts`:

```ts
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTaskStore } from "@/store/useTaskStore";
import { pushTrayPayload } from "@/lib/tray";

const DEBOUNCE_MS = 300;

/**
 * Keeps the native tray menu/tooltip in sync with the task store (debounced so
 * bulk updates rebuild the menu once) and routes tray clicks back into the app.
 * Mounted once.
 */
export function useTray(): void {
  useEffect(() => {
    let timer: number | undefined;

    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void pushTrayPayload(useTaskStore.getState().tasks, new Date());
      }, DEBOUNCE_MS);
    };

    schedule(); // initial push once tasks are loaded

    const unsubscribe = useTaskStore.subscribe((state, prev) => {
      if (state.tasks !== prev.tasks) schedule();
    });

    const openTask = listen<string>("tray://open-task", (event) => {
      useTaskStore.getState().setSelectedTask(event.payload);
    });
    const addTask = listen("tray://add-task", () => {
      useTaskStore.getState().setTaskFormOpen(true);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      void openTask.then((unlisten) => unlisten());
      void addTask.then((unlisten) => unlisten());
    };
  }, []);
}
```

- [ ] **Step 2: Mount it in `AppShell`**

In `src/components/layout/AppShell.tsx`, add the import near the other hook imports (after the `useReminders` import on line 5):

```ts
import { useTray } from "@/hooks/useTray";
```

Then call it alongside the existing hooks (the block around line 24):

```ts
  // Mounted once after startup data is loaded.
  useReminders();
  useKeyboardShortcuts();
  useTray();
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `tsc` + Vite build pass.

- [ ] **Step 4: Manual check**

Run: `npm run tauri dev`
Expected: right-click the tray → the menu now lists today's and upcoming tasks (create a couple of tasks with due dates if needed). Clicking a task opens the window with its detail panel; "+ Add task…" opens the new-task form; the tray tooltip reads e.g. "Today: 1 · Overdue: 0". Close the dev process when satisfied.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTray.ts src/components/layout/AppShell.tsx
git commit -m "feat(tray): sync tray with task store and route tray clicks"
```

---

### Task 7: Close-to-tray behavior + first-run prompt

**Files:**
- Create: `src/hooks/useCloseBehavior.ts`
- Create: `src/components/layout/CloseBehaviorDialog.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create the close-behavior hook**

Create `src/hooks/useCloseBehavior.ts`:

```ts
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "@/store/useSettingsStore";

/**
 * Reacts to the window close button per the user's setting. Calls `onAsk` when
 * no preference is stored yet so the caller can show the first-run prompt.
 */
export function useCloseBehavior(onAsk: () => void): void {
  useEffect(() => {
    const pending = listen("close-requested", () => {
      const behavior = useSettingsStore.getState().settings.closeBehavior;
      if (behavior === "tray") {
        void getCurrentWindow().hide();
      } else if (behavior === "quit") {
        void invoke("quit_app");
      } else {
        onAsk();
      }
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [onAsk]);
}
```

- [ ] **Step 2: Create the first-run dialog**

Create `src/components/layout/CloseBehaviorDialog.tsx`:

```tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CloseBehaviorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** First-run prompt: minimize to tray or quit, with an optional remember. */
export function CloseBehaviorDialog({ open, onOpenChange }: CloseBehaviorDialogProps) {
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const [remember, setRemember] = useState(true);

  const choose = async (behavior: "tray" | "quit"): Promise<void> => {
    if (remember) await updateSetting("closeBehavior", behavior);
    onOpenChange(false);
    if (behavior === "tray") {
      await getCurrentWindow().hide();
    } else {
      await invoke("quit_app");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keep Todo App running in the tray?</DialogTitle>
          <DialogDescription>
            Minimizing to the system tray keeps reminders running. Quitting closes the app
            completely and stops reminders until you reopen it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember-close"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <Label htmlFor="remember-close">Remember my choice</Label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => void choose("quit")}>
            Quit
          </Button>
          <Button onClick={() => void choose("tray")}>Minimize to tray</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire both into `AppShell`**

In `src/components/layout/AppShell.tsx`:

Update the React import on line 1 (it currently imports nothing from `react`; the file uses no React hooks yet) — add it at the top of the file:

```ts
import { useCallback, useState } from "react";
```

Add these imports near the other layout imports:

```ts
import { useCloseBehavior } from "@/hooks/useCloseBehavior";
import { CloseBehaviorDialog } from "@/components/layout/CloseBehaviorDialog";
```

Inside the `AppShell` component, add state + the hook next to the other hooks:

```ts
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const openClosePrompt = useCallback(() => setClosePromptOpen(true), []);

  // Mounted once after startup data is loaded.
  useReminders();
  useKeyboardShortcuts();
  useTray();
  useCloseBehavior(openClosePrompt);
```

Render the dialog alongside `<TaskForm />` (just after it):

```tsx
      <TaskForm />

      <CloseBehaviorDialog open={closePromptOpen} onOpenChange={setClosePromptOpen} />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: `tsc` + Vite build pass.

- [ ] **Step 5: Manual check of the full close flow**

Run: `npm run tauri dev`
Expected:
1. Click "X" → the first-run dialog appears. With "Remember my choice" checked, click **Minimize to tray** → window hides; tray icon remains; left-click the tray icon restores the window.
2. Click "X" again → no dialog this time; it hides straight to the tray (preference remembered).
3. (Reset to re-test the prompt: delete the `closeBehavior` row, e.g. in Settings → switch the new control, or wipe via the app's Reset; or set it back to `ask` through devtools by clearing the setting.)

Close the dev process when satisfied.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useCloseBehavior.ts src/components/layout/CloseBehaviorDialog.tsx src/components/layout/AppShell.tsx
git commit -m "feat(window): close-to-tray with first-run prompt"
```

---

### Task 8: Settings — "Window & startup" section

**Files:**
- Modify: `src/features/settings/SettingsView.tsx`

- [ ] **Step 1: Add imports**

In `src/features/settings/SettingsView.tsx`, add the autostart import near the other Tauri-plugin imports (after the notification import on line 5):

```ts
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
```

And add `CloseBehavior` to the type import on line 9:

```ts
import type { CloseBehavior, TaskPriority, Theme } from "@/types";
```

- [ ] **Step 2: Add autostart state + sync effect**

Inside `SettingsView`, next to the other `useState` declarations (around line 264), add:

```ts
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);
```

And next to the existing permission `useEffect` (around line 270), add:

```ts
  useEffect(() => {
    void isAutostartEnabled()
      .then(setAutostartOn)
      .catch(() => setAutostartOn(null));
  }, []);
```

- [ ] **Step 3: Add the autostart toggle handler**

After `handleNotificationsToggle` (around line 290), add:

```ts
  const handleAutostartToggle = async (on: boolean): Promise<void> => {
    try {
      if (on) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      setAutostartOn(on);
      await updateSetting("launchOnStartup", on);
    } catch {
      toast.error("Couldn't change the launch-on-startup setting.");
    }
  };
```

- [ ] **Step 4: Render the new section**

In the returned JSX, add this block immediately after the closing `</div>` of the "Notifications" section (i.e. just before the "Data" section `<div>` around line 526):

```tsx
      <div>
        <h3 className="text-base font-semibold">Window &amp; startup</h3>
        <Separator className="my-3" />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>When I close the window</Label>
              <p className="text-xs text-muted-foreground">
                Minimizing to the tray keeps reminders running. Quitting stops them until you
                reopen the app.
              </p>
            </div>
            <Select
              value={settings.closeBehavior === "quit" ? "quit" : "tray"}
              onValueChange={(value) => void updateSetting("closeBehavior", value as CloseBehavior)}
            >
              <SelectTrigger className="w-44" aria-label="When I close the window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tray">Minimize to tray</SelectItem>
                <SelectItem value="quit">Quit the app</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="launch-on-startup"
              checked={settings.launchOnStartup}
              onCheckedChange={(checked) => void handleAutostartToggle(checked === true)}
            />
            <Label htmlFor="launch-on-startup">
              Launch Todo App when Windows starts (minimized to tray)
            </Label>
          </div>
          {autostartOn !== null && autostartOn !== settings.launchOnStartup && (
            <p className="text-xs text-muted-foreground">
              System startup state and this setting differ; toggling will re-sync them.
            </p>
          )}
        </div>
      </div>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: `tsc` + Vite build pass.

- [ ] **Step 6: Manual check**

Run: `npm run tauri dev`
Expected: Settings shows a "Window & startup" section. Switching "When I close the window" to "Quit", then clicking the window "X", exits the app. Toggling "Launch Todo App when Windows starts" on then off succeeds without error. (Optional deep check: with it on, confirm a `Todo App` entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` whose command includes `--minimized`.) Close the dev process when satisfied.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/SettingsView.tsx
git commit -m "feat(settings): window close behavior and launch-on-startup controls"
```

---

### Task 9: Full end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm run test`
Expected: all `buildTrayPayload` tests PASS.

- [ ] **Step 2: Type-check + build the frontend and the Rust crate**

Run: `npm run build`
Then: `cd src-tauri && cargo check`
Expected: both succeed.

- [ ] **Step 3: Full manual smoke test**

Run: `npm run tauri dev` and verify, in order:
1. **First close** shows the prompt; "Minimize to tray" hides the window and remembers the choice.
2. **Left-click** the tray icon restores + focuses the window.
3. **Right-click** the tray shows Today/Upcoming task lists + "+ Add task…", "Show Todo App", "Quit"; the tooltip shows the today/overdue counts.
4. **Clicking a task** in the tray opens the window with that task's detail; **"+ Add task…"** opens the new-task form.
5. Editing tasks rapidly rebuilds the menu only after activity settles (debounce), not on every keystroke.
6. **Settings → Window & startup**: switching to "Quit" makes "X" exit; launch-on-startup toggles cleanly.
7. **Quit** from the tray exits the process.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify tray, close-to-tray, and startup behaviors"
```

---

## Self-Review (performed against the spec)

**Spec coverage (§1–3 of the design doc):**
- §1 Close-to-tray + quit + first-run prompt + setting → Tasks 2, 3, 7, 8. ✔
- §2 Tray icon, dynamic menu (today/upcoming + actions), tooltip count, click-to-open, add-task → Tasks 3, 4, 5, 6. ✔
- §2 Overdue **icon swap** → intentionally deferred (documented in the scope note); tooltip count delivers the overdue signal. ✔ (scoped)
- §3 Launch on startup (plugin + toggle + start-hidden) → Tasks 1, 3, 8. ✔
- Frontend↔Rust contract (`update_tray`, `quit_app`, `close-requested`, `tray://open-task`, `tray://add-task`) → Tasks 3, 5, 6, 7. ✔
- Permissions → Task 4. ✔

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one "adjust if a Tauri symbol was renamed" note is concrete guidance, not a deferred decision.

**Type/name consistency:** `update_tray` payload shape matches between Rust `TrayPayload`/`TrayMenuItem` (Task 3) and TS `TrayPayload`/`TrayMenuItem` (Task 5); event names match between Rust `emit` (Task 3) and TS `listen` (Tasks 6, 7); `closeBehavior`/`launchOnStartup`/`CloseBehavior` consistent across Tasks 2, 7, 8; `pushTrayPayload`/`buildTrayPayload` names consistent between Tasks 5 and 6.

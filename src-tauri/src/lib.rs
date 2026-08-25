// Rust owns only the native tray/window shell. All task & reminder logic lives
// in the React frontend, which pushes tray state in via `update_tray`.
use serde::Deserialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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

/// Number of launch-time database snapshots kept in `backups/`.
const KEEP_BACKUPS: usize = 5;

/// Deletes all but the newest `keep` snapshot directories. Names are
/// `YYYYMMDD-HHMMSS`, so lexical order is chronological order.
fn rotate_backups(backups: &std::path::Path, keep: usize) -> std::io::Result<()> {
    let mut dirs: Vec<std::path::PathBuf> = std::fs::read_dir(backups)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    dirs.sort();
    for old in dirs.iter().rev().skip(keep) {
        std::fs::remove_dir_all(old)?;
    }
    Ok(())
}

/// Snapshots the SQLite database into `backups/<timestamp>/` at launch, before
/// the frontend opens it. The DB in %APPDATA% is the only copy of the user's
/// data and nothing syncs it, so one corruption would otherwise be total loss.
/// The `-wal`/`-shm` sidecars are copied too: without them a snapshot taken
/// after an unclean shutdown would be missing the last committed writes.
fn backup_db(app: &AppHandle) -> std::io::Result<()> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    if !dir.join("todo-app.db").exists() {
        return Ok(()); // first launch: nothing to back up yet
    }

    let backups = dir.join("backups");
    let target = backups.join(chrono::Local::now().format("%Y%m%d-%H%M%S").to_string());
    std::fs::create_dir_all(&target)?;
    for suffix in ["", "-wal", "-shm"] {
        let name = format!("todo-app.db{suffix}");
        let src = dir.join(&name);
        if src.exists() {
            std::fs::copy(&src, target.join(&name))?;
        }
    }
    rotate_backups(&backups, KEEP_BACKUPS)
}

/// System-wide quick-add: Ctrl+Alt+A surfaces the window with the new-task form
/// open, from any app. Reuses the `tray://add-task` event the tray menu already
/// emits, so the frontend needs no new listener.
///
/// Ctrl+Shift+A was the first choice and was already taken on the development
/// machine — Windows hands a global combination to whoever asks first, so
/// registration failing is normal and never fatal.
///
/// ponytail: the combination is fixed. Making it configurable means a settings
/// UI, a capture widget and re-registration on change — worth it only once
/// someone actually hits a conflict on Ctrl+Alt+A.
fn register_quick_add_shortcut(app: &AppHandle) {
    let quick_add = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyA);

    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if shortcut == &quick_add && event.state() == ShortcutState::Pressed {
                let _ = app.emit("tray://add-task", ());
                show_main(app);
            }
        })
        .build();

    // Another app may already own the combination; that is not fatal, the
    // in-app Ctrl+N still works.
    if let Err(err) = app.plugin(plugin) {
        eprintln!("global shortcut plugin unavailable: {err}");
        return;
    }
    if let Err(err) = app.global_shortcut().register(quick_add) {
        eprintln!("quick-add shortcut (Ctrl+Alt+A) not registered: {err}");
    }
}

/// Fully exits the app (invoked by the frontend when the user chooses "Quit").
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: intercepts a second launch (e.g. re-clicking
        // the desktop icon) and surfaces the running window instead of spawning
        // another tray instance. The duplicate process then exits.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![update_tray, quit_app])
        .setup(|app| {
            register_quick_add_shortcut(app.handle());

            // Best-effort: a failed snapshot must never block launch.
            if let Err(err) = backup_db(app.handle()) {
                eprintln!("database backup skipped: {err}");
            }

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

#[cfg(test)]
mod tests {
    use super::rotate_backups;

    #[test]
    fn rotate_keeps_only_the_newest_snapshots() {
        let root = std::env::temp_dir().join(format!("todo-app-rotate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        for stamp in ["20260101-010101", "20260102-010101", "20260103-010101"] {
            std::fs::create_dir_all(root.join(stamp)).unwrap();
        }
        std::fs::write(root.join("stray.txt"), "not a snapshot").unwrap();

        rotate_backups(&root, 2).unwrap();

        assert!(!root.join("20260101-010101").exists(), "oldest should be pruned");
        assert!(root.join("20260102-010101").exists());
        assert!(root.join("20260103-010101").exists());
        assert!(root.join("stray.txt").exists(), "files are not snapshots");
        std::fs::remove_dir_all(&root).unwrap();
    }
}

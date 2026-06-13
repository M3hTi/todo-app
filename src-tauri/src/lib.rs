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

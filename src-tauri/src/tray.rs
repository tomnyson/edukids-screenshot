// tray.rs — System tray setup for Screenshot Tool

use std::collections::HashMap;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

/// "Chụp vùng" + label of the registered shortcut → "Chụp vùng  (Ctrl+Shift+2)"
fn with_key(text: &str, labels: &HashMap<String, String>, event: &str) -> String {
    match labels.get(event) {
        Some(key) if !key.is_empty() => format!("{text}  ({key})"),
        _ => text.to_string(),
    }
}

pub fn setup_tray(app: &AppHandle, labels: &HashMap<String, String>) -> tauri::Result<()> {
    let capture_region = MenuItem::with_id(
        app,
        "capture_region",
        with_key("📷  Chụp vùng", labels, "trigger-capture-region"),
        true,
        None::<&str>,
    )?;
    let capture_full = MenuItem::with_id(
        app,
        "capture_full",
        with_key("🖥️  Chụp toàn màn hình", labels, "trigger-capture-full"),
        true,
        None::<&str>,
    )?;
    let record_region = MenuItem::with_id(
        app,
        "record_region",
        with_key("⏺  Quay vùng", labels, "trigger-record-region"),
        true,
        None::<&str>,
    )?;
    let record_full = MenuItem::with_id(
        app,
        "record_full",
        with_key("⏺  Quay toàn màn hình", labels, "trigger-record-full"),
        true,
        None::<&str>,
    )?;
    let stop_record = MenuItem::with_id(app, "stop_record", "⏹  Dừng quay", true, None::<&str>)?;
    let open_window = MenuItem::with_id(app, "open_window", "🪟  Mở cửa sổ", true, None::<&str>)?;
    let check_update = MenuItem::with_id(
        app,
        "check_update",
        "🔄  Kiểm tra cập nhật",
        true,
        None::<&str>,
    )?;
    let about = MenuItem::with_id(app, "about", "ℹ️  Giới thiệu", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &capture_region,
            &capture_full,
            &record_region,
            &record_full,
            &stop_record,
            &open_window,
            &check_update,
            &about,
            &quit,
        ],
    )?;

    let _tray = TrayIconBuilder::with_id("main")
        .title("Screenshot Tool")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app: &AppHandle, event| match event.id.as_ref() {
            "capture_region" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                    win.emit("trigger-capture-region", ()).ok();
                }
            }
            "capture_full" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                    win.emit("trigger-capture-full", ()).ok();
                }
            }
            "record_region" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                    win.emit("trigger-record-region", ()).ok();
                }
            }
            "record_full" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                    win.emit("trigger-record-full", ()).ok();
                }
            }
            "stop_record" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.emit("trigger-stop-recording", ()).ok();
                }
            }
            "open_window" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                }
            }
            "check_update" => {
                // Native dialogs are used, so the window doesn't need to be shown.
                if let Some(win) = app.get_webview_window("main") {
                    win.emit("trigger-check-update", ()).ok();
                }
            }
            "about" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                    win.emit("show-about", ()).ok();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

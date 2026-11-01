// tray.rs — System tray setup for Screenshot Tool

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::shortcuts;

/// "Chụp vùng" + label of the registered shortcut → "Chụp vùng  (Ctrl+Shift+2)"
fn with_key(app: &AppHandle, text: &str, event: &str) -> String {
    match shortcuts::current_label(app, event) {
        Some(key) => format!("{text}  ({key})"),
        None => text.to_string(),
    }
}

const CAPTURE_REGION: &str = "📷  Chụp vùng";
const CAPTURE_FULL: &str = "🖥️  Chụp toàn màn hình";
const RECORD_REGION: &str = "⏺  Quay vùng";
const RECORD_FULL: &str = "⏺  Quay toàn màn hình";

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture_region = MenuItem::with_id(
        app,
        "capture_region",
        with_key(app, CAPTURE_REGION, "trigger-capture-region"),
        true,
        None::<&str>,
    )?;
    let capture_full = MenuItem::with_id(
        app,
        "capture_full",
        with_key(app, CAPTURE_FULL, "trigger-capture-full"),
        true,
        None::<&str>,
    )?;
    let record_region = MenuItem::with_id(
        app,
        "record_region",
        with_key(app, RECORD_REGION, "trigger-record-region"),
        true,
        None::<&str>,
    )?;
    let record_full = MenuItem::with_id(
        app,
        "record_full",
        with_key(app, RECORD_FULL, "trigger-record-full"),
        true,
        None::<&str>,
    )?;
    // Keep the items so their shortcut labels follow changes in settings.
    shortcuts::attach_tray_items(
        app,
        vec![
            ("trigger-capture-region", capture_region.clone(), CAPTURE_REGION),
            ("trigger-capture-full", capture_full.clone(), CAPTURE_FULL),
            ("trigger-record-region", record_region.clone(), RECORD_REGION),
            ("trigger-record-full", record_full.clone(), RECORD_FULL),
        ],
    );
    let stop_record = MenuItem::with_id(app, "stop_record", "⏹  Dừng quay", true, None::<&str>)?;
    let open_window = MenuItem::with_id(app, "open_window", "🪟  Mở cửa sổ", true, None::<&str>)?;
    let settings = MenuItem::with_id(
        app,
        "shortcut_settings",
        "⌨️  Cài đặt phím tắt",
        true,
        None::<&str>,
    )?;
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
            &settings,
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
            "shortcut_settings" => {
                if let Some(win) = app.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                    win.emit("show-shortcut-settings", ()).ok();
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

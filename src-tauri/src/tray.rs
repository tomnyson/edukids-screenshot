// tray.rs — System tray setup for Screenshot Tool

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture_region = MenuItem::with_id(
        app,
        "capture_region",
        "📷  Chụp vùng  (⌘⇧2)",
        true,
        None::<&str>,
    )?;
    let capture_full = MenuItem::with_id(
        app,
        "capture_full",
        "🖥️  Chụp toàn màn hình  (⌘⇧3)",
        true,
        None::<&str>,
    )?;
    let record_region = MenuItem::with_id(
        app,
        "record_region",
        "⏺  Quay vùng  (⌘⇧4)",
        true,
        None::<&str>,
    )?;
    let record_full = MenuItem::with_id(
        app,
        "record_full",
        "⏺  Quay toàn màn hình  (⌘⇧1)",
        true,
        None::<&str>,
    )?;
    let stop_record = MenuItem::with_id(app, "stop_record", "⏹  Dừng quay", true, None::<&str>)?;
    let open_window = MenuItem::with_id(app, "open_window", "🪟  Mở cửa sổ", true, None::<&str>)?;
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

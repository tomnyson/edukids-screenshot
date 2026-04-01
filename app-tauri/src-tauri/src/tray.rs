// tray.rs — System tray setup for Screenshot Tool

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconEvent},
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
        "⏺  Quay toàn màn hình  (⌘⇧5)",
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

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
        tray.set_show_menu_on_left_click(true)?;
        tray.on_menu_event(|app, event| match event.id.as_ref() {
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
        });
        tray.on_tray_icon_event(|_tray, event| {
            // Left click on macOS → show_menu_on_left_click handles it
            let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            else {
                return;
            };
        });
    }

    Ok(())
}

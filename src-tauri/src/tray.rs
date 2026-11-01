// tray.rs — System tray setup for Screenshot Tool

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::shortcuts;

/// Tray items in menu order: (menu id, i18n key of the label, shortcut event shown after it).
const ITEMS: [(&str, &str, Option<&str>); 10] = [
    ("capture_region", "tray.capture_region", Some("trigger-capture-region")),
    ("capture_full", "tray.capture_full", Some("trigger-capture-full")),
    ("record_region", "tray.record_region", Some("trigger-record-region")),
    ("record_full", "tray.record_full", Some("trigger-record-full")),
    ("stop_record", "tray.stop_record", None),
    ("open_window", "tray.open_window", None),
    ("shortcut_settings", "tray.shortcut_settings", None),
    ("check_update", "tray.check_update", None),
    ("about", "tray.about", None),
    ("quit", "tray.quit", None),
];

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let mut items = Vec::with_capacity(ITEMS.len());
    for (id, key, event) in ITEMS {
        let text = shortcuts::tray_text(app, key, event);
        items.push((MenuItem::with_id(app, id, text, true, None::<&str>)?, key, event));
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|(item, _, _)| item as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    let menu = Menu::with_items(app, &refs)?;
    // Keep every item so its label follows language and shortcut changes.
    shortcuts::attach_tray_items(app, items);

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

// shortcuts.rs — global shortcut registration with fallbacks + display labels
//
// Each action tries its primary accelerator (Ctrl+Shift+N on Windows,
// ⌘⇧N on macOS) and falls back to Ctrl/⌘+Alt+Shift+N if another app owns it.
// A shortcut that cannot be registered never aborts startup.
// The labels of what was actually registered are kept in managed state so the
// tray menu and the frontend show the real key for the current OS.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// event name → human-readable shortcut label ("" / missing = none registered)
#[derive(Default)]
pub struct ShortcutLabels(pub Mutex<HashMap<String, String>>);

/// (event emitted to the frontend, digit key)
const ACTIONS: [(&str, &str); 4] = [
    ("trigger-capture-region", "2"),
    ("trigger-capture-full", "3"),
    ("trigger-record-region", "4"), // toggle record region
    ("trigger-record-full", "1"),   // toggle record full
];

/// Human label for an accelerator on the current OS.
fn label(accelerator: &str) -> String {
    if cfg!(target_os = "macos") {
        accelerator
            .replace("CommandOrControl+", "⌘")
            .replace("Alt+", "⌥")
            .replace("Shift+", "⇧")
    } else {
        accelerator.replace("CommandOrControl", "Ctrl")
    }
}

/// Register all global shortcuts; returns event name → label of the
/// accelerator that was registered.
pub fn register_all(app: &AppHandle) -> HashMap<String, String> {
    let mut labels = HashMap::new();

    for (event_name, key) in ACTIONS {
        let candidates = [
            format!("CommandOrControl+Shift+{key}"),
            format!("CommandOrControl+Alt+Shift+{key}"),
        ];

        let mut registered = false;
        for accelerator in &candidates {
            let h = app.clone();
            let result = app.global_shortcut().on_shortcut(
                accelerator.as_str(),
                move |_app, _sc, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(win) = h.get_webview_window("main") {
                            win.emit(event_name, ()).ok();
                        }
                    }
                },
            );
            match result {
                Ok(()) => {
                    labels.insert(event_name.to_string(), label(accelerator));
                    registered = true;
                    break;
                }
                Err(err) => {
                    eprintln!("[shortcut] {accelerator} unavailable for {event_name}: {err}");
                }
            }
        }
        if !registered {
            eprintln!("[shortcut] no shortcut available for {event_name}; use the tray menu");
        }
    }

    labels
}

/// Frontend: labels of the shortcuts actually registered on this machine.
#[tauri::command]
pub fn get_shortcut_labels(state: tauri::State<'_, ShortcutLabels>) -> HashMap<String, String> {
    state.0.lock().map(|m| m.clone()).unwrap_or_default()
}

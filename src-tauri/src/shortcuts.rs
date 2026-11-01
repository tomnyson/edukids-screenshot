// shortcuts.rs — user-configurable global shortcuts
//
// - Defaults: Ctrl/⌘+Shift+N, falling back to Ctrl/⌘+Alt+Shift+N when another
//   app already owns the primary combination.
// - Users can override any action from the settings dialog; overrides are
//   saved to <app_config_dir>/shortcuts.json and re-applied on every launch.
// - A shortcut that cannot be registered never aborts startup.
// - Labels of what is actually registered (OS notation: "Ctrl+Shift+2" on
//   Windows, "⌘⇧2" on macOS) are kept in state for the tray and the frontend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;

use tauri::{menu::MenuItem, AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::i18n::{self, tr, trf};

/// (event emitted to the frontend, digit used by the default shortcut, i18n key of its name)
pub const ACTIONS: [(&str, &str, &str); 4] = [
    ("trigger-capture-region", "2", "action.capture_region"),
    ("trigger-capture-full", "3", "action.capture_full"),
    ("trigger-record-region", "4", "action.record_region"),
    ("trigger-record-full", "1", "action.record_full"),
];

#[derive(Default)]
pub struct ShortcutsState {
    /// event → accelerator actually registered
    registered: Mutex<HashMap<String, String>>,
    /// event → why the shortcut could not be registered
    errors: Mutex<HashMap<String, String>>,
    /// every tray item: (item, i18n key of its label, shortcut event shown after it)
    tray_items: Mutex<Vec<(MenuItem<Wry>, &'static str, Option<&'static str>)>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutInfo {
    event: String,
    name: String,
    accelerator: Option<String>,
    label: Option<String>,
    is_custom: bool,
    error: Option<String>,
}

// ── Labels ───────────────────────────────────────────────────────────────────

fn key_label(token: &str) -> String {
    let t = token
        .strip_prefix("Digit")
        .or_else(|| token.strip_prefix("Key"))
        .unwrap_or(token);
    match t {
        "PrintScreen" => "PrtSc".into(),
        "ArrowUp" => "↑".into(),
        "ArrowDown" => "↓".into(),
        "ArrowLeft" => "←".into(),
        "ArrowRight" => "→".into(),
        other => other.to_string(),
    }
}

/// Human label for an accelerator on the current OS.
pub fn label(accelerator: &str) -> String {
    let tokens: Vec<&str> = accelerator.split('+').map(str::trim).collect();
    let empty: &[&str] = &[];
    let (key, mods): (&str, &[&str]) = match tokens.split_last() {
        Some((k, m)) => (*k, m),
        None => ("", empty),
    };
    let mac = cfg!(target_os = "macos");

    let mut out: Vec<String> = Vec::new();
    for &m in mods {
        let lower = m.to_ascii_lowercase();
        let s: &str = match lower.as_str() {
            "commandorcontrol" | "cmdorctrl" | "commandorctrl" | "cmdorcontrol" => {
                if mac { "⌘" } else { "Ctrl" }
            }
            "ctrl" | "control" => if mac { "⌃" } else { "Ctrl" },
            "command" | "cmd" | "super" | "meta" => if mac { "⌘" } else { "Win" },
            "alt" | "option" => if mac { "⌥" } else { "Alt" },
            "shift" => if mac { "⇧" } else { "Shift" },
            _ => m,
        };
        out.push(s.to_string());
    }
    out.push(key_label(key));
    if mac { out.concat() } else { out.join("+") }
}

// ── Config file ──────────────────────────────────────────────────────────────

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("shortcuts.json"))
}

fn load_overrides(app: &AppHandle) -> HashMap<String, String> {
    config_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_overrides(app: &AppHandle, overrides: &HashMap<String, String>) -> Result<(), String> {
    let path = config_path(app).ok_or_else(|| tr(i18n::current(app), "shortcut.no_config_dir").to_string())?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(overrides).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

// ── Registration ─────────────────────────────────────────────────────────────

fn register_one(app: &AppHandle, accelerator: &str, event_name: &'static str) -> Result<(), String> {
    let h = app.clone();
    app.global_shortcut()
        .on_shortcut(accelerator, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(win) = h.get_webview_window("main") {
                    win.emit(event_name, ()).ok();
                }
            }
        })
        .map_err(|e| e.to_string())
}

/// (Re)register every action from defaults + saved overrides and refresh the
/// labels in state, the tray menu and the frontend.
pub fn register_all(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
    let overrides = load_overrides(app);

    let mut registered = HashMap::new();
    let mut errors = HashMap::new();

    for (event_name, digit, _) in ACTIONS {
        let candidates: Vec<String> = match overrides.get(event_name) {
            Some(custom) => vec![custom.clone()],
            None => vec![
                format!("CommandOrControl+Shift+{digit}"),
                format!("CommandOrControl+Alt+Shift+{digit}"),
            ],
        };

        let mut last_err = String::new();
        for accelerator in &candidates {
            match register_one(app, accelerator, event_name) {
                Ok(()) => {
                    registered.insert(event_name.to_string(), accelerator.clone());
                    break;
                }
                Err(err) => {
                    eprintln!("[shortcut] {accelerator} unavailable for {event_name}: {err}");
                    last_err = err;
                }
            }
        }
        if !registered.contains_key(event_name) {
            errors.insert(
                event_name.to_string(),
                trf(i18n::current(app), "shortcut.taken", &[&last_err]),
            );
        }
    }

    if let Some(state) = app.try_state::<ShortcutsState>() {
        if let Ok(mut m) = state.registered.lock() {
            *m = registered.clone();
        }
        if let Ok(mut m) = state.errors.lock() {
            *m = errors;
        }
    }
    relabel_tray(app);
    app.emit("shortcuts-changed", ()).ok();
}

/// Text of one tray item: its label in the current language, plus its
/// registered shortcut when it has one ("Chụp vùng  (Ctrl+Shift+2)").
pub fn tray_text(app: &AppHandle, key: &str, event: Option<&str>) -> String {
    let base = tr(i18n::current(app), key);
    let shortcut = event.and_then(|e| {
        let state = app.try_state::<ShortcutsState>()?;
        let m = state.registered.lock().ok()?;
        m.get(e).map(|a| label(a))
    });
    match shortcut {
        Some(s) => format!("{base}  ({s})"),
        None => base.to_string(),
    }
}

/// Re-render every tray label (after a language or shortcut change).
pub fn relabel_tray(app: &AppHandle) {
    if let Some(state) = app.try_state::<ShortcutsState>() {
        let items = state.tray_items.lock().map(|m| m.clone()).unwrap_or_default();
        for (item, key, event) in items {
            item.set_text(tray_text(app, key, event)).ok();
        }
    }
}

/// Called by the tray once its menu exists so labels can be kept in sync.
pub fn attach_tray_items(app: &AppHandle, items: Vec<(MenuItem<Wry>, &'static str, Option<&'static str>)>) {
    if let Some(state) = app.try_state::<ShortcutsState>() {
        if let Ok(mut m) = state.tray_items.lock() {
            *m = items;
        }
    }
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// event → label of the shortcut actually registered on this machine.
#[tauri::command]
pub fn get_shortcut_labels(state: tauri::State<'_, ShortcutsState>) -> HashMap<String, String> {
    state
        .registered
        .lock()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), label(v))).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_shortcut_settings(app: AppHandle) -> Vec<ShortcutInfo> {
    let overrides = load_overrides(&app);
    let state = app.state::<ShortcutsState>();
    let registered = state.registered.lock().map(|m| m.clone()).unwrap_or_default();
    let errors = state.errors.lock().map(|m| m.clone()).unwrap_or_default();

    ACTIONS
        .iter()
        .map(|(event, _, name)| {
            let acc = registered.get(*event).cloned();
            ShortcutInfo {
                event: event.to_string(),
                name: tr(i18n::current(&app), name).to_string(),
                label: acc.as_deref().map(label),
                accelerator: acc,
                is_custom: overrides.contains_key(*event),
                error: errors.get(*event).cloned(),
            }
        })
        .collect()
}

/// Set (Some) or reset to default (None) the shortcut of one action.
/// Rolls back and returns an error if the new combination cannot be used.
#[tauri::command]
pub async fn set_shortcut(
    app: AppHandle,
    event: String,
    accelerator: Option<String>,
) -> Result<Vec<ShortcutInfo>, String> {
    if !ACTIONS.iter().any(|a| a.0 == event.as_str()) {
        return Err(trf(i18n::current(&app), "shortcut.unknown_action", &[&event]));
    }

    let previous = load_overrides(&app);
    let mut overrides = previous.clone();

    match accelerator {
        Some(acc) => {
            let parsed = Shortcut::from_str(&acc)
                .map_err(|e| trf(i18n::current(&app), "shortcut.invalid", &[&acc, &e]))?;
            // Refuse a combination already used by another action.
            let registered = app
                .state::<ShortcutsState>()
                .registered
                .lock()
                .map(|m| m.clone())
                .unwrap_or_default();
            for (other_event, other_acc) in registered.iter() {
                if *other_event == event {
                    continue;
                }
                if Shortcut::from_str(other_acc).map(|s| s == parsed).unwrap_or(false) {
                    let name = ACTIONS
                        .iter()
                        .find(|a| a.0 == other_event.as_str())
                        .map(|a| tr(i18n::current(&app), a.2))
                        .unwrap_or("");
                    return Err(trf(i18n::current(&app), "shortcut.duplicate", &[&label(&acc), &name]));
                }
            }
            overrides.insert(event.clone(), acc);
        }
        None => {
            overrides.remove(&event);
        }
    }

    save_overrides(&app, &overrides)?;
    register_all(&app);

    let failed = app
        .state::<ShortcutsState>()
        .errors
        .lock()
        .ok()
        .and_then(|m| m.get(&event).cloned());
    if let Some(err) = failed {
        // Roll back to the previous configuration.
        save_overrides(&app, &previous)?;
        register_all(&app);
        return Err(err);
    }

    Ok(get_shortcut_settings(app))
}

/// Temporarily release all global shortcuts (while the user is typing a new
/// combination in the settings dialog, so it doesn't trigger a capture).
#[tauri::command]
pub async fn suspend_shortcuts(app: AppHandle) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_shortcuts(app: AppHandle) {
    register_all(&app);
}

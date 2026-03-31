// lib.rs — Tauri v2 backend for Screenshot Tool
// Commands are in a separate submodule to avoid duplicate macro namespace errors

use std::sync::Mutex;

#[derive(Clone, Default)]
pub struct OverlayCaptureState {
    pub data_url: Option<String>,
    pub display_id: Option<u32>,
    /// When "record-region" mode, we store the overlay purpose so the frontend
    /// can differentiate between screenshot region and record region flows.
    pub overlay_mode: OverlayMode,
}

#[derive(Clone, Default, PartialEq)]
pub enum OverlayMode {
    #[default]
    Screenshot,
    Record,
}

pub struct OverlayState(pub Mutex<OverlayCaptureState>);

mod commands;
mod recording;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OverlayState(Mutex::new(OverlayCaptureState::default())))
        .manage(recording::RecordingState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Hide Dock icon on macOS (tray-only, no Dock icon)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::setup_tray(&handle)?;

            // Automatically show the window during development (yarn dev)
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(win) = handle.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                }
            }

            // Register global shortcuts → emit events to frontend
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            use tauri::Emitter;

            let h1 = handle.clone();
            handle.global_shortcut().on_shortcut("CommandOrControl+Shift+2", move |_app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    use tauri::Manager;
                    if let Some(win) = h1.get_webview_window("main") {
                        win.emit("trigger-capture-region", ()).ok();
                    }
                }
            })?;

            let h2 = handle.clone();
            handle.global_shortcut().on_shortcut("CommandOrControl+Shift+3", move |_app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    use tauri::Manager;
                    if let Some(win) = h2.get_webview_window("main") {
                        win.emit("trigger-capture-full", ()).ok();
                    }
                }
            })?;

            // ⌘⇧4 → toggle record region
            let h4 = handle.clone();
            handle.global_shortcut().on_shortcut("CommandOrControl+Shift+4", move |_app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    use tauri::Manager;
                    if let Some(win) = h4.get_webview_window("main") {
                        win.emit("trigger-record-region", ()).ok();
                    }
                }
            })?;

            // ⌘⇧5 → toggle record full
            let h5 = handle.clone();
            handle.global_shortcut().on_shortcut("CommandOrControl+Shift+5", move |_app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    use tauri::Manager;
                    if let Some(win) = h5.get_webview_window("main") {
                        win.emit("trigger-record-full", ()).ok();
                    }
                }
            })?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Intercept close on "main" window → hide instead of destroy
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    window.hide().ok();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_screen_capture,
            commands::check_screen_recording_permission,
            commands::request_screen_recording_permission,
            commands::save_image,
            commands::copy_image,
            commands::hide_window,
            commands::show_window,
            commands::minimize_window,
            commands::toggle_fullscreen,
            commands::close_window,
            commands::open_screen_recording_settings,
            commands::start_region_capture,
            commands::crop_overlay_selection,
            commands::get_overlay_image,
            commands::close_overlay,
            commands::get_overlay_mode,
            // Recording commands
            recording::check_ffmpeg_installed,
            recording::get_ffmpeg_debug_info,
            recording::install_ffmpeg,
            recording::start_recording_full,
            recording::start_recording_region,
            recording::stop_recording,
            recording::get_recording_elapsed,
            recording::is_recording,
            recording::save_recording,
            recording::discard_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

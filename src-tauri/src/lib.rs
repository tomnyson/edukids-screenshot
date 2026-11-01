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
mod shortcuts;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OverlayState(Mutex::new(OverlayCaptureState::default())))
        .manage(recording::RecordingState::default())
        .manage(shortcuts::ShortcutsState::default())
        // Must be the first plugin: a second launch exits immediately and
        // instead brings the already-running instance's window to the front
        // (prevents duplicate tray icons / global-shortcut conflicts).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("main") {
                win.unminimize().ok();
                win.show().ok();
                win.set_focus().ok();
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Hide Dock icon on macOS (tray-only, no Dock icon)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Register global shortcuts (defaults + user overrides) first so
            // the tray shows the real keys.
            shortcuts::register_all(&handle);
            tray::setup_tray(&handle)?;

            // Show the main window on launch so users can see the app started
            // (closing it still just hides it to the tray).
            {
                use tauri::Manager;
                if let Some(win) = handle.get_webview_window("main") {
                    win.show().ok();
                    win.set_focus().ok();
                }
            }

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
            shortcuts::get_shortcut_labels,
            shortcuts::get_shortcut_settings,
            shortcuts::set_shortcut,
            shortcuts::suspend_shortcuts,
            shortcuts::resume_shortcuts,
            recording::check_ffmpeg_installed,
            recording::get_ffmpeg_debug_info,
            recording::install_ffmpeg,
            recording::list_recording_screens,
            recording::start_recording_full,
            recording::start_recording_region,
            recording::stop_recording,
            recording::pause_recording,
            recording::resume_recording,
            recording::get_recording_elapsed,
            recording::is_recording,
            recording::save_recording,
            recording::discard_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

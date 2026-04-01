// commands.rs — Tauri command handlers (IPC from frontend)

use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageFormat;
use std::io::Cursor;
use std::process::Command;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::{OverlayMode, OverlayState};

// ── macOS Screen Recording permission (CoreGraphics FFI) ─────────────────────
#[cfg(target_os = "macos")]
#[allow(dead_code)]
extern "C" {
    /// Returns true if the calling process already has Screen Recording permission.
    fn CGPreflightScreenCaptureAccess() -> bool;
    /// Requests Screen Recording permission — shows the system dialog if needed.
    /// Returns the current authorization state after the request.
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// Check whether Screen Recording is already authorized (returns true = OK).
#[allow(dead_code)]
fn has_screen_recording_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true // non-macOS: no TCC, always authorized
    }
}

/// Ask the OS to grant Screen Recording permission (may show system dialog).
#[tauri::command]
pub fn request_screen_recording_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGRequestScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[cfg(target_os = "macos")]
fn get_mouse_position() -> (i32, i32) {
    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }
    extern "C" {
        fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
        fn CGEventGetLocation(event: *mut std::ffi::c_void) -> CGPoint;
        fn CFRelease(cftype: *mut std::ffi::c_void);
    }
    unsafe {
        let event = CGEventCreate(std::ptr::null());
        let loc = CGEventGetLocation(event);
        CFRelease(event);
        (loc.x as i32, loc.y as i32)
    }
}
#[cfg(windows)]
fn get_mouse_position() -> (i32, i32) {
    #[repr(C)]
    struct POINT {
        x: i32,
        y: i32,
    }
    extern "system" {
        fn GetCursorPos(pt: *mut POINT) -> i32;
    }
    let mut pt = POINT { x: 0, y: 0 };
    unsafe {
        GetCursorPos(&mut pt);
    }
    (pt.x, pt.y)
}
#[cfg(not(any(target_os = "macos", windows)))]
fn get_mouse_position() -> (i32, i32) {
    (0, 0) // Linux fallback
}

fn screen_under_cursor() -> Result<(usize, screenshots::Screen), String> {
    let screens = screenshots::Screen::all().map_err(|e| e.to_string())?;

    let (mx, my) = get_mouse_position();
    for (i, screen) in screens.iter().enumerate() {
        let d = screen.display_info;
        if mx >= d.x && mx < d.x + d.width as i32 && my >= d.y && my < d.y + d.height as i32 {
            return Ok((i, *screen));
        }
    }

    // If somehow not found, fallback to primary
    let fallback_idx = screens
        .iter()
        .position(|s| s.display_info.is_primary)
        .unwrap_or(0);
    Ok((fallback_idx, screens[fallback_idx]))
}

fn configure_overlay_window(overlay: &WebviewWindow, screen: &screenshots::Screen) {
    let display = screen.display_info;
    overlay
        .set_position(Position::Logical(LogicalPosition::new(
            display.x as f64,
            display.y as f64,
        )))
        .ok();
    overlay
        .set_size(Size::Logical(LogicalSize::new(
            display.width as f64,
            display.height as f64,
        )))
        .ok();
}

// ── Screen capture ────────────────────────────────────────────────────────────

/// macOS: capture all displays via Apple's `screencapture` binary (bypasses TCC).
#[cfg(target_os = "macos")]
fn capture_screen_at_index(target_index: usize, screens_count: usize) -> Result<Vec<u8>, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();

    let mut tmp_paths = Vec::new();
    let mut args = vec!["-x".to_string(), "-t".to_string(), "jpg".to_string()];
    for i in 0..screens_count {
        let path = std::env::temp_dir().join(format!("sc_{}_{}.jpg", ts, i));
        args.push(path.to_string_lossy().into_owned());
        tmp_paths.push(path);
    }

    let status = Command::new("/usr/sbin/screencapture")
        .args(&args)
        .status()
        .map_err(|e| format!("screencapture launch failed: {}", e))?;
    if !status.success() {
        return Err("screencapture exited with non-zero status".to_string());
    }

    let target_path = if target_index < tmp_paths.len() && tmp_paths[target_index].exists() {
        &tmp_paths[target_index]
    } else {
        tmp_paths.first().ok_or("No capture files created")?
    };
    let bytes = std::fs::read(target_path).map_err(|e| format!("Failed to read capture: {}", e))?;
    for p in &tmp_paths {
        std::fs::remove_file(p).ok();
    }
    Ok(bytes)
}

/// Windows / Linux: capture the target display using the `screenshots` crate (DXGI).
#[cfg(not(target_os = "macos"))]
fn capture_screen_at_index(target_index: usize, _screens_count: usize) -> Result<Vec<u8>, String> {
    let screens = screenshots::Screen::all().map_err(|e| e.to_string())?;
    let screen = screens
        .get(target_index)
        .or_else(|| screens.first())
        .ok_or("No screen found")?;

    let rgba = screen.capture().map_err(|e| e.to_string())?;
    let dyn_img = image::DynamicImage::ImageRgba8(
        image::RgbaImage::from_raw(rgba.width(), rgba.height(), rgba.into_raw())
            .ok_or("Failed to create image buffer")?,
    );
    let mut jpeg_bytes: Vec<u8> = Vec::new();
    dyn_img
        .write_to(&mut Cursor::new(&mut jpeg_bytes), ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    Ok(jpeg_bytes)
}

/// Capture the screen that currently contains the mouse cursor.
#[tauri::command]
pub fn get_screen_capture() -> Result<String, String> {
    let (target_index, _screen) = screen_under_cursor()?;
    let screens_count = screenshots::Screen::all().map(|s| s.len()).unwrap_or(1);
    let bytes = capture_screen_at_index(target_index, screens_count)?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        STANDARD.encode(&bytes)
    ))
}

/// Returns `true` if Screen Recording is authorized, `false` otherwise.
/// Uses the official macOS CoreGraphics API — no pixel-guessing.
#[tauri::command]
pub fn check_screen_recording_permission() -> bool {
    has_screen_recording_permission()
}

// ── Save image ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_image(
    app: AppHandle,
    data_url: String,
    default_name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or("Invalid data URL")?
        .to_string();
    let bytes = STANDARD.decode(&b64).map_err(|e| e.to_string())?;

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Images", &["png", "jpg"])
        .blocking_save_file();

    if let Some(path) = file_path {
        std::fs::write(path.to_string(), &bytes).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

// ── Copy image to clipboard ────────────────────────────────────────────────────

#[tauri::command]
pub fn copy_image(data_url: String) -> Result<bool, String> {
    let b64 = data_url.split(',').nth(1).ok_or("Invalid data URL")?;
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;

    let img = image::load_from_memory_with_format(&bytes, ImageFormat::Png)
        .map_err(|e| e.to_string())?
        .into_rgba8();
    let (w, h) = img.dimensions();

    let image_data = arboard::ImageData {
        width: w as usize,
        height: h as usize,
        bytes: std::borrow::Cow::Owned(img.into_raw()),
    };

    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set_image(image_data)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

// ── Window control ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let is_fullscreen = win.is_fullscreen().unwrap_or(false);
        win.set_fullscreen(!is_fullscreen)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        // Hide instead of close — preserves the window so tray can reopen it
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_screen_recording_settings() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .status()
        .map_err(|e| e.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Failed to open macOS Screen Recording settings".to_string())
            }
        })
}

// ── Overlay (region selector window) ─────────────────────────────────────────

#[tauri::command]
pub fn start_region_capture(
    app: AppHandle,
    data_url: String,
    mode: Option<String>,
) -> Result<(), String> {
    let (_, screen) = screen_under_cursor()?;

    let overlay_mode = match mode.as_deref() {
        Some("record") => OverlayMode::Record,
        _ => OverlayMode::Screenshot,
    };

    if let Some(state) = app.try_state::<OverlayState>() {
        let mut capture = state.0.lock().map_err(|e| e.to_string())?;
        capture.data_url = Some(data_url);
        capture.display_id = Some(screen.display_info.id);
        capture.overlay_mode = overlay_mode;
    }

    // Reuse existing overlay window for instant speed & preventing race conditions
    if let Some(existing) = app.get_webview_window("overlay") {
        configure_overlay_window(&existing, &screen);
        existing.emit("refresh-image", ()).ok();
        existing.show().ok();
        existing.set_focus().ok();
        return Ok(());
    }

    let overlay = WebviewWindowBuilder::new(
        &app,
        "overlay",
        WebviewUrl::App("index.html#overlay".into()),
    )
    .decorations(false)
    .always_on_top(true)
    .focused(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .shadow(false)
    .build()
    .map_err(|e| e.to_string())?;

    // On macOS, fullscreen(true) triggers a Native Space transition (slide animation).
    // We prevent this by manually overlaying the selected display dimensions.
    configure_overlay_window(&overlay, &screen);

    Ok(())
}

/// Crop a region from the stored full-screen capture using the image crate.
/// Does NOT perform a new screen capture, so no TCC permission needed.
#[tauri::command]
pub fn crop_overlay_selection(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    // Retrieve stored full-screen data URL from overlay state
    let data_url = app
        .try_state::<OverlayState>()
        .and_then(|s| s.0.lock().ok().and_then(|c| c.data_url.clone()))
        .ok_or("No full-screen capture in overlay state")?;

    // Decode base64 data URL → raw bytes
    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or("Invalid data URL format")?;
    let img_bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;

    // Decode image (JPEG or PNG)
    let img = image::load_from_memory(&img_bytes).map_err(|e| e.to_string())?;

    // The overlay CSS uses `background-size: 100% 100%` so the stored image
    // spans the full logical screen. Scale pixel coords to image dimensions.
    //
    // IMPORTANT: CSS drag coords (x, y, width, height) are in LOGICAL pixels.
    // screencapture produces PHYSICAL pixels. On Retina displays these differ
    // by the scale factor (e.g. 2.0 on a 2× Retina display).
    //
    // Correct formula: physical_px = logical_px * scale_factor
    let img_w = img.width() as f64;
    let img_h = img.height() as f64;

    let monitor = app.primary_monitor().ok().flatten();
    let scale_factor = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);

    // Verify scale makes sense — if screencapture wrote at a different resolution,
    // fall back to img_w / logical_screen_w ratio.
    let screen_phys_w = monitor
        .as_ref()
        .map(|m| m.size().width as f64)
        .unwrap_or(img_w);
    let screen_phys_h = monitor
        .as_ref()
        .map(|m| m.size().height as f64)
        .unwrap_or(img_h);
    let logical_screen_w = screen_phys_w / scale_factor;
    let logical_screen_h = screen_phys_h / scale_factor;

    // Use img actual size vs logical screen size to handle any resolution differences.
    let scale_x = img_w / logical_screen_w;
    let scale_y = img_h / logical_screen_h;

    let cx = (x * scale_x).floor().max(0.0) as u32;
    let cy = (y * scale_y).floor().max(0.0) as u32;
    let cw = ((width * scale_x).round() as u32)
        .max(1)
        .min(img.width().saturating_sub(cx));
    let ch = ((height * scale_y).round() as u32)
        .max(1)
        .min(img.height().saturating_sub(cy));

    let cropped = img.crop_imm(cx, cy, cw, ch);

    // Encode as PNG for lossless crop quality
    let mut png_bytes: Vec<u8> = Vec::new();
    cropped
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(&png_bytes)
    ))
}

#[tauri::command]
pub fn get_overlay_image(app: AppHandle) -> Option<String> {
    app.try_state::<OverlayState>()
        .and_then(|s| s.0.lock().ok().and_then(|capture| capture.data_url.clone()))
}

/// Returns the current overlay mode: "screenshot" or "record"
#[tauri::command]
pub fn get_overlay_mode(app: AppHandle) -> String {
    app.try_state::<OverlayState>()
        .and_then(|s| {
            s.0.lock().ok().map(|c| match c.overlay_mode {
                OverlayMode::Screenshot => "screenshot".to_string(),
                OverlayMode::Record => "record".to_string(),
            })
        })
        .unwrap_or_else(|| "screenshot".to_string())
}

#[tauri::command]
pub fn close_overlay(app: AppHandle, data_url: Option<String>) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        // Just hide the overlay window instead of destroying it completely
        // This makes subsequent region captures instantaneous.
        overlay.hide().map_err(|e| e.to_string())?;
    }
    if let Some(state) = app.try_state::<OverlayState>() {
        let mut capture = state.0.lock().map_err(|e| e.to_string())?;
        capture.data_url = None;
        capture.display_id = None;
    }
    if let Some(main_win) = app.get_webview_window("main") {
        main_win.show().ok();
        main_win.set_focus().ok();
        if let Some(url) = data_url {
            main_win
                .emit("region-captured", url)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// recording.rs — Screen recording via FFmpeg CLI
//
// Cross-platform support for capturing the screen (full or region)
// and encoding directly to MP4 (H.264 / libx264).

use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};

// ── State ────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct RecordingInner {
    // We store the process id to allow reliable stopping across platforms
    process_id: Option<u32>,
    output_path: Option<String>,
    start_time: Option<Instant>,
}

pub struct RecordingState(pub Mutex<RecordingInner>);

impl Default for RecordingState {
    fn default() -> Self {
        Self(Mutex::new(RecordingInner::default()))
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn avfoundation_screen_index() -> String {
    "1".to_string()
}

fn tmp_output_path() -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let dir = std::env::temp_dir();
    dir.join(format!("edukids-recording-{}.mp4", ts))
        .to_string_lossy()
        .into_owned()
}

// ── FFmpeg resolution ────────────────────────────────────────────────────────

const KNOWN_FFMPEG_PATHS: &[&str] = &[
    "/opt/homebrew/bin/ffmpeg",                   // Apple Silicon Homebrew
    "/usr/local/bin/ffmpeg",                      // Intel Homebrew
    "/opt/local/bin/ffmpeg",                      // MacPorts
    "/usr/bin/ffmpeg",                            // System 
    "/opt/homebrew/Cellar/ffmpeg/8.1/bin/ffmpeg", // Direct Cellar path
    "ffmpeg.exe",                                 // Windows local directory
];

fn get_ffmpeg_path() -> Option<String> {
    for path in KNOWN_FFMPEG_PATHS {
        let p = std::path::Path::new(path);
        if p.exists() {
            return Some(path.to_string());
        }
    }

    if let Ok(output) = Command::new("which").arg("ffmpeg").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    if let Ok(output) = Command::new("where").arg("ffmpeg").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let first_path = path.lines().next().unwrap_or("").trim().to_string();
            if !first_path.is_empty() && std::path::Path::new(&first_path).exists() {
                return Some(first_path);
            }
        }
    }

    if Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return Some("ffmpeg".to_string());
    }

    None
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_ffmpeg_installed() -> bool {
    get_ffmpeg_path().is_some()
}

#[tauri::command]
pub fn get_ffmpeg_debug_info() -> String {
    let mut info = String::new();
    info.push_str("=== FFmpeg Detection Debug ===\n");
    for path in KNOWN_FFMPEG_PATHS {
        let exists = std::path::Path::new(path).exists();
        info.push_str(&format!("[{}] {}\n", if exists { "✓" } else { "✗" }, path));
    }
    match get_ffmpeg_path() {
        Some(p) => info.push_str(&format!("\n→ Resolved: {}\n", p)),
        None => info.push_str("\n→ NOT FOUND\n"),
    }
    info
}

#[tauri::command]
pub async fn install_ffmpeg() -> Result<String, String> {
    if cfg!(target_os = "windows") {
        return Err("Vui lòng tải ffmpeg.exe và đặt vào cùng thư mục với ứng dụng.".to_string());
    }

    let brew_path = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|s| s.to_string());

    let brew_cmd = match brew_path {
        Some(p) => p,
        None => {
            return Err("Homebrew chưa được cài đặt.".to_string());
        }
    };

    let output = Command::new(&brew_cmd)
        .args(["install", "ffmpeg"])
        .output()
        .map_err(|e| format!("Không thể chạy brew: {}", e))?;

    if output.status.success() {
        Ok("FFmpeg đã được cài đặt thành công! ✓".to_string())
    } else {
        Err("Cài đặt thất bại.".to_string())
    }
}

#[tauri::command]
pub fn start_recording_full(app: AppHandle) -> Result<(), String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    if inner.process_id.is_some() {
        return Err("Already recording".to_string());
    }

    let output = tmp_output_path();
    let ffmpeg_cmd = get_ffmpeg_path().ok_or("FFmpeg is not installed")?;
    let mut command = Command::new(ffmpeg_cmd);
    
    if cfg!(target_os = "windows") {
        command.args([
            "-y", "-f", "gdigrab", "-framerate", "30", "-draw_mouse", "1",
            "-i", "desktop", "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", &output,
        ]);
    } else {
        let screen_idx = avfoundation_screen_index();
        command.args([
            "-y", "-f", "avfoundation", "-framerate", "30", "-capture_cursor", "1",
            "-i", &format!("{}:none", screen_idx), "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", &output,
        ]);
    }

    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    inner.process_id = Some(child.id());
    inner.output_path = Some(output);
    inner.start_time = Some(Instant::now());

    app.emit("recording-started", "full").ok();
    Ok(())
}

#[tauri::command]
pub fn start_recording_region(
    app: AppHandle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    if inner.process_id.is_some() {
        return Err("Already recording".to_string());
    }

    let output = tmp_output_path();
    let w = if width % 2 != 0 { width + 1 } else { width };
    let h = if height % 2 != 0 { height + 1 } else { height };
    let crop_filter = format!("crop={}:{}:{}:{}", w, h, x, y);

    let ffmpeg_cmd = get_ffmpeg_path().ok_or("FFmpeg is not installed")?;
    let mut command = Command::new(ffmpeg_cmd);

    if cfg!(target_os = "windows") {
        command.args([
            "-y", "-f", "gdigrab", "-framerate", "30", "-draw_mouse", "1",
            "-i", "desktop", "-vf", &crop_filter, "-c:v", "libx264",
            "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", &output,
        ]);
    } else {
        let screen_idx = avfoundation_screen_index();
        command.args([
            "-y", "-f", "avfoundation", "-framerate", "30", "-capture_cursor", "1",
            "-i", &format!("{}:none", screen_idx), "-vf", &crop_filter, "-c:v", "libx264",
            "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", &output,
        ]);
    }

    let child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    inner.process_id = Some(child.id());
    inner.output_path = Some(output);
    inner.start_time = Some(Instant::now());

    app.emit("recording-started", "region").ok();
    Ok(())
}

#[tauri::command]
pub fn stop_recording(app: AppHandle) -> Result<String, String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    let pid = inner.process_id.take().ok_or("Not currently recording")?;
    let output_path = inner.output_path.take().ok_or("No output path")?;
    inner.start_time = None;

    if cfg!(target_os = "windows") {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string()])
            .output();
        std::thread::sleep(std::time::Duration::from_millis(1000));
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    } else {
        let _ = Command::new("/bin/kill")
            .args(["-s", "INT", &pid.to_string()])
            .status();
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let _ = Command::new("/bin/kill")
            .args(["-s", "TERM", &pid.to_string()])
            .status();
    }

    app.emit("recording-stopped", &output_path).ok();
    Ok(output_path)
}

#[tauri::command]
pub fn get_recording_elapsed(app: AppHandle) -> u64 {
    let state = app.state::<RecordingState>();
    let inner = state.0.lock().ok();
    inner
        .and_then(|i| i.start_time.map(|t| t.elapsed().as_secs()))
        .unwrap_or(0)
}

#[tauri::command]
pub fn is_recording(app: AppHandle) -> bool {
    let state = app.state::<RecordingState>();
    state
        .0
        .lock()
        .ok()
        .map(|i| i.process_id.is_some())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn save_recording(
    app: AppHandle,
    source_path: String,
    default_name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let bytes = std::fs::read(&source_path).map_err(|e| e.to_string())?;
    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Video", &["mp4"])
        .blocking_save_file();

    if let Some(path) = file_path {
        std::fs::write(path.to_string(), &bytes).map_err(|e| e.to_string())?;
        std::fs::remove_file(&source_path).ok();
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn discard_recording(source_path: String) -> Result<(), String> {
    std::fs::remove_file(&source_path).map_err(|e| e.to_string())
}

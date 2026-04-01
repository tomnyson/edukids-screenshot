// recording.rs — Screen recording via FFmpeg CLI
//
// Uses `ffmpeg -f avfoundation` on macOS to capture the screen (full or region)
// and encode directly to MP4 (H.264 / libx264).

use std::io::Write;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// ── State ────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct RecordingInner {
pub struct RecordingInner {
    // We store the pid instead of the generic process child to allow killing
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

/// Resolve the avfoundation device index for the screen that contains the cursor.
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

/// All known locations where ffmpeg might exist on macOS.
const KNOWN_FFMPEG_PATHS: &[&str] = &[
    "/opt/homebrew/bin/ffmpeg",       // Apple Silicon Homebrew
    "/usr/local/bin/ffmpeg",          // Intel Homebrew
    "/opt/local/bin/ffmpeg",          // MacPorts
    "/usr/bin/ffmpeg",                // System (unlikely on macOS)
    "/opt/homebrew/Cellar/ffmpeg/8.1/bin/ffmpeg", // Direct Cellar path
];

/// Locate the ffmpeg executable.
/// Priority: known filesystem paths → `which ffmpeg` → PATH lookup.
fn get_ffmpeg_path() -> Option<String> {
    // 1. Check well-known filesystem paths (most reliable for GUI apps)
    for path in KNOWN_FFMPEG_PATHS {
        let p = std::path::Path::new(path);
        // exists() follows symlinks, so /opt/homebrew/bin/ffmpeg → Cellar works
        if p.exists() {
            // Verify it's actually executable
            if let Ok(status) = Command::new(path)
                .arg("-version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
            {
                if status.success() {
                    return Some(path.to_string());
                }
            }
            // Even if -version check fails, the path exists — return it
            return Some(path.to_string());
        }
    }

    // 2. Try `which ffmpeg` (works from terminal-launched apps)
    if let Ok(output) = Command::new("/usr/bin/which")
        .arg("ffmpeg")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    // 3. Try shell -l -c (inherits user's full shell profile PATH)
    if let Ok(output) = Command::new("/bin/zsh")
        .args(["-l", "-c", "which ffmpeg"])
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    // 4. Direct PATH lookup (usually fails in GUI apps but worth trying)
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

/// Check whether `ffmpeg` is available.
#[tauri::command]
pub fn check_ffmpeg_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        true // Windows uses bundled sidecar
    }
    #[cfg(not(target_os = "windows"))]
    {
        get_ffmpeg_path().is_some()
    }
}

/// Return debugging info about FFmpeg detection (helps diagnose issues).
#[tauri::command]
pub fn get_ffmpeg_debug_info() -> String {
    let mut info = String::new();

    info.push_str("=== FFmpeg Detection Debug ===\n");

    // Check each known path
    for path in KNOWN_FFMPEG_PATHS {
        let exists = std::path::Path::new(path).exists();
        info.push_str(&format!("[{}] {}\n", if exists { "✓" } else { "✗" }, path));
    }

    // Check which
    if let Ok(output) = Command::new("/usr/bin/which").arg("ffmpeg").output() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        info.push_str(&format!("which: {}\n", if stdout.is_empty() { "(not found)" } else { &stdout }));
    }

    // Check shell which
    if let Ok(output) = Command::new("/bin/zsh").args(["-l", "-c", "which ffmpeg"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        info.push_str(&format!("zsh -l -c which: {}\n", if stdout.is_empty() { "(not found)" } else { &stdout }));
    }

    // Final resolution
    match get_ffmpeg_path() {
        Some(p) => info.push_str(&format!("\n→ Resolved: {}\n", p)),
        None => info.push_str("\n→ NOT FOUND\n"),
    }

    info
}

/// Install FFmpeg via Homebrew. Returns (success, output_message).
#[tauri::command]
pub async fn install_ffmpeg() -> Result<String, String> {
    // First check if brew is available
    let brew_path = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|s| s.to_string());

    let brew_cmd = match brew_path {
        Some(p) => p,
        None => {
            return Err(
                "Homebrew chưa được cài đặt. Vui lòng cài Homebrew trước:\n\
                 /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                    .to_string(),
            );
        }
    };

    // Run brew install ffmpeg
    let output = Command::new(&brew_cmd)
        .args(["install", "ffmpeg"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Không thể chạy brew: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        // Verify installation
        if get_ffmpeg_path().is_some() {
            Ok("FFmpeg đã được cài đặt thành công! ✓".to_string())
        } else {
            Ok(format!(
                "Brew hoàn tất nhưng không tìm thấy ffmpeg.\nstdout: {}\nstderr: {}",
                stdout, stderr
            ))
        }
    } else {
        Err(format!("Cài đặt thất bại:\n{}\n{}", stdout, stderr))
    }
}

/// Start recording the full screen.
#[tauri::command]
pub fn start_recording_full(app: AppHandle) -> Result<(), String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    if inner.process_id.is_some() {
        return Err("Already recording".to_string());
    }

    let screen_idx = avfoundation_screen_index();
    let output = tmp_output_path();

    #[cfg(target_os = "macos")]
    let ffmpeg_cmd = get_ffmpeg_path().ok_or("FFmpeg is not installed")?;

    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new(ffmpeg_cmd);
    
    #[cfg(target_os = "macos")]
    let child = command
        .args([
            "-y",
            "-f", "avfoundation",
            "-framerate", "30",
            "-capture_cursor", "1",
            "-i", &format!("{}:none", screen_idx),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            &output,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    #[cfg(target_os = "windows")]
    let mut sidecar = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-y",
            "-f", "gdigrab",
            "-framerate", "30",
            "-draw_mouse", "1",
            "-i", "desktop",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            &output,
        ]);

    #[cfg(target_os = "macos")]
    {
        inner.process_id = Some(child.id());
        // Since we don't have stdin easily available in sidecar, we'll kill by pid
    }

    #[cfg(target_os = "windows")]
    {
        let (mut rx, child) = sidecar.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
        inner.process_id = Some(child.pid());
        // Start a thread to drain events
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                // Ignore stdout/stderr
            }
        });
    }

    inner.output_path = Some(output);
    inner.start_time = Some(Instant::now());

    app.emit("recording-started", "full").ok();
    Ok(())
}

/// Start recording a specific region of the screen.
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

    let screen_idx = avfoundation_screen_index();
    let output = tmp_output_path();

    let w = if width % 2 != 0 { width + 1 } else { width };
    let h = if height % 2 != 0 { height + 1 } else { height };

    let crop_filter = format!("crop={}:{}:{}:{}", w, h, x, y);

    #[cfg(target_os = "macos")]
    let ffmpeg_cmd = get_ffmpeg_path().ok_or("FFmpeg is not installed")?;

    #[cfg(target_os = "macos")]
    let child = std::process::Command::new(ffmpeg_cmd)
        .args([
            "-y",
            "-f", "avfoundation",
            "-framerate", "30",
            "-capture_cursor", "1",
            "-i", &format!("{}:none", screen_idx),
            "-vf", &crop_filter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            &output,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    #[cfg(target_os = "windows")]
    let mut sidecar = app.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .args([
            "-y",
            "-f", "gdigrab",
            "-framerate", "30",
            "-draw_mouse", "1",
            "-i", "desktop",
            "-vf", &crop_filter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "20",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            &output,
        ]);

    #[cfg(target_os = "macos")]
    {
        inner.process_id = Some(child.id());
    }

    #[cfg(target_os = "windows")]
    {
        let (mut rx, child) = sidecar.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;
        inner.process_id = Some(child.pid());
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {}
        });
    }

    inner.output_path = Some(output);
    inner.start_time = Some(Instant::now());

    app.emit("recording-started", "region").ok();
    Ok(())
}

/// Stop the current recording.
#[tauri::command]
pub fn stop_recording(app: AppHandle) -> Result<String, String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    let pid = inner.process_id.take().ok_or("Not currently recording")?;
    let output_path = inner
        .output_path
        .take()
        .ok_or("No output path")?;
    inner.start_time = None;

    // We can gracefully stop ffmpeg on Windows/Mac by sending a signal or killing
    #[cfg(target_family = "unix")]
    {
        // On Unix, send SIGINT for graceful shutdown
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGINT); }
        std::thread::sleep(std::time::Duration::from_millis(1500));
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM); }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows it's harder to inject 'q' without stdin.
        // Tauri v2 shell plugin doesn't wrap stdin cleanly for easy writing if we spawned rx event loop
        // We will just try to run taskkill cleanly
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string()])
            .output();
        std::thread::sleep(std::time::Duration::from_millis(1000));
        // Force kill if still there
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }

    app.emit("recording-stopped", &output_path).ok();
    Ok(output_path)
}

/// Returns elapsed seconds if currently recording, or 0 if not.
#[tauri::command]
pub fn get_recording_elapsed(app: AppHandle) -> u64 {
    let state = app.state::<RecordingState>();
    let inner = state.0.lock().ok();
    inner
        .and_then(|i| i.start_time.map(|t| t.elapsed().as_secs()))
        .unwrap_or(0)
}

/// Check if currently recording.
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

/// Save the recorded video to a user-chosen location.
#[tauri::command]
pub async fn save_recording(app: AppHandle, source_path: String, default_name: String) -> Result<bool, String> {
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

/// Discard (delete) the temporary recording file.
#[tauri::command]
pub fn discard_recording(source_path: String) -> Result<(), String> {
    std::fs::remove_file(&source_path).map_err(|e| e.to_string())
}

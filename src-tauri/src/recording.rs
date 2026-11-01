// recording.rs — Screen recording via FFmpeg CLI
//
// Cross-platform support for capturing the screen (full or region)
// and encoding directly to MP4 (H.264 / libx264).

use std::io::{Read, Write};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use tauri::{AppHandle, Emitter, Manager};

/// Build a Command that never flashes a console window on Windows
/// (release builds run without a console, so children would get their own).
pub(crate) fn new_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

// ── State ────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct RecordingInner {
    process: Option<Child>,
    output_path: Option<String>,
    start_time: Option<Instant>,
}

pub struct RecordingState(pub Mutex<RecordingInner>);

impl Default for RecordingState {
    fn default() -> Self {
        Self(Mutex::new(RecordingInner::default()))
    }
}

impl Drop for RecordingInner {
    fn drop(&mut self) {
        if let Some(mut child) = self.process.take() {
            let _ = stop_child_gracefully(&mut child);
        }
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingScreen {
    device_index: String,
    label: String,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn parse_avfoundation_screens(text: &str) -> Vec<RecordingScreen> {
    let mut screens = Vec::new();
    let mut in_video_section = false;

    for line in text.lines() {
        if line.contains("AVFoundation video devices:") {
            in_video_section = true;
            continue;
        }
        if line.contains("AVFoundation audio devices:") {
            in_video_section = false;
            continue;
        }
        if !in_video_section || !line.to_lowercase().contains("capture screen") {
            continue;
        }

        if let Some(start) = line.rfind('[') {
            if let Some(rel_end) = line[start + 1..].find(']') {
                let device_index = &line[start + 1..start + 1 + rel_end];
                if device_index.is_empty()
                    || !device_index.bytes().all(|byte| byte.is_ascii_digit())
                {
                    continue;
                }

                let raw_label = line[start + 1 + rel_end + 1..].trim();
                let display_number = raw_label
                    .strip_prefix("Capture screen ")
                    .and_then(|number| number.parse::<usize>().ok())
                    .map(|number| number + 1);
                screens.push(RecordingScreen {
                    device_index: device_index.to_string(),
                    label: display_number
                        .map(|number| format!("Screen {}", number))
                        .unwrap_or_else(|| raw_label.to_string()),
                });
            }
        }
    }

    screens
}

fn avfoundation_screens(ffmpeg: &str) -> Result<Vec<RecordingScreen>, String> {
    let output = new_command(ffmpeg)
        .args(["-f", "avfoundation", "-list_devices", "true", "-i", ""])
        .output()
        .map_err(|error| format!("Failed to list recording screens: {}", error))?;

    let text = String::from_utf8_lossy(&output.stderr);
    let screens = parse_avfoundation_screens(&text);
    if screens.is_empty() {
        Err("No recording screen found".to_string())
    } else {
        Ok(screens)
    }
}

fn select_avfoundation_screen(
    screens: &[RecordingScreen],
    requested_index: Option<&str>,
) -> Result<String, String> {
    match requested_index {
        Some(index) if screens.iter().any(|screen| screen.device_index == index) => {
            Ok(index.to_string())
        }
        Some(_) => Err("Selected recording screen is no longer available".to_string()),
        None => screens
            .first()
            .map(|screen| screen.device_index.clone())
            .ok_or_else(|| "No recording screen found".to_string()),
    }
}

fn avfoundation_screen_index(ffmpeg: &str) -> String {
    avfoundation_screens(ffmpeg)
        .ok()
        .and_then(|screens| screens.first().map(|screen| screen.device_index.clone()))
        .unwrap_or_else(|| "1".to_string())
}

/// Detect the default avfoundation audio input device index (macOS).
///
/// ffmpeg prints the device list to stderr. We pick the first device listed
/// under "AVFoundation audio devices:" (the default microphone). Returns `None`
/// if detection fails or no audio device exists, so recording can gracefully
/// fall back to video-only instead of breaking.
fn avfoundation_audio_index(ffmpeg: &str) -> Option<String> {
    let output = new_command(ffmpeg)
        .args(["-f", "avfoundation", "-list_devices", "true", "-i", ""])
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stderr);
    let mut in_audio_section = false;
    let mut best_match: Option<(String, usize)> = None;

    for line in text.lines() {
        if line.contains("AVFoundation audio devices:") {
            in_audio_section = true;
            continue;
        }
        if line.contains("AVFoundation video devices:") {
            in_audio_section = false;
            continue;
        }
        if !in_audio_section {
            continue;
        }
        if let Some(start) = line.rfind('[') {
            if let Some(rel_end) = line[start + 1..].find(']') {
                let idx = &line[start + 1..start + 1 + rel_end];
                if !idx.is_empty() && idx.bytes().all(|b| b.is_ascii_digit()) {
                    let name = line[start + 1 + rel_end + 1..].trim().to_lowercase();
                    let priority = if name.contains("blackhole") || name.contains("soundflower") {
                        2
                    } else if name.contains("microphone") {
                        1
                    } else {
                        0
                    };

                    match best_match {
                        None => {
                            best_match = Some((idx.to_string(), priority));
                        }
                        Some(ref current) => {
                            if priority > current.1 {
                                best_match = Some((idx.to_string(), priority));
                            }
                        }
                    }
                }
            }
        }
    }

    best_match.map(|(idx, _)| idx)
}

/// Detect the first DirectShow audio input device name (Windows).
///
/// Returns `None` if detection fails or no audio device exists, so recording
/// can gracefully fall back to video-only instead of breaking.
fn dshow_audio_device(ffmpeg: &str) -> Option<String> {
    let output = new_command(ffmpeg)
        .args(["-list_devices", "true", "-f", "dshow", "-i", "dummy"])
        .output()
        .ok()?;

    let text = String::from_utf8_lossy(&output.stderr);
    let mut in_audio_section = false;

    for line in text.lines() {
        let lower = line.to_lowercase();
        if lower.contains("directshow audio devices") {
            in_audio_section = true;
            continue;
        }
        if lower.contains("directshow video devices") {
            in_audio_section = false;
            continue;
        }
        if !in_audio_section {
            continue;
        }
        // Device lines look like:
        //   [dshow @ 0x...]  "Microphone (Realtek(R) Audio)"
        // The device name is wrapped in the first pair of double quotes.
        if let Some(start) = line.find('"') {
            if let Some(rel_end) = line[start + 1..].find('"') {
                let name = &line[start + 1..start + 1 + rel_end];
                if !name.is_empty() {
                    return Some(name.to_string());
                }
            }
        }
    }

    None
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

fn wait_for_recording_start(
    child: &mut Child,
    output_path: &str,
    stderr_log: &std::path::Path,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(3);

    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Failed to inspect FFmpeg: {}", error))?
        {
            let _ = std::fs::remove_file(output_path);
            return Err(format!(
                "FFmpeg exited before recording started ({status}). Log: {}",
                stderr_log.display()
            ));
        }

        if std::fs::metadata(output_path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false)
        {
            return Ok(());
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(output_path);
            return Err(format!(
                "FFmpeg did not create a recording file. Log: {}",
                stderr_log.display()
            ));
        }

        std::thread::sleep(Duration::from_millis(100));
    }
}

fn stop_child_gracefully(child: &mut Child) -> Result<(), String> {
    #[cfg(unix)]
    {
        // Resume a paused recorder so it can read the quit command.
        let _ = new_command("/bin/kill")
            .args(["-s", "CONT", &child.id().to_string()])
            .status();
    }

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(b"q\n");
        let _ = stdin.flush();
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Failed to inspect FFmpeg: {}", error))?
        {
            return if status.success() {
                Ok(())
            } else {
                Err(format!("FFmpeg stopped with status {status}"))
            };
        }

        if Instant::now() >= deadline {
            child
                .kill()
                .map_err(|error| format!("Failed to terminate FFmpeg: {}", error))?;
            let _ = child.wait();
            return Err("FFmpeg did not stop cleanly; the recording was not finalized".to_string());
        }

        std::thread::sleep(Duration::from_millis(100));
    }
}

// ── Live preview ─────────────────────────────────────────────────────────────
//
// While recording, the same ffmpeg process feeds a second output: a low rate,
// downscaled MJPEG stream on stdout. Rust splits that stream into whole JPEG
// frames and pushes them to the UI, so the user sees what is actually being
// captured instead of a frozen first frame.

/// Frames per second pushed to the UI. Deliberately far below the recording
/// framerate — every frame crosses the IPC bridge as a base64 string.
const PREVIEW_FPS: u32 = 8;
/// Preview width in pixels; the height follows the source aspect ratio.
const PREVIEW_WIDTH: u32 = 480;
/// MJPEG quality (2 = best, 31 = worst). 8 keeps frames around 20-40 KB.
const PREVIEW_QUALITY: &str = "8";
const PREVIEW_EVENT: &str = "recording-preview-frame";
/// Hard cap on undecodable bytes held while waiting for a frame boundary.
const PREVIEW_BUFFER_LIMIT: usize = 8 * 1024 * 1024;

const JPEG_SOI: [u8; 2] = [0xFF, 0xD8];
const JPEG_EOI: [u8; 2] = [0xFF, 0xD9];

/// Audio noise reduction pipeline:
/// 1. highpass=f=200  — remove low-freq rumble (fans, AC, hum)
/// 2. lowpass=f=3000  — remove high-freq hiss
/// 3. afftdn=nf=-25   — FFT-based noise reduction (background noise floor)
/// 4. acompressor     — compress dynamic range so voice is clearer
/// 5. volume=1.5      — boost volume after filtering
const AUDIO_FILTER: &str = "highpass=f=200,lowpass=f=3000,afftdn=nf=-25,acompressor=threshold=0.089:ratio=9:attack=200:release=1000,volume=1.5";

/// How a platform feeds ffmpeg: the input arguments plus the stream specifier
/// of the microphone, if one was detected.
struct RecorderInput {
    input_args: Vec<String>,
    /// `0:a` on macOS (screen and mic share one avfoundation device) or `1:a`
    /// on Windows (dshow is a separate input). `None` means video only.
    audio_map: Option<String>,
}

/// Split the captured video into the recorded stream and the preview stream.
/// Any crop is applied before the split so the preview matches the region that
/// is actually being recorded.
fn preview_filter_complex(crop: Option<&str>) -> String {
    let source = match crop {
        Some(crop) => format!("[0:v]{},split=2[rec][prv]", crop),
        None => "[0:v]split=2[rec][prv]".to_string(),
    };
    format!(
        "{};[prv]fps={},scale={}:-2[prv_out]",
        source, PREVIEW_FPS, PREVIEW_WIDTH
    )
}

/// Build the full ffmpeg argument list for one recording.
///
/// With `with_preview` the video is routed through a complex filtergraph and a
/// second MJPEG output is appended; without it the arguments stay on the plain
/// single-output path, which is the fallback when the preview cannot start.
fn build_recording_args(
    input: &RecorderInput,
    crop: Option<&str>,
    output: &str,
    with_preview: bool,
) -> Vec<String> {
    let mut args: Vec<String> = vec!["-y".into()];
    args.extend(input.input_args.iter().cloned());

    if with_preview {
        args.extend([
            "-filter_complex".into(),
            preview_filter_complex(crop),
            "-map".into(),
            "[rec]".into(),
        ]);
        if let Some(audio) = input.audio_map.as_ref() {
            args.extend(["-map".into(), audio.clone()]);
        }
    } else if let Some(crop) = crop {
        args.extend(["-vf".into(), crop.to_string()]);
    }

    args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "ultrafast".into(),
        "-crf".into(),
        "20".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
    ]);

    if input.audio_map.is_some() {
        args.extend([
            "-af".into(),
            AUDIO_FILTER.into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "128k".into(),
        ]);
    }

    args.extend(["-movflags".into(), "+faststart".into(), output.to_string()]);

    if with_preview {
        args.extend([
            "-map".into(),
            "[prv_out]".into(),
            "-an".into(),
            "-c:v".into(),
            "mjpeg".into(),
            "-q:v".into(),
            PREVIEW_QUALITY.into(),
            "-f".into(),
            "mjpeg".into(),
            "pipe:1".into(),
        ]);
    }

    args
}

/// Index just past the next end-of-image marker, if a whole frame is buffered.
///
/// Safe to scan blindly: inside JPEG entropy data every `0xFF` is byte-stuffed
/// as `0xFF 0x00`, so `0xFF 0xD9` only ever appears as the real frame end.
fn jpeg_frame_end(buffer: &[u8]) -> Option<usize> {
    buffer
        .windows(2)
        .position(|pair| pair == JPEG_EOI)
        .map(|start| start + JPEG_EOI.len())
}

/// Drain ffmpeg's MJPEG stdout and forward each whole frame to the UI.
///
/// The pipe MUST be drained continuously: once the OS pipe buffer fills up
/// ffmpeg blocks on write and the recording itself would stall. The pump
/// therefore keeps reading — discarding what it cannot parse — until ffmpeg
/// closes stdout at the end of the recording.
fn spawn_preview_pump(app: AppHandle, mut stdout: ChildStdout) {
    std::thread::spawn(move || {
        let mut pending: Vec<u8> = Vec::with_capacity(256 * 1024);
        let mut chunk = [0u8; 64 * 1024];

        loop {
            let read = match stdout.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => read,
                Err(error) => {
                    eprintln!("[recording] preview stream ended: {}", error);
                    break;
                }
            };
            pending.extend_from_slice(&chunk[..read]);

            while let Some(end) = jpeg_frame_end(&pending) {
                let frame: Vec<u8> = pending.drain(..end).collect();
                if !frame.starts_with(&JPEG_SOI) {
                    continue;
                }
                let encoded = base64::engine::general_purpose::STANDARD.encode(&frame);
                let _ = app.emit(PREVIEW_EVENT, format!("data:image/jpeg;base64,{}", encoded));
            }

            // A stream that never yields a frame boundary must not grow forever.
            if pending.len() > PREVIEW_BUFFER_LIMIT {
                pending.clear();
            }
        }
    });
}

fn spawn_recording_process(
    ffmpeg: &str,
    args: &[String],
    stderr_log: &std::path::Path,
    with_preview: bool,
) -> Result<Child, String> {
    // Log stderr to a temp file for debugging instead of discarding it.
    let stderr_file = std::fs::File::create(stderr_log)
        .map(Stdio::from)
        .unwrap_or_else(|_| Stdio::null());

    new_command(ffmpeg)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(if with_preview {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stderr(stderr_file)
        .spawn()
        .map_err(|error| format!("Failed to start ffmpeg: {}", error))
}

/// Start ffmpeg with the live preview branch, falling back to a plain recording
/// if that pipeline fails to come up. A preview that cannot start must never
/// cost the user their recording.
fn start_recorder(
    app: &AppHandle,
    ffmpeg: &str,
    input: &RecorderInput,
    crop: Option<&str>,
    output: &str,
    stderr_log: &std::path::Path,
) -> Result<Child, String> {
    let args = build_recording_args(input, crop, output, true);
    let mut child = spawn_recording_process(ffmpeg, &args, stderr_log, true)?;

    // Start draining before waiting: an unread pipe would block ffmpeg and the
    // recording file would never appear.
    if let Some(stdout) = child.stdout.take() {
        spawn_preview_pump(app.clone(), stdout);
    }

    match wait_for_recording_start(&mut child, output, stderr_log) {
        Ok(()) => Ok(child),
        Err(error) => {
            eprintln!(
                "[recording] live preview pipeline failed ({}); retrying without preview",
                error
            );
            let args = build_recording_args(input, crop, output, false);
            let mut child = spawn_recording_process(ffmpeg, &args, stderr_log, false)?;
            wait_for_recording_start(&mut child, output, stderr_log)?;
            Ok(child)
        }
    }
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

pub(crate) fn get_ffmpeg_path(app: &AppHandle) -> Option<String> {
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        let local_exe = data_dir.join("ffmpeg.exe");
        if local_exe.exists() {
            return Some(local_exe.to_string_lossy().into_owned());
        }
    }

    // Bundled sidecar (Windows installer places ffmpeg.exe next to the app exe).
    if cfg!(target_os = "windows") {
        if let Some(exe_dir) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        {
            let sidecar = exe_dir.join("ffmpeg.exe");
            if sidecar.exists() {
                return Some(sidecar.to_string_lossy().into_owned());
            }
        }
    }

    for path in KNOWN_FFMPEG_PATHS {
        let p = std::path::Path::new(path);
        if p.exists() {
            return Some(path.to_string());
        }
    }

    if let Ok(output) = new_command("which").arg("ffmpeg").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }

    if let Ok(output) = new_command("where").arg("ffmpeg").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let first_path = path.lines().next().unwrap_or("").trim().to_string();
            if !first_path.is_empty() && std::path::Path::new(&first_path).exists() {
                return Some(first_path);
            }
        }
    }

    if new_command("ffmpeg")
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
pub fn check_ffmpeg_installed(app: AppHandle) -> bool {
    get_ffmpeg_path(&app).is_some()
}

#[tauri::command]
pub fn list_recording_screens(app: AppHandle) -> Result<Vec<RecordingScreen>, String> {
    if cfg!(target_os = "macos") {
        let ffmpeg = get_ffmpeg_path(&app).ok_or("FFmpeg is not installed")?;
        let lang = crate::i18n::current(&app);
        avfoundation_screens(&ffmpeg).map(|screens| {
            screens
                .into_iter()
                .enumerate()
                .map(|(i, mut s)| {
                    s.label = crate::i18n::trf(lang, "screen.numbered", &[&(i + 1)]);
                    s
                })
                .collect()
        })
    } else {
        Ok(vec![RecordingScreen {
            device_index: "desktop".to_string(),
            label: crate::i18n::tr(crate::i18n::current(&app), "screen.whole").to_string(),
        }])
    }
}

#[tauri::command]
pub fn get_ffmpeg_debug_info(app: AppHandle) -> String {
    let mut info = String::new();
    info.push_str("=== FFmpeg Detection Debug ===\n");
    for path in KNOWN_FFMPEG_PATHS {
        let exists = std::path::Path::new(path).exists();
        info.push_str(&format!("[{}] {}\n", if exists { "✓" } else { "✗" }, path));
    }
    match get_ffmpeg_path(&app) {
        Some(p) => info.push_str(&format!("\n→ Resolved: {}\n", p)),
        None => info.push_str("\n→ NOT FOUND\n"),
    }
    info
}

#[tauri::command]
pub async fn install_ffmpeg(app: AppHandle) -> Result<String, String> {
    if cfg!(target_os = "windows") {
        let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| crate::i18n::trf(crate::i18n::current(&app), "ffmpeg.appdata_failed", &[&e]))?;

        let target_exe = data_dir.join("ffmpeg.exe");

        let script = format!(
            r#"
            $ErrorActionPreference = 'Stop'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
            $tempZip = Join-Path $env:TEMP "ffmpeg_installer_tmp.zip"
            $extractDir = Join-Path $env:TEMP "ffmpeg_extracted_tmp"
            
            if (Test-Path $tempZip) {{ Remove-Item -Path $tempZip -Force }}
            if (Test-Path $extractDir) {{ Remove-Item -Path $extractDir -Recurse -Force }}
            
            Write-Host "Downloading FFmpeg (~30MB)..."
            Invoke-WebRequest -Uri $url -OutFile $tempZip
            
            Write-Host "Extracting ZIP..."
            Expand-Archive -Path $tempZip -DestinationPath $extractDir -Force
            
            Write-Host "Locating and moving ffmpeg.exe..."
            $ffmpegExe = Get-ChildItem -Path $extractDir -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
            if ($null -eq $ffmpegExe) {{ throw "Lỗi: Không tìm thấy ffmpeg.exe trong tệp nén." }}
            
            Move-Item -Path $ffmpegExe.FullName -Destination "{}" -Force
            
            Write-Host "Cleaning up temporary files..."
            Remove-Item -Path $tempZip -Force
            Remove-Item -Path $extractDir -Recurse -Force
            Write-Host "Done"
            "#,
            target_exe.to_string_lossy()
        );

        let output = new_command("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| crate::i18n::trf(crate::i18n::current(&app), "ffmpeg.launch_failed", &[&e]))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);

        if output.status.success() {
            Ok(crate::i18n::tr(crate::i18n::current(&app), "ffmpeg.installed_win").to_string())
        } else {
            Err(crate::i18n::trf(crate::i18n::current(&app), "ffmpeg.install_failed", &[&stdout, &stderr]))
        }
    } else {
        let brew_path = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
            .iter()
            .find(|p| std::path::Path::new(p).exists())
            .map(|s| s.to_string());

        let brew_cmd = match brew_path {
            Some(p) => p,
            None => {
                return Err(
                    crate::i18n::tr(crate::i18n::current(&app), "ffmpeg.no_brew").to_string(),
                )
            }
        };

        let output = new_command(&brew_cmd)
            .args(["install", "ffmpeg"])
            .output()
            .map_err(|e| crate::i18n::trf(crate::i18n::current(&app), "ffmpeg.brew_failed", &[&e]))?;

        if output.status.success() {
            Ok(crate::i18n::tr(crate::i18n::current(&app), "ffmpeg.installed_mac").to_string())
        } else {
            Err(crate::i18n::tr(crate::i18n::current(&app), "ffmpeg.brew_install_failed").to_string())
        }
    }
}

#[tauri::command]
pub fn start_recording_full(app: AppHandle, screen_index: Option<String>) -> Result<(), String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    if inner.process.is_some() {
        return Err("Already recording".to_string());
    }

    let output = tmp_output_path();
    let ffmpeg_cmd = get_ffmpeg_path(&app).ok_or("FFmpeg is not installed")?;

    let input = if cfg!(target_os = "windows") {
        let mut input_args: Vec<String> = vec![
            "-f".into(),
            "gdigrab".into(),
            "-framerate".into(),
            "30".into(),
            "-draw_mouse".into(),
            "1".into(),
            "-i".into(),
            "desktop".into(),
        ];
        let audio = dshow_audio_device(&ffmpeg_cmd);
        if let Some(ref device) = audio {
            input_args.extend([
                "-f".into(),
                "dshow".into(),
                "-i".into(),
                format!("audio={}", device),
            ]);
        }
        RecorderInput {
            input_args,
            audio_map: audio.map(|_| "1:a".to_string()),
        }
    } else {
        let screens = avfoundation_screens(&ffmpeg_cmd)?;
        let screen_idx = select_avfoundation_screen(&screens, screen_index.as_deref())?;
        let audio = avfoundation_audio_index(&ffmpeg_cmd);
        let device = match audio {
            Some(ref idx) => format!("{}:{}", screen_idx, idx),
            None => format!("{}:none", screen_idx),
        };
        RecorderInput {
            input_args: vec![
                "-f".into(),
                "avfoundation".into(),
                "-framerate".into(),
                "30".into(),
                "-capture_cursor".into(),
                "1".into(),
                "-i".into(),
                device,
            ],
            audio_map: audio.map(|_| "0:a".to_string()),
        }
    };

    let stderr_log = std::env::temp_dir().join("edukids-ffmpeg-full.log");
    let child = start_recorder(&app, &ffmpeg_cmd, &input, None, &output, &stderr_log)?;

    eprintln!(
        "[recording] full recording started, pid={}, log={}",
        child.id(),
        stderr_log.display()
    );

    inner.process = Some(child);
    inner.output_path = Some(output);
    inner.start_time = Some(Instant::now());

    app.emit("recording-started", "full").ok();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_recording_args, jpeg_frame_end, new_command, parse_avfoundation_screens,
        select_avfoundation_screen, stop_child_gracefully, wait_for_recording_start, RecorderInput,
    };

    fn mac_input(with_audio: bool) -> RecorderInput {
        RecorderInput {
            input_args: vec![
                "-f".into(),
                "avfoundation".into(),
                "-i".into(),
                if with_audio { "1:0".into() } else { "1:none".into() },
            ],
            audio_map: with_audio.then(|| "0:a".to_string()),
        }
    }

    fn args_of(input: &RecorderInput, crop: Option<&str>, preview: bool) -> Vec<String> {
        build_recording_args(input, crop, "/tmp/out.mp4", preview)
    }

    fn index_of(args: &[String], value: &str) -> usize {
        args.iter().position(|arg| arg == value).expect(value)
    }

    #[test]
    fn preview_output_is_appended_after_the_recording_output() {
        let args = args_of(&mac_input(true), None, true);

        // The mp4 must still be the first output, or per-output options such as
        // -c:v libx264 would attach to the preview stream instead.
        assert!(index_of(&args, "/tmp/out.mp4") < index_of(&args, "pipe:1"));
        assert!(index_of(&args, "libx264") < index_of(&args, "/tmp/out.mp4"));
        assert_eq!(args.last().unwrap(), "pipe:1");
        assert!(args.contains(&"mjpeg".to_string()));
        assert!(args.contains(&"[prv_out]".to_string()));
        // Audio is mapped explicitly once the video comes from a filtergraph.
        assert!(args.contains(&"0:a".to_string()));
        assert!(args.contains(&"aac".to_string()));
    }

    #[test]
    fn preview_crops_before_splitting_so_both_outputs_match() {
        let args = args_of(&mac_input(false), Some("crop=100:200:10:20"), true);
        let graph = &args[index_of(&args, "-filter_complex") + 1];

        assert!(graph.starts_with("[0:v]crop=100:200:10:20,split=2[rec][prv]"));
        assert!(graph.contains("scale=480:-2[prv_out]"));
        // Video-only input: no audio map, no audio filter.
        assert!(!args.contains(&"aac".to_string()));
    }

    #[test]
    fn fallback_args_keep_the_original_single_output_pipeline() {
        let args = args_of(&mac_input(true), Some("crop=100:200:10:20"), false);

        assert!(!args.contains(&"-filter_complex".to_string()));
        assert!(!args.contains(&"pipe:1".to_string()));
        assert!(!args.contains(&"-map".to_string()));
        assert_eq!(args[index_of(&args, "-vf") + 1], "crop=100:200:10:20");
        assert_eq!(args.last().unwrap(), "/tmp/out.mp4");
    }

    #[test]
    fn splits_the_mjpeg_stream_on_whole_frames_only() {
        let mut stream = vec![0xFF, 0xD8, 0x01, 0x02, 0xFF, 0xD9];
        assert_eq!(jpeg_frame_end(&stream), Some(6));

        // A partial trailing frame must stay buffered.
        stream.extend_from_slice(&[0xFF, 0xD8, 0x03]);
        assert_eq!(jpeg_frame_end(&stream), Some(6));
        assert_eq!(jpeg_frame_end(&stream[6..]), None);
    }

    const DEVICE_LIST: &str = r#"
[AVFoundation indev] AVFoundation video devices:
[AVFoundation indev] [0] FaceTime HD Camera
[AVFoundation indev] [1] Capture screen 0
[AVFoundation indev] [2] Capture screen 1
[AVFoundation indev] AVFoundation audio devices:
[AVFoundation indev] [0] MacBook Pro Microphone
"#;

    #[test]
    fn parses_and_selects_requested_recording_screen() {
        let screens = parse_avfoundation_screens(DEVICE_LIST);

        assert_eq!(screens.len(), 2);
        assert_eq!(screens[0].device_index, "1");
        assert_eq!(screens[0].label, "Screen 1");
        assert_eq!(screens[1].device_index, "2");
        assert_eq!(screens[1].label, "Screen 2");
        assert_eq!(
            select_avfoundation_screen(&screens, Some("2")).unwrap(),
            "2"
        );
        assert!(select_avfoundation_screen(&screens, Some("3")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn waits_for_output_and_stops_child_cleanly() {
        use std::process::{Command, Stdio};

        let output = std::env::temp_dir().join(format!(
            "edukids-recording-lifecycle-test-{}.tmp",
            std::process::id()
        ));
        let log = output.with_extension("log");
        let mut child = new_command("/bin/sh")
            .args([
                "-c",
                "sleep 0.1; printf ready > \"$1\"; read command; test \"$command\" = q",
                "recording-lifecycle-test",
            ])
            .arg(&output)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();

        wait_for_recording_start(&mut child, output.to_str().unwrap(), &log).unwrap();
        stop_child_gracefully(&mut child).unwrap();

        assert!(std::fs::metadata(&output).unwrap().len() > 0);
        let _ = std::fs::remove_file(output);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_and_terminates_child_that_never_creates_output() {
        use std::process::{Command, Stdio};

        let output = std::env::temp_dir().join(format!(
            "edukids-recording-timeout-test-{}.tmp",
            std::process::id()
        ));
        let log = output.with_extension("log");
        let mut child = new_command("/bin/sleep")
            .arg("30")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();

        let error = wait_for_recording_start(&mut child, output.to_str().unwrap(), &log)
            .expect_err("a recorder without output must fail startup");

        assert!(error.contains("did not create a recording file"));
        assert!(child.try_wait().unwrap().is_some());
        assert!(!output.exists());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_child_that_writes_partial_output_then_exits() {
        use std::process::{Command, Stdio};

        let output = std::env::temp_dir().join(format!(
            "edukids-recording-partial-test-{}.tmp",
            std::process::id()
        ));
        let log = output.with_extension("log");
        let mut child = new_command("/bin/sh")
            .args([
                "-c",
                "printf partial > \"$1\"; exit 7",
                "recording-partial-test",
            ])
            .arg(&output)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));

        let error = wait_for_recording_start(&mut child, output.to_str().unwrap(), &log)
            .expect_err("a failed recorder must not be accepted from a partial file");

        assert!(error.contains("exited before recording started"));
        assert!(!output.exists());
    }
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

    if inner.process.is_some() {
        return Err("Already recording".to_string());
    }

    let output = tmp_output_path();
    let w = if width % 2 != 0 { width + 1 } else { width };
    let h = if height % 2 != 0 { height + 1 } else { height };
    let crop_filter = format!("crop={}:{}:{}:{}", w, h, x, y);

    let ffmpeg_cmd = get_ffmpeg_path(&app).ok_or("FFmpeg is not installed")?;

    let input = if cfg!(target_os = "windows") {
        let mut input_args: Vec<String> = vec![
            "-f".into(),
            "gdigrab".into(),
            "-framerate".into(),
            "30".into(),
            "-draw_mouse".into(),
            "1".into(),
            "-i".into(),
            "desktop".into(),
        ];
        let audio = dshow_audio_device(&ffmpeg_cmd);
        if let Some(ref device) = audio {
            input_args.extend([
                "-f".into(),
                "dshow".into(),
                "-i".into(),
                format!("audio={}", device),
            ]);
        }
        RecorderInput {
            input_args,
            audio_map: audio.map(|_| "1:a".to_string()),
        }
    } else {
        let screen_idx = avfoundation_screen_index(&ffmpeg_cmd);
        let audio = avfoundation_audio_index(&ffmpeg_cmd);
        let device = match audio {
            Some(ref idx) => format!("{}:{}", screen_idx, idx),
            None => format!("{}:none", screen_idx),
        };
        RecorderInput {
            input_args: vec![
                "-f".into(),
                "avfoundation".into(),
                "-framerate".into(),
                "30".into(),
                "-capture_cursor".into(),
                "1".into(),
                "-i".into(),
                device,
            ],
            audio_map: audio.map(|_| "0:a".to_string()),
        }
    };

    let stderr_log = std::env::temp_dir().join("edukids-ffmpeg-region.log");
    let child = start_recorder(
        &app,
        &ffmpeg_cmd,
        &input,
        Some(&crop_filter),
        &output,
        &stderr_log,
    )?;

    eprintln!(
        "[recording] region recording started, pid={}, crop={}, log={}",
        child.id(),
        crop_filter,
        stderr_log.display()
    );

    inner.process = Some(child);
    inner.output_path = Some(output);
    inner.start_time = Some(Instant::now());

    app.emit("recording-started", "region").ok();
    Ok(())
}

#[tauri::command]
pub fn stop_recording(app: AppHandle) -> Result<String, String> {
    let state = app.state::<RecordingState>();
    let mut inner = state.0.lock().map_err(|e| e.to_string())?;

    let mut child = inner.process.take().ok_or("Not currently recording")?;
    let output_path = inner.output_path.take().ok_or("No output path")?;
    inner.start_time = None;
    drop(inner);

    if let Err(error) = stop_child_gracefully(&mut child) {
        let _ = std::fs::remove_file(&output_path);
        return Err(error);
    }

    let output_size = std::fs::metadata(&output_path)
        .map_err(|error| format!("Recording file was not created: {}", error))?
        .len();
    if output_size == 0 {
        let _ = std::fs::remove_file(&output_path);
        return Err("Recording file is empty".to_string());
    }

    app.emit("recording-stopped", &output_path).ok();
    Ok(output_path)
}

#[tauri::command]
pub fn pause_recording(app: AppHandle) -> Result<(), String> {
    let state = app.state::<RecordingState>();
    let inner = state.0.lock().map_err(|e| e.to_string())?;

    let pid = inner
        .process
        .as_ref()
        .map(Child::id)
        .ok_or("Not currently recording")?;

    if cfg!(target_os = "windows") {
        return Err("Pause is not supported on Windows".to_string());
    }

    let status = new_command("/bin/kill")
        .args(["-s", "STOP", &pid.to_string()])
        .status()
        .map_err(|error| format!("Failed to pause recording: {}", error))?;
    if status.success() {
        Ok(())
    } else {
        Err("Failed to pause recording".to_string())
    }
}

#[tauri::command]
pub fn resume_recording(app: AppHandle) -> Result<(), String> {
    let state = app.state::<RecordingState>();
    let inner = state.0.lock().map_err(|e| e.to_string())?;

    let pid = inner
        .process
        .as_ref()
        .map(Child::id)
        .ok_or("Not currently recording")?;

    if cfg!(target_os = "windows") {
        return Err("Resume is not supported on Windows".to_string());
    }

    let status = new_command("/bin/kill")
        .args(["-s", "CONT", &pid.to_string()])
        .status()
        .map_err(|error| format!("Failed to resume recording: {}", error))?;
    if status.success() {
        Ok(())
    } else {
        Err("Failed to resume recording".to_string())
    }
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
        .map(|i| i.process.is_some())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn save_recording(
    app: AppHandle,
    source_path: String,
    default_name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Video", &["mp4"])
        .blocking_save_file();

    if let Some(path) = file_path {
        let dest = path.into_path().map_err(|e| e.to_string())?;
        // Try renaming first (instant if on same drive), fallback to copy if across drives
        if std::fs::rename(&source_path, &dest).is_err() {
            std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
            std::fs::remove_file(&source_path).ok();
        }
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn discard_recording(source_path: String) -> Result<(), String> {
    std::fs::remove_file(&source_path).map_err(|e| e.to_string())
}

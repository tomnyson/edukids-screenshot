// video_edit.rs — simple post-recording edits done with ffmpeg:
// trim (start/end), speed (0.5x–2x), mute, and MP4 or GIF export.
//
// The save dialog lives in the frontend so `export_recording` can also be
// driven directly by the smoke test. Commands that block are `async` and run
// ffmpeg on a blocking thread (sync commands run on the main thread and can
// deadlock the app on Windows).

use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

use crate::i18n::{self, tr, trf, Lang};
use crate::recording::{get_ffmpeg_path, new_command};

pub const MIN_SPEED: f64 = 0.5;
pub const MAX_SPEED: f64 = 2.0;
const GIF_FPS: u32 = 12;
const GIF_MAX_WIDTH: u32 = 960;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    /// Trim start, seconds from the beginning of the source.
    pub start: f64,
    /// Trim end, seconds from the beginning of the source.
    pub end: f64,
    /// Playback speed multiplier (0.5–2.0).
    pub speed: f64,
    /// Drop the audio track.
    pub mute: bool,
    /// "mp4" or "gif".
    pub format: String,
}

#[derive(Default)]
pub struct ExportState {
    child: Mutex<Option<Child>>,
    cancelled: AtomicBool,
}

/// Format seconds for ffmpeg (`12.345`).
fn secs(v: f64) -> String {
    format!("{:.3}", v.max(0.0))
}

/// Speed without trailing zeros for filter expressions (`2`, `0.75`).
fn speed_str(v: f64) -> String {
    let s = format!("{:.4}", v);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// Duration of the exported clip in seconds.
pub fn output_duration(opts: &ExportOptions) -> f64 {
    ((opts.end - opts.start) / opts.speed).max(0.0)
}

/// Build the ffmpeg argument list for an export. Pure, unit-tested.
pub fn build_export_args(source: &str, dest: &str, opts: &ExportOptions, lang: Lang) -> Result<Vec<String>, String> {
    if !(opts.start >= 0.0) || !(opts.end > opts.start + 0.05) {
        return Err(trf(lang, "export.bad_range", &[&format!("{:.2}", opts.start), &format!("{:.2}", opts.end)]));
    }
    if !(MIN_SPEED..=MAX_SPEED).contains(&opts.speed) {
        return Err(trf(lang, "export.bad_speed", &[&MIN_SPEED, &MAX_SPEED]));
    }
    let speed_changed = (opts.speed - 1.0).abs() > 1e-6;
    let setpts = format!("setpts=PTS/{}", speed_str(opts.speed));

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-nostats".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-ss".into(),
        secs(opts.start),
        "-to".into(),
        secs(opts.end),
        "-i".into(),
        source.into(),
    ];

    match opts.format.as_str() {
        "mp4" => {
            args.extend(["-map".into(), "0:v:0".into()]);
            if !opts.mute {
                // `?` = optional: recordings without a microphone have no audio.
                args.extend(["-map".into(), "0:a:0?".into()]);
            }
            if speed_changed {
                args.extend(["-vf".into(), setpts]);
            }
            args.extend([
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "veryfast".into(),
                "-crf".into(),
                "20".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ]);
            if opts.mute {
                args.push("-an".into());
            } else {
                if speed_changed {
                    // atempo supports 0.5–2.0 in a single instance.
                    args.extend(["-af".into(), format!("atempo={}", speed_str(opts.speed))]);
                }
                args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "128k".into()]);
            }
            args.extend(["-movflags".into(), "+faststart".into(), "-f".into(), "mp4".into()]);
        }
        "gif" => {
            let mut chain = Vec::new();
            if speed_changed {
                chain.push(setpts);
            }
            chain.push(format!("fps={GIF_FPS}"));
            chain.push(format!("scale=min({GIF_MAX_WIDTH}\\,iw):-1:flags=lanczos"));
            let graph = format!(
                "[0:v]{},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5",
                chain.join(",")
            );
            args.extend([
                "-filter_complex".into(),
                graph,
                "-an".into(),
                "-loop".into(),
                "0".into(),
                "-f".into(),
                "gif".into(),
            ]);
        }
        other => return Err(trf(lang, "export.bad_format", &[&other])),
    }

    args.push(dest.into());
    Ok(args)
}

/// Parse one `-progress` line; returns output time in seconds.
fn progress_seconds(line: &str) -> Option<f64> {
    let (key, value) = line.trim().split_once('=')?;
    match key {
        // Despite the name, out_time_ms is in microseconds (same as out_time_us).
        "out_time_us" | "out_time_ms" => value.parse::<f64>().ok().map(|us| us / 1_000_000.0),
        _ => None,
    }
}

fn tail(text: &str, lines: usize) -> String {
    let all: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

/// Export an edited copy of `source_path` to `dest_path`.
/// Emits `export-progress` (0.0–1.0) while running.
#[tauri::command]
pub async fn export_recording(
    app: AppHandle,
    source_path: String,
    dest_path: String,
    options: ExportOptions,
) -> Result<(), String> {
    let lang = i18n::current(&app);
    let ffmpeg = get_ffmpeg_path(&app).ok_or_else(|| tr(lang, "ffmpeg.missing").to_string())?;
    if !std::path::Path::new(&source_path).exists() {
        return Err(tr(lang, "export.no_source").into());
    }
    if std::path::Path::new(&source_path) == std::path::Path::new(&dest_path) {
        return Err(tr(lang, "export.same_path").into());
    }
    let args = build_export_args(&source_path, &dest_path, &options, lang)?;
    let total = output_duration(&options).max(0.001);

    tauri::async_runtime::spawn_blocking(move || run_export(&app, &ffmpeg, &args, total, &dest_path))
        .await
        .map_err(|e| e.to_string())?
}

fn run_export(app: &AppHandle, ffmpeg: &str, args: &[String], total: f64, dest: &str) -> Result<(), String> {
    let state = app.state::<ExportState>();
    state.cancelled.store(false, Ordering::SeqCst);

    let log_path = std::env::temp_dir().join("edukids-ffmpeg-export.log");
    let stderr = std::fs::File::create(&log_path)
        .map(Stdio::from)
        .unwrap_or_else(|_| Stdio::null());

    let mut child = new_command(ffmpeg)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(stderr)
        .spawn()
        .map_err(|e| trf(i18n::current(app), "export.spawn_failed", &[&e]))?;
    let stdout = child.stdout.take();
    {
        let mut slot = state.child.lock().map_err(|e| e.to_string())?;
        *slot = Some(child);
    }

    app.emit("export-progress", 0.0_f64).ok();
    if let Some(out) = stdout {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if let Some(t) = progress_seconds(&line) {
                app.emit("export-progress", (t / total).clamp(0.0, 1.0)).ok();
            }
        }
    }

    let status = {
        let mut slot = state.child.lock().map_err(|e| e.to_string())?;
        match slot.take() {
            Some(mut c) => c.wait().map_err(|e| e.to_string())?,
            None => return Err(tr(i18n::current(app), "export.lost").into()),
        }
    };

    if state.cancelled.swap(false, Ordering::SeqCst) {
        std::fs::remove_file(dest).ok();
        // A fixed code, not a sentence: the frontend recognises it in any language.
        return Err("CANCELLED".into());
    }
    if !status.success() {
        std::fs::remove_file(dest).ok();
        let log = std::fs::read_to_string(&log_path).unwrap_or_default();
        return Err(trf(i18n::current(app), "export.ffmpeg_failed", &[&status, &tail(&log, 6)]));
    }
    let size = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    if size == 0 {
        std::fs::remove_file(dest).ok();
        return Err(tr(i18n::current(app), "export.empty").into());
    }
    app.emit("export-progress", 1.0_f64).ok();
    Ok(())
}

/// Stop a running export (its partial output is deleted).
#[tauri::command]
pub fn cancel_export(state: tauri::State<'_, ExportState>) -> Result<(), String> {
    let mut slot = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = slot.as_mut() {
        state.cancelled.store(true, Ordering::SeqCst);
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(start: f64, end: f64, speed: f64, mute: bool, format: &str) -> ExportOptions {
        ExportOptions { start, end, speed, mute, format: format.into() }
    }

    fn joined(a: &[String]) -> String {
        a.join(" ")
    }

    #[test]
    fn mp4_trim_only_keeps_audio_without_filters() {
        let a = build_export_args("in.mp4", "out.mp4", &opts(1.0, 3.5, 1.0, false, "mp4"), Lang::Vi).unwrap();
        let s = joined(&a);
        assert!(s.contains("-ss 1.000 -to 3.500 -i in.mp4"));
        assert!(s.contains("-map 0:a:0?"));
        assert!(s.contains("-c:a aac"));
        assert!(!s.contains("setpts"));
        assert!(!s.contains("atempo"));
        assert!(!s.contains("-an"));
        assert_eq!(a.last().unwrap(), "out.mp4");
    }

    #[test]
    fn mp4_speed_and_mute() {
        let a = build_export_args("in.mp4", "out.mp4", &opts(0.0, 4.0, 2.0, true, "mp4"), Lang::Vi).unwrap();
        let s = joined(&a);
        assert!(s.contains("-vf setpts=PTS/2"));
        assert!(s.contains("-an"));
        assert!(!s.contains("atempo"));
        assert!(!s.contains("0:a:0"));
    }

    #[test]
    fn mp4_speed_with_audio_uses_atempo() {
        let a = build_export_args("in.mp4", "out.mp4", &opts(0.0, 4.0, 0.75, false, "mp4"), Lang::Vi).unwrap();
        let s = joined(&a);
        assert!(s.contains("-vf setpts=PTS/0.75"));
        assert!(s.contains("-af atempo=0.75"));
    }

    #[test]
    fn gif_uses_palette_and_no_audio() {
        let a = build_export_args("in.mp4", "out.gif", &opts(0.5, 2.5, 1.5, false, "gif"), Lang::Vi).unwrap();
        let s = joined(&a);
        assert!(s.contains("setpts=PTS/1.5,fps=12,scale=min(960\\,iw):-1:flags=lanczos"));
        assert!(s.contains("palettegen"));
        assert!(s.contains("paletteuse"));
        assert!(s.contains("-an"));
        assert!(s.contains("-loop 0"));
    }

    #[test]
    fn rejects_bad_input() {
        assert!(build_export_args("i", "o", &opts(3.0, 2.0, 1.0, false, "mp4"), Lang::Vi).is_err());
        assert!(build_export_args("i", "o", &opts(0.0, 2.0, 3.0, false, "mp4"), Lang::Vi).is_err());
        assert!(build_export_args("i", "o", &opts(0.0, 2.0, 1.0, false, "webm"), Lang::Vi).is_err());
    }

    #[test]
    fn duration_and_progress_parsing() {
        assert!((output_duration(&opts(1.0, 5.0, 2.0, false, "mp4")) - 2.0).abs() < 1e-9);
        assert_eq!(progress_seconds("out_time_us=1500000"), Some(1.5));
        assert_eq!(progress_seconds("out_time_ms=2000000"), Some(2.0));
        assert_eq!(progress_seconds("progress=continue"), None);
    }
}

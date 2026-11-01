// i18n.rs — the Rust side's user-facing strings in Vietnamese (default) and English.
//
// The frontend has its own dictionaries (src/i18n). Only what Rust shows by
// itself lives here: the tray menu, shortcut errors, export errors, ffmpeg
// install messages and screen names.

use tauri::{AppHandle, Manager};

use crate::settings::SettingsState;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    Vi,
    En,
}

impl Lang {
    pub fn parse(s: &str) -> Option<Lang> {
        match s {
            "vi" => Some(Lang::Vi),
            "en" => Some(Lang::En),
            _ => None,
        }
    }
    pub fn code(self) -> &'static str {
        match self {
            Lang::Vi => "vi",
            Lang::En => "en",
        }
    }
}

/// (key, Vietnamese, English). `{0}`, `{1}` are positional placeholders.
const TABLE: &[(&str, &str, &str)] = &[
    // Tray
    ("tray.capture_region", "📷  Chụp vùng", "📷  Capture area"),
    ("tray.capture_full", "🖥️  Chụp toàn màn hình", "🖥️  Capture full screen"),
    ("tray.record_region", "⏺  Quay vùng", "⏺  Record area"),
    ("tray.record_full", "⏺  Quay toàn màn hình", "⏺  Record full screen"),
    ("tray.stop_record", "⏹  Dừng quay", "⏹  Stop recording"),
    ("tray.open_window", "🪟  Mở cửa sổ", "🪟  Open window"),
    ("tray.shortcut_settings", "⌨️  Cài đặt phím tắt", "⌨️  Keyboard shortcuts"),
    ("tray.check_update", "🔄  Kiểm tra cập nhật", "🔄  Check for updates"),
    ("tray.about", "ℹ️  Giới thiệu", "ℹ️  About"),
    ("tray.quit", "Thoát", "Quit"),
    // Shortcut actions (names shown in settings)
    ("action.capture_region", "Chụp vùng", "Capture area"),
    ("action.capture_full", "Chụp toàn màn hình", "Capture full screen"),
    ("action.record_region", "Quay vùng", "Record area"),
    ("action.record_full", "Quay toàn màn hình", "Record full screen"),
    // Shortcut errors
    ("shortcut.no_config_dir", "Không tìm thấy thư mục cấu hình", "Settings folder not found"),
    ("shortcut.taken", "Phím tắt đang bị ứng dụng khác sử dụng ({0})", "This shortcut is used by another app ({0})"),
    ("shortcut.invalid", "Phím tắt không hợp lệ: {0} ({1})", "Invalid shortcut: {0} ({1})"),
    ("shortcut.duplicate", "{0} đã được dùng cho \"{1}\"", "{0} is already used for \"{1}\""),
    ("shortcut.unknown_action", "Không có thao tác: {0}", "Unknown action: {0}"),
    // Video export
    ("export.bad_range", "Khoảng cắt không hợp lệ ({0}s → {1}s)", "Invalid trim range ({0}s → {1}s)"),
    ("export.bad_speed", "Tốc độ phải trong khoảng {0}x–{1}x", "Speed must be between {0}x and {1}x"),
    ("export.bad_format", "Định dạng không hỗ trợ: {0}", "Unsupported format: {0}"),
    ("export.no_source", "Không tìm thấy file video gốc", "The original video file was not found"),
    ("export.same_path", "Nơi lưu phải khác file gốc", "Choose a different file than the original"),
    ("export.spawn_failed", "Không chạy được ffmpeg: {0}", "Could not start ffmpeg: {0}"),
    ("export.lost", "Tiến trình xuất đã mất", "The export process was lost"),
    ("export.ffmpeg_failed", "ffmpeg lỗi ({0}):\n{1}", "ffmpeg failed ({0}):\n{1}"),
    ("export.empty", "File xuất ra bị rỗng", "The exported file is empty"),
    ("ffmpeg.missing", "Chưa cài FFmpeg", "FFmpeg is not installed"),
    // Screens and ffmpeg setup
    ("screen.numbered", "Màn hình {0}", "Screen {0}"),
    ("screen.whole", "Toàn bộ màn hình", "Whole screen"),
    ("ffmpeg.appdata_failed", "Không thể tạo thư mục AppData: {0}", "Could not create the AppData folder: {0}"),
    ("ffmpeg.launch_failed", "Không chạy được trình cài đặt: {0}", "Could not start the installer: {0}"),
    ("ffmpeg.installed_win", "Đã cài FFmpeg thành công.", "FFmpeg was installed."),
    ("ffmpeg.install_failed", "Cài FFmpeg thất bại hoặc bị từ chối quyền:\n{0}\n{1}", "Installing FFmpeg failed or was denied:\n{0}\n{1}"),
    ("ffmpeg.no_brew", "Chưa cài Homebrew. Hãy cài Homebrew rồi chạy: brew install ffmpeg", "Homebrew is not installed. Install Homebrew, then run: brew install ffmpeg"),
    ("ffmpeg.brew_failed", "Không chạy được brew: {0}", "Could not run brew: {0}"),
    ("ffmpeg.installed_mac", "Đã tải và cài FFmpeg.", "FFmpeg was downloaded and set up."),
    ("ffmpeg.brew_install_failed", "Cài bằng brew thất bại. Hãy chạy trong Terminal: brew install ffmpeg", "brew install failed. Run in Terminal: brew install ffmpeg"),
];

/// Translate `key` into `lang`. An unknown key returns the key itself (visible in testing).
pub fn tr(lang: Lang, key: &str) -> &'static str {
    for (k, vi, en) in TABLE {
        if *k == key {
            return match lang {
                Lang::Vi => *vi,
                Lang::En => *en,
            };
        }
    }
    // Leak only in the unreachable case of a typo; tests guard every key used.
    Box::leak(key.to_string().into_boxed_str())
}

/// Translate and fill `{0}`, `{1}`, … placeholders.
pub fn trf(lang: Lang, key: &str, args: &[&dyn std::fmt::Display]) -> String {
    let mut s = tr(lang, key).to_string();
    for (i, a) in args.iter().enumerate() {
        s = s.replace(&format!("{{{i}}}"), &a.to_string());
    }
    s
}

/// The app's current language (from settings; Vietnamese if unknown).
pub fn current(app: &AppHandle) -> Lang {
    app.try_state::<SettingsState>()
        .map(|s| s.lang())
        .unwrap_or(Lang::Vi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_key_has_both_languages() {
        for (k, vi, en) in TABLE {
            assert!(!vi.trim().is_empty(), "missing vi for {k}");
            assert!(!en.trim().is_empty(), "missing en for {k}");
        }
    }

    #[test]
    fn keys_are_unique() {
        let mut keys: Vec<&str> = TABLE.iter().map(|t| t.0).collect();
        keys.sort();
        let n = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), n, "duplicate i18n key");
    }

    #[test]
    fn tray_labels_differ_and_placeholders_fill() {
        assert_ne!(tr(Lang::Vi, "tray.quit"), tr(Lang::En, "tray.quit"));
        assert_eq!(trf(Lang::En, "screen.numbered", &[&2]), "Screen 2");
        assert_eq!(trf(Lang::Vi, "shortcut.duplicate", &[&"Ctrl+1", &"Chụp vùng"]), "Ctrl+1 đã được dùng cho \"Chụp vùng\"");
    }

    #[test]
    fn parse_codes() {
        assert_eq!(Lang::parse("vi"), Some(Lang::Vi));
        assert_eq!(Lang::parse("en"), Some(Lang::En));
        assert_eq!(Lang::parse("fr"), None);
    }
}

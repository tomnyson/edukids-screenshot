// settings.rs — app settings persisted to <app_config_dir>/settings.json.
// Currently: the interface language ("vi" by default, or "en").

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};

use crate::i18n::Lang;

#[derive(Default, serde::Serialize, serde::Deserialize)]
struct SettingsFile {
    #[serde(default)]
    language: Option<String>,
}

pub struct SettingsState(Mutex<Lang>);

impl Default for SettingsState {
    fn default() -> Self {
        SettingsState(Mutex::new(Lang::Vi))
    }
}

impl SettingsState {
    pub fn lang(&self) -> Lang {
        self.0.lock().map(|l| *l).unwrap_or(Lang::Vi)
    }
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn read(app: &AppHandle) -> SettingsFile {
    path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write(app: &AppHandle, file: &SettingsFile) -> Result<(), String> {
    let p = path(app).ok_or("No config directory")?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, serde_json::to_string_pretty(file).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

/// Load the saved language into state (call once at startup, before the tray is built).
pub fn load(app: &AppHandle) {
    let lang = read(app).language.as_deref().and_then(Lang::parse).unwrap_or(Lang::Vi);
    if let Some(state) = app.try_state::<SettingsState>() {
        if let Ok(mut l) = state.0.lock() {
            *l = lang;
        }
    }
}

#[tauri::command]
pub fn get_language(state: tauri::State<'_, SettingsState>) -> String {
    state.lang().code().to_string()
}

/// Switch the interface language: save it, relabel the tray, tell every window.
#[tauri::command]
pub async fn set_language(app: AppHandle, lang: String) -> Result<String, String> {
    let parsed = Lang::parse(&lang).ok_or_else(|| format!("Unsupported language: {lang}"))?;
    {
        let state = app.state::<SettingsState>();
        let mut l = state.0.lock().map_err(|e| e.to_string())?;
        *l = parsed;
    }
    let mut file = read(&app);
    file.language = Some(parsed.code().to_string());
    write(&app, &file)?;
    crate::shortcuts::relabel_tray(&app);
    app.emit("language-changed", parsed.code()).ok();
    Ok(parsed.code().to_string())
}

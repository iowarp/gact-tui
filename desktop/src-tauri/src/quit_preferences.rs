//! The person's quit choices, kept across launches in the app's config folder.
//!
//! `close_relays_on_quit` backs the quit prompt's "Also close open relays" box. It is
//! on for a new install; the prompt saves the person's last answer, and the quit paths
//! with no prompt (tray, app menu, a quit with nothing running) follow it.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const PREFERENCES_FILE: &str = "quit-preferences.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct QuitPreferences {
    pub close_relays_on_quit: bool,
}

impl Default for QuitPreferences {
    fn default() -> Self {
        Self {
            close_relays_on_quit: true,
        }
    }
}

fn preferences_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(PREFERENCES_FILE))
}

fn read_from(path: &Path) -> QuitPreferences {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub(crate) fn load<R: Runtime>(app: &AppHandle<R>) -> QuitPreferences {
    preferences_path(app)
        .as_deref()
        .map(read_from)
        .unwrap_or_default()
}

pub(crate) fn save<R: Runtime>(app: &AppHandle<R>, preferences: QuitPreferences) {
    let Some(path) = preferences_path(app) else {
        return;
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let written = serde_json::to_string_pretty(&preferences)
        .map_err(|error| error.to_string())
        .and_then(|text| std::fs::write(&path, text).map_err(|error| error.to_string()));
    if let Err(error) = written {
        crate::supervisor_boot_log::boot_log_line(&format!(
            "quit preferences: could not save {}: {error}",
            path.display()
        ));
    }
}

/// What the quit prompt shows: the saved choice, and whether the local agent has relay
/// endpoints to close (`None` hides the "Also close open relays" box).
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuitPrompt {
    pub close_relays_on_quit: bool,
    pub relays: Option<crate::relay_lifecycle::RelayStatus>,
}

/// The saved quit choices and the local relay status, for the quit prompt's initial
/// state. Async so the short agent read never blocks the window.
#[tauri::command]
pub async fn quit_preferences(app: AppHandle) -> QuitPrompt {
    let close_relays_on_quit = load(&app).close_relays_on_quit;
    let relays = tauri::async_runtime::spawn_blocking(move || {
        let state = app.try_state::<std::sync::Mutex<crate::supervisor::Supervisor>>()?;
        let handle = crate::supervisor_state::lock_recover(&state).snapshot();
        crate::relay_lifecycle::relay_status(&handle.url, &handle.bearer_token)
    })
    .await
    .ok()
    .flatten();
    QuitPrompt {
        close_relays_on_quit,
        relays,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_install_closes_relays() {
        let missing = std::env::temp_dir().join("clio-quit-preferences-missing.json");
        let _ = std::fs::remove_file(&missing);
        assert!(read_from(&missing).close_relays_on_quit);
    }

    #[test]
    fn a_saved_choice_is_read_back() {
        let preferences: QuitPreferences =
            serde_json::from_str("{\"closeRelaysOnQuit\":false}").unwrap();
        assert!(!preferences.close_relays_on_quit);
        let unknown: QuitPreferences = serde_json::from_str("{}").unwrap();
        assert!(unknown.close_relays_on_quit);
    }
}

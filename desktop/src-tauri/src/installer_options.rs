use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const INSTALLER_OPTIONS_FILE: &str = "installer-options.json";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct InstallerOptions {
    pub version: u8,
    pub web_search: bool,
    pub web_search_status: String,
}

impl Default for InstallerOptions {
    fn default() -> Self {
        Self {
            version: 1,
            web_search: false,
            web_search_status: "not_requested".into(),
        }
    }
}

fn options_path(root: &Path) -> PathBuf {
    root.join(INSTALLER_OPTIONS_FILE)
}

fn read_options(root: &Path) -> Result<InstallerOptions, String> {
    let path = options_path(root);
    if !path.exists() {
        return Ok(InstallerOptions::default());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read installer choices: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Installer choices are not valid: {error}"))
}

fn write_options(root: &Path, options: &InstallerOptions) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("Could not prepare desktop settings: {error}"))?;
    let path = options_path(root);
    let temporary = root.join(format!("{INSTALLER_OPTIONS_FILE}.tmp"));
    let contents = serde_json::to_vec_pretty(options)
        .map_err(|error| format!("Could not encode installer choices: {error}"))?;
    fs::write(&temporary, contents)
        .map_err(|error| format!("Could not save installer choices: {error}"))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace installer choices: {error}"))?;
    }
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Could not finalize installer choices: {error}"))
}

fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not locate desktop settings: {error}"))
}

/// Read the optional infrastructure choices recorded by the desktop installer.
#[tauri::command]
pub fn read_installer_options(app: tauri::AppHandle) -> Result<InstallerOptions, String> {
    read_options(&app_data_root(&app)?)
}

/// Mark the install-selected Web Search setup as registered with CLIO.
#[tauri::command]
pub fn complete_installer_web_search(app: tauri::AppHandle) -> Result<(), String> {
    let root = app_data_root(&app)?;
    let mut options = read_options(&root)?;
    if !options.web_search {
        return Err("Web Search was not selected during installation.".into());
    }
    options.web_search_status = "configured".into();
    write_options(&root, &options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("clio-installer-options-{suffix}"))
    }

    #[test]
    fn missing_installer_options_are_not_requested() {
        let root = test_root();
        assert_eq!(read_options(&root).unwrap(), InstallerOptions::default());
    }

    #[test]
    fn installer_options_round_trip_without_losing_selection() {
        let root = test_root();
        let options = InstallerOptions {
            version: 1,
            web_search: true,
            web_search_status: "deployed".into(),
        };
        write_options(&root, &options).unwrap();
        assert_eq!(read_options(&root).unwrap(), options);
        let configured = InstallerOptions {
            web_search_status: "configured".into(),
            ..options
        };
        write_options(&root, &configured).unwrap();
        assert_eq!(read_options(&root).unwrap(), configured);
        let _ = fs::remove_dir_all(root);
    }
}

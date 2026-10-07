//! Named Office applications discovered locally, independently of file associations.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DocumentApplication {
    Word,
    Powerpoint,
    Excel,
}

impl DocumentApplication {
    fn accepts(self, path: &Path) -> bool {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        match self {
            Self::Word => ["docx", "doc", "odt", "rtf"].contains(&extension.as_str()),
            Self::Powerpoint => ["pptx", "ppt", "odp"].contains(&extension.as_str()),
            Self::Excel => ["xlsx", "xls", "ods"].contains(&extension.as_str()),
        }
    }

    #[cfg(target_os = "windows")]
    fn executable(self) -> &'static str {
        match self {
            Self::Word => "WINWORD.EXE",
            Self::Powerpoint => "POWERPNT.EXE",
            Self::Excel => "EXCEL.EXE",
        }
    }

    #[cfg(target_os = "macos")]
    fn bundle(self) -> &'static str {
        match self {
            Self::Word => "Microsoft Word.app",
            Self::Powerpoint => "Microsoft PowerPoint.app",
            Self::Excel => "Microsoft Excel.app",
        }
    }
}

#[cfg(target_os = "windows")]
fn installed_path(application: DocumentApplication) -> Option<PathBuf> {
    use winreg::enums::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };
    use winreg::RegKey;
    let key_path = format!(
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{}",
        application.executable()
    );
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            if let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(&key_path, KEY_READ | view)
            {
                if let Ok(value) = key.get_value::<String, _>("") {
                    let path = PathBuf::from(value.trim().trim_matches('"'));
                    if path.is_file() {
                        return Some(path);
                    }
                }
            }
        }
    }
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            for folder in [
                "Microsoft Office/root/Office16",
                "Microsoft Office/Office16",
            ] {
                let path = PathBuf::from(&root)
                    .join(folder)
                    .join(application.executable());
                if path.is_file() {
                    return Some(path);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn installed_path(application: DocumentApplication) -> Option<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }
    roots
        .into_iter()
        .map(|root| root.join(application.bundle()))
        .find(|path| path.is_dir())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn installed_path(_application: DocumentApplication) -> Option<PathBuf> {
    None
}

/// Discover supported editors without invoking their executable or shell associations.
#[tauri::command]
pub fn document_applications() -> Vec<DocumentApplication> {
    [
        DocumentApplication::Word,
        DocumentApplication::Powerpoint,
        DocumentApplication::Excel,
    ]
    .into_iter()
    .filter(|application| installed_path(*application).is_some())
    .collect()
}

/// Resolve the app again at launch; the caller cannot supply an executable or arguments.
pub fn open_in(application: DocumentApplication, path: &Path) -> Result<(), String> {
    if !application.accepts(path) {
        return Err("This document type does not match the selected application.".into());
    }
    let installed =
        installed_path(application).ok_or("The selected application is no longer installed.")?;
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-a").arg(installed);
        command
    };
    #[cfg(not(target_os = "macos"))]
    let mut command = Command::new(installed);
    command
        .arg(path)
        .spawn()
        .map_err(|error| format!("Could not open the selected application: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_selection_rejects_mismatched_document_types() {
        assert!(DocumentApplication::Word.accepts(Path::new("report.DOCX")));
        assert!(DocumentApplication::Powerpoint.accepts(Path::new("briefing.pptx")));
        assert!(DocumentApplication::Excel.accepts(Path::new("data.xlsx")));
        assert!(!DocumentApplication::Word.accepts(Path::new("briefing.pptx")));
        assert!(!DocumentApplication::Powerpoint.accepts(Path::new("report.pdf")));
        assert!(open_in(DocumentApplication::Word, Path::new("command.exe")).is_err());
    }
}

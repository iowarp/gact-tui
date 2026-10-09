//! Discover file handlers from the desktop's associations, never from an Office allowlist.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::path::Path;
use tauri::Manager;
#[cfg(target_os = "windows")]
#[path = "document_apps_windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "document_apps_macos.rs"]
mod platform;
#[cfg(target_os = "linux")]
#[path = "document_apps_linux.rs"]
mod platform;

/// A named handler registered with the operating system for a file type.
#[derive(Clone, Debug, Serialize)]
pub struct DocumentApplication {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_data_url: Option<String>,
}

/// Read associations off the UI thread without launching an application.
#[tauri::command]
pub async fn document_applications(
    app: tauri::AppHandle,
    name: String,
    mime_type: String,
) -> Result<Vec<DocumentApplication>, String> {
    let applications =
        crate::blocking_command::off_main(move || discover(&name, &mime_type)).await?;
    #[cfg(target_os = "linux")]
    return Ok(platform::attach_icons(app, applications).await);
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Ok(applications)
    }
}

/// Keep app icons local, raster-only and bounded; missing icons do not hide valid handlers.
fn png_data_url(bytes: &[u8]) -> Option<String> {
    if bytes.len() > 2 * 1024 * 1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return None;
    }
    Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

/// Return unique named handlers, with the operating system's default first.
pub(crate) fn discover(name: &str, mime_type: &str) -> Result<Vec<DocumentApplication>, String> {
    let extension = extension(name)?;
    let mut applications = platform::discover(&extension, mime_type)?;
    applications.retain(|app| !app.id.is_empty() && !app.name.trim().is_empty());
    applications.sort_by_key(|app| (!app.is_default, app.name.to_lowercase(), app.id.clone()));
    let mut ids = std::collections::HashSet::new();
    applications.retain(|app| ids.insert(app.id.clone()));
    Ok(applications)
}

/// Only invoke a handler rediscovered for this exact extension at launch time.
pub fn open_in(application: &str, path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err("The file is no longer available.".into());
    }
    let extension = extension(&path.to_string_lossy())?;
    platform::open_in(application, path, &extension)
}

/// Materialize an uploaded or remote file on this desktop before invoking its handler.
#[tauri::command]
pub async fn open_file_bytes(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
    application: String,
) -> Result<String, String> {
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    crate::blocking_command::off_main(move || {
        let path = stage_file(&root, &name, &bytes)?;
        if let Err(error) = open_in(&application, &path) {
            let _ = std::fs::remove_file(&path);
            if let Some(parent) = path.parent() {
                let _ = std::fs::remove_dir(parent);
            }
            return Err(error);
        }
        Ok(path.display().to_string())
    })
    .await
}

fn stage_file(root: &Path, name: &str, bytes: &[u8]) -> Result<std::path::PathBuf, String> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', ':', '\0']) {
        return Err("Opening a file requires a plain filename.".into());
    }
    let directory = root
        .join("open-in")
        .join(format!("{:016x}", rand::random::<u64>()));
    std::fs::create_dir_all(root.join("open-in"))
        .and_then(|_| std::fs::create_dir(&directory))
        .map_err(|error| format!("Prepare the desktop copy: {error}"))?;
    let file = directory.join(name);
    if let Err(error) = std::fs::write(&file, bytes) {
        let _ = std::fs::remove_dir(&directory);
        return Err(format!("Save the desktop copy: {error}"));
    }
    Ok(file)
}

fn extension(name: &str) -> Result<String, String> {
    if name.contains('\0') {
        return Err("The filename contains a null character.".into());
    }
    // A service can use another OS's path separator. Only the suffix is used for lookup.
    let filename = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let suffix = filename
        .rsplit_once('.')
        .map(|(_, suffix)| suffix)
        .unwrap_or("");
    if suffix.len() > 64 || suffix.chars().any(|ch| ch.is_control()) {
        return Err("The file extension is invalid.".into());
    }
    Ok(suffix.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icon_payloads_are_local_raster_images_with_a_bounded_size() {
        assert!(png_data_url(b"<svg/>").is_none());
        assert!(png_data_url(&vec![0; 2 * 1024 * 1024 + 1]).is_none());
        let png = b"\x89PNG\r\n\x1a\nicon";
        let encoded = png_data_url(png).unwrap();
        assert_eq!(
            STANDARD.decode(encoded.split_once(',').unwrap().1).unwrap(),
            png
        );
    }

    #[test]
    fn staged_copy_preserves_bytes_and_confines_names() {
        let root =
            std::env::temp_dir().join(format!("clio-staging-{:016x}", rand::random::<u64>()));
        for bad in ["../outside.txt", "C:\\outside.txt", "a/b.txt", "..", ""] {
            assert!(stage_file(&root, bad, b"content").is_err());
        }
        let file = stage_file(&root, "plot.png", b"\0image bytes\xff").unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), b"\0image bytes\xff");
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_dir(file.parent().unwrap()).unwrap();
        std::fs::remove_dir(root.join("open-in")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn resolves_the_original_suffix_on_either_os() {
        assert_eq!(extension("C:\\reports\\slide.PPTX").unwrap(), "pptx");
        assert_eq!(extension("/reports/plot.SVG").unwrap(), "svg");
        assert_eq!(extension("a.b.pdf").unwrap(), "pdf");
        assert_eq!(extension("README").unwrap(), "");
        assert!(extension("bad\0.pdf").is_err());
    }
    #[test]
    fn caller_cannot_supply_an_arbitrary_program() {
        let path =
            std::env::temp_dir().join(format!("clio-association-{}.txt", rand::random::<u64>()));
        std::fs::write(&path, "association test").unwrap();
        let result = open_in("unregistered-program-with-arguments", &path);
        std::fs::remove_file(path).unwrap();
        assert!(result.is_err());
    }
    #[test]
    fn actual_desktop_discovery_is_sorted_and_unique() {
        for name in [
            "notes.md",
            "page.html",
            "document.pdf",
            "image.png",
            "table.csv",
        ] {
            let apps = discover(name, "").unwrap();
            let mut ids = std::collections::HashSet::new();
            for app in &apps {
                assert!(!app.name.trim().is_empty());
                assert!(ids.insert(&app.id));
            }
            assert!(!apps
                .windows(2)
                .any(|pair| !pair[0].is_default && pair[1].is_default));
        }
    }
}

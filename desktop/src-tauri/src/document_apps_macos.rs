//! NSWorkspace resolves Launch Services handlers and the user's preferred app.
use super::DocumentApplication;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSFileManager, NSString, NSURL};
use std::{path::Path, process::Command};
struct Probe(std::path::PathBuf, std::path::PathBuf);
impl Drop for Probe {
    fn drop(&mut self) {
        // Remove only the unique file and directory created by this lookup.
        let _ = std::fs::remove_file(&self.1);
        let _ = std::fs::remove_dir(&self.0);
    }
}
pub(super) fn discover(
    extension: &str,
    _mime_type: &str,
) -> Result<Vec<DocumentApplication>, String> {
    let directory =
        std::env::temp_dir().join(format!("clio-associations-{:016x}", rand::random::<u64>()));
    std::fs::create_dir(&directory)
        .map_err(|error| format!("Prepare association lookup: {error}"))?;
    let file = directory.join(format!("file.{extension}"));
    let _probe = Probe(directory, file.clone());
    // Finder requires a real URL. This empty file exists only during the lookup.
    std::fs::write(&file, []).map_err(|error| format!("Prepare association lookup: {error}"))?;
    Ok(objc2::rc::autoreleasepool(|_| {
        let workspace = NSWorkspace::sharedWorkspace();
        let url = NSURL::fileURLWithPath(&NSString::from_str(&file.to_string_lossy()));
        let default = workspace
            .URLForApplicationToOpenURL(&url)
            .and_then(|app| app.path());
        workspace
            .URLsForApplicationsToOpenURL(&url)
            .iter()
            .filter_map(|app| app.path())
            .map(|path| {
                let name = NSFileManager::defaultManager()
                    .displayNameAtPath(&path)
                    .to_string();
                DocumentApplication {
                    is_default: default.as_ref().map(|value| value.to_string())
                        == Some(path.to_string()),
                    id: path.to_string(),
                    name: name.trim_end_matches(".app").to_string(),
                }
            })
            .collect()
    }))
}
pub(super) fn open_in(id: &str, path: &Path, extension: &str) -> Result<(), String> {
    if !discover(extension, "")?.iter().any(|app| app.id == id) {
        return Err("This app is no longer associated with this file type.".into());
    }
    let status = Command::new("/usr/bin/open")
        .arg("-a")
        .arg(id)
        .arg(path)
        .status()
        .map_err(|error| format!("Open the selected app: {error}"))?;
    if !status.success() {
        return Err(format!(
            "The selected app could not open the file ({status})."
        ));
    }
    Ok(())
}

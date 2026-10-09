//! NSWorkspace resolves Launch Services handlers and the user's preferred app.
use super::DocumentApplication;
use objc2::AnyThread;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
use objc2_foundation::{NSDictionary, NSFileManager, NSString, NSURL};
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
                    icon_data_url: application_icon(&workspace, &path),
                    is_default: default.as_ref().map(|value| value.to_string())
                        == Some(path.to_string()),
                    id: path.to_string(),
                    name: name.trim_end_matches(".app").to_string(),
                }
            })
            .collect()
    }))
}

fn application_icon(workspace: &NSWorkspace, path: &NSString) -> Option<String> {
    let tiff = workspace.iconForFile(path).TIFFRepresentation()?;
    let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)?;
    // An empty dictionary is valid for PNG encoding and carries no untyped properties.
    let png = unsafe {
        bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }?;
    super::png_data_url(&png.to_vec())
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

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    #[test]
    fn reads_the_installed_finder_icon_as_a_png() {
        let finder = "/System/Library/CoreServices/Finder.app";
        assert!(Path::new(finder).is_dir());
        objc2::rc::autoreleasepool(|_| {
            let icon =
                application_icon(&NSWorkspace::sharedWorkspace(), &NSString::from_str(finder))
                    .expect("the installed Finder application has a native icon");
            let png = STANDARD.decode(icon.split_once(',').unwrap().1).unwrap();
            assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
            assert_eq!(&png[12..16], b"IHDR");
            assert!(u32::from_be_bytes(png[16..20].try_into().unwrap()) > 0);
            assert!(u32::from_be_bytes(png[20..24].try_into().unwrap()) > 0);
        });
    }
}

//! Offer to move the app into Applications when macOS runs it from a
//! temporary place.
//!
//! A quarantined app opened straight from Downloads is run by Gatekeeper
//! from a randomized, read-only App Translocation mount, and an app opened
//! from its disk image runs from the read-only DMG volume. Both work for one
//! launch but break updates, Dock pinning and login items, and the
//! translocated path changes on every launch. When either is detected the
//! desktop offers one-click "Move to Applications", then relaunches the
//! moved copy.
//!
//! The manual fix, documented in `DESKTOP-AUTOUPDATE.md`, is to drag the app
//! into Applications, or to run `xattr -dr com.apple.quarantine` on it.

use std::path::{Path, PathBuf};

/// Where the running app bundle lives.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LaunchLocation {
    /// A normal, writable install location.
    Installed,
    /// Gatekeeper's randomized App Translocation mount.
    Translocated,
    /// A read-only mounted volume such as the installer disk image.
    DiskImage,
}

/// The `.app` bundle that contains the running executable
/// (`<name>.app/Contents/MacOS/<binary>`), or `None` for a bare binary such
/// as a `tauri dev` build.
pub(crate) fn app_bundle_of(exe: &Path) -> Option<PathBuf> {
    exe.ancestors()
        .skip(1)
        .find(|p| p.extension().is_some_and(|ext| ext == "app"))
        .map(Path::to_path_buf)
}

/// Classify a bundle path. `parent_writable` tells a read-only disk image
/// apart from an app kept on a writable external drive under `/Volumes`.
pub(crate) fn classify(bundle: &Path, parent_writable: bool) -> LaunchLocation {
    let text = bundle.to_string_lossy();
    if text.contains("/AppTranslocation/") {
        LaunchLocation::Translocated
    } else if bundle.starts_with("/Volumes") && !parent_writable {
        LaunchLocation::DiskImage
    } else {
        LaunchLocation::Installed
    }
}

/// `/Applications` when this user can write to it, otherwise the per-user
/// `~/Applications` folder (standard, non-admin accounts).
pub(crate) fn destination_dir(applications_writable: bool, home: &Path) -> PathBuf {
    if applications_writable {
        PathBuf::from("/Applications")
    } else {
        home.join("Applications")
    }
}

pub(crate) fn prompt_title(app_name: &str) -> String {
    format!("Move {app_name} to Applications?")
}

pub(crate) fn prompt_message(app_name: &str, location: LaunchLocation, dest_dir: &Path) -> String {
    let source = match location {
        LaunchLocation::DiskImage => "from its disk image",
        _ => "from a temporary location macOS uses for downloaded apps",
    };
    format!(
        "{app_name} is running {source}, so it cannot update itself or keep its \
         place in the Dock.\n\nMove it to {} now? {app_name} will reopen from there.",
        dest_dir.display()
    )
}

pub(crate) fn move_failed_message(app_name: &str, dest_dir: &Path, error: &str) -> String {
    format!(
        "{app_name} could not be moved to {}: {error}\n\nQuit {app_name}, drag it \
         into Applications in Finder, then open it from there.",
        dest_dir.display()
    )
}

/// Hidden sibling names used while swapping the bundle into place, so a
/// failed copy never leaves a half-written app under the real name.
fn sibling(dest_dir: &Path, name: &str, tag: &str) -> PathBuf {
    dest_dir.join(format!(".{name}.{tag}-{}", std::process::id()))
}

#[cfg(target_os = "macos")]
fn is_writable(path: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    let Ok(c_path) = std::ffi::CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    // SAFETY: `c_path` is a valid NUL-terminated string for the call.
    unsafe { libc::access(c_path.as_ptr(), libc::W_OK) == 0 }
}

#[cfg(target_os = "macos")]
fn run(program: &str, args: &[&std::ffi::OsStr]) -> Result<(), String> {
    let output = std::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|error| format!("{program}: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "{program} failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

/// Copy `source` into `dest_dir`, replacing an older copy, and clear the
/// quarantine flag so the moved app is not translocated again. Returns the
/// installed bundle path.
#[cfg(target_os = "macos")]
fn move_bundle(source: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    use std::fs;
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("the app bundle has no name")?
        .to_owned();
    fs::create_dir_all(dest_dir).map_err(|error| error.to_string())?;
    let dest = dest_dir.join(&name);
    let staging = sibling(dest_dir, &name, "moving");
    let backup = sibling(dest_dir, &name, "replaced");
    let _ = fs::remove_dir_all(&staging);

    if let Err(error) = run("/usr/bin/ditto", &[source.as_os_str(), staging.as_os_str()]) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let replaced = dest.exists();
    if replaced {
        if let Err(error) = fs::rename(&dest, &backup) {
            let _ = fs::remove_dir_all(&staging);
            return Err(format!("could not replace the existing copy: {error}"));
        }
    }
    if let Err(error) = fs::rename(&staging, &dest) {
        if replaced {
            let _ = fs::rename(&backup, &dest);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(error.to_string());
    }
    if replaced {
        let _ = fs::remove_dir_all(&backup);
    }
    let _ = run(
        "/usr/bin/xattr",
        &[
            std::ffi::OsStr::new("-dr"),
            std::ffi::OsStr::new("com.apple.quarantine"),
            dest.as_os_str(),
        ],
    );
    Ok(dest)
}

/// Reopen `dest` once this process has exited, so the new copy does not run
/// into the single-instance guard.
#[cfg(target_os = "macos")]
fn relaunch_after_exit(dest: &Path) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(r#"while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open "$2""#)
        .arg("sh")
        .arg(std::process::id().to_string())
        .arg(dest)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0)
        .spawn()
        .map(|_| ())
}

/// Check where the app runs from and, when it is translocated or on its disk
/// image, ask (without blocking startup) to move it into Applications.
#[cfg(target_os = "macos")]
pub(crate) fn offer_move_to_applications<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let Some(source) = std::env::current_exe()
        .ok()
        .as_deref()
        .and_then(app_bundle_of)
    else {
        return;
    };
    let parent_writable = source.parent().is_some_and(is_writable);
    let location = classify(&source, parent_writable);
    if location == LaunchLocation::Installed {
        return;
    }
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return;
    };
    let dest_dir = destination_dir(is_writable(Path::new("/Applications")), &home);
    crate::supervisor_boot_log::boot_log_line(&format!(
        "app location: {location:?} at {}; offering to move it to {}",
        source.display(),
        dest_dir.display()
    ));

    let app_name = crate::menu::native_app_name(app);
    let handle = app.clone();
    app.dialog()
        .message(prompt_message(&app_name, location, &dest_dir))
        .title(prompt_title(&app_name))
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Move to Applications".into(),
            "Not Now".into(),
        ))
        .show(move |accepted| {
            if !accepted {
                return;
            }
            std::thread::spawn(move || {
                let outcome = move_bundle(&source, &dest_dir).and_then(|dest| {
                    relaunch_after_exit(&dest)
                        .map(|()| dest)
                        .map_err(|error| format!("could not reopen the moved app: {error}"))
                });
                match outcome {
                    Ok(dest) => {
                        crate::supervisor_boot_log::boot_log_line(&format!(
                            "app location: moved to {}; relaunching",
                            dest.display()
                        ));
                        crate::request_quit(&handle);
                    }
                    Err(error) => {
                        crate::supervisor_boot_log::boot_log_line(&format!(
                            "app location: move failed: {error}"
                        ));
                        handle
                            .dialog()
                            .message(move_failed_message(&app_name, &dest_dir, &error))
                            .title(prompt_title(&app_name))
                            .kind(MessageDialogKind::Warning)
                            .show(|_| {});
                    }
                }
            });
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_enclosing_app_bundle() {
        let exe = Path::new("/Applications/CLIO Desktop.app/Contents/MacOS/clio-desktop");
        assert_eq!(
            app_bundle_of(exe),
            Some(PathBuf::from("/Applications/CLIO Desktop.app"))
        );
        assert_eq!(app_bundle_of(Path::new("/repo/target/debug/gact-desktop")), None);
    }

    #[test]
    fn detects_translocation_and_disk_images() {
        let translocated = Path::new(
            "/private/var/folders/xy/T/AppTranslocation/1A2B-3C4D/d/CLIO Desktop.app",
        );
        assert_eq!(classify(translocated, false), LaunchLocation::Translocated);
        assert_eq!(classify(translocated, true), LaunchLocation::Translocated);

        let dmg = Path::new("/Volumes/CLIO Desktop/CLIO Desktop.app");
        assert_eq!(classify(dmg, false), LaunchLocation::DiskImage);
        assert_eq!(
            classify(dmg, true),
            LaunchLocation::Installed,
            "an app kept on a writable external drive is a real install"
        );

        assert_eq!(
            classify(Path::new("/Applications/CLIO Desktop.app"), true),
            LaunchLocation::Installed
        );
        assert_eq!(
            classify(Path::new("/Users/me/Applications/CLIO Desktop.app"), true),
            LaunchLocation::Installed
        );
        assert_eq!(
            classify(Path::new("/Users/me/Downloads/CLIO Desktop.app"), true),
            LaunchLocation::Installed,
            "an unquarantined copy in Downloads is not translocated"
        );
    }

    #[test]
    fn standard_users_install_into_their_own_applications_folder() {
        let home = Path::new("/Users/me");
        assert_eq!(destination_dir(true, home), PathBuf::from("/Applications"));
        assert_eq!(
            destination_dir(false, home),
            PathBuf::from("/Users/me/Applications")
        );
    }

    #[test]
    fn prompt_copy_names_the_product_and_destination() {
        let dest = Path::new("/Applications");
        let message = prompt_message("CLIO", LaunchLocation::DiskImage, dest);
        assert!(message.starts_with("CLIO is running from its disk image,"));
        assert!(message.contains("/Applications"));
        assert!(prompt_message("GACT", LaunchLocation::Translocated, dest)
            .contains("temporary location"));
        assert_eq!(prompt_title("CLIO"), "Move CLIO to Applications?");
        assert!(move_failed_message("CLIO", dest, "denied").contains("drag it into Applications"));
    }

    #[test]
    fn staging_names_are_hidden_siblings() {
        let staging = sibling(Path::new("/Applications"), "CLIO.app", "moving");
        assert_eq!(staging.parent(), Some(Path::new("/Applications")));
        let name = staging.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with(".CLIO.app.moving-"));
    }
}

//! The host environment for processes the desktop starts.
//!
//! An AppImage's AppRun (linuxdeploy and its GTK plugin) points `LD_LIBRARY_PATH`,
//! `PYTHONHOME`, `PYTHONPATH`, `PATH`, `XDG_DATA_DIRS`, `GIO_EXTRA_MODULES` and a dozen
//! more at the image, which the WebKit shell needs. A host program started with them
//! loads the image's libraries instead of its own: the host `curl` fails with
//! `symbol lookup error ... libcurl.so.4: undefined symbol: nghttp2_...` (so the
//! first-run `curl … | bash` installer fetched nothing), and any Python reads the
//! image as its home. Each child therefore gets every variable with the image's
//! entries removed, and loses a variable that named only the image. Outside an
//! AppImage (`APPDIR` unset) nothing changes.

use std::ffi::{OsStr, OsString};
use std::path::Path;
use std::process::Command;

/// Locations, not search paths: kept as they are even when they lie in the image.
const KEEP: [&str; 6] = ["HOME", "PWD", "OLDPWD", "OWD", "APPIMAGE", "ARGV0"];

/// The value of a path-list variable without the entries under `appdir`, or `None`
/// when it named only the image (the variable is then removed).
fn without_image(value: &OsStr, appdir: &Path) -> Option<OsString> {
    let kept: Vec<_> = std::env::split_paths(value)
        .filter(|entry| !entry.as_os_str().is_empty() && !entry.starts_with(appdir))
        .collect();
    if kept.is_empty() {
        return None;
    }
    std::env::join_paths(kept).ok()
}

/// The variables whose value must change for a host child, from `vars` and the
/// image root `appdir`: `(name, Some(value))` to set, `(name, None)` to remove.
fn host_overrides(
    vars: impl IntoIterator<Item = (OsString, OsString)>,
    appdir: &Path,
) -> Vec<(OsString, Option<OsString>)> {
    vars.into_iter()
        .filter(|(name, _)| !KEEP.iter().any(|keep| name == keep))
        .filter(|(_, value)| std::env::split_paths(value).any(|entry| entry.starts_with(appdir)))
        .map(|(name, value)| {
            let host = without_image(&value, appdir);
            (name, host)
        })
        .collect()
}

/// Start `command` with the host's environment rather than the AppImage's.
pub(crate) fn for_host(command: &mut Command) -> &mut Command {
    let Some(appdir) = std::env::var_os("APPDIR").filter(|dir| !dir.is_empty()) else {
        return command;
    };
    let appdir = Path::new(&appdir);
    if !appdir.is_absolute() {
        return command;
    }
    for (name, value) in host_overrides(std::env::vars_os(), appdir) {
        match value {
            Some(value) => command.env(name, value),
            None => command.env_remove(name),
        };
    }
    command
}

// AppImages are Linux-only, and these values use the Unix `:` list separator.
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn strips_image_entries_and_drops_image_only_variables() {
        let image = Path::new("/tmp/appimage_extracted_x");
        let vars = vec![
            (
                "PATH".into(),
                "/tmp/appimage_extracted_x/usr/bin:/usr/bin:/bin".into(),
            ),
            (
                "LD_LIBRARY_PATH".into(),
                "/tmp/appimage_extracted_x/usr/lib/:".into(),
            ),
            ("PYTHONHOME".into(), "/tmp/appimage_extracted_x/usr/".into()),
            ("HOME".into(), "/tmp/appimage_extracted_x/../home".into()),
        ];
        let mut got = host_overrides(vars, image);
        got.sort();
        assert_eq!(
            got,
            vec![
                (OsString::from("LD_LIBRARY_PATH"), None),
                (
                    OsString::from("PATH"),
                    Some(OsString::from("/usr/bin:/bin"))
                ),
                (OsString::from("PYTHONHOME"), None),
            ]
        );
    }
}

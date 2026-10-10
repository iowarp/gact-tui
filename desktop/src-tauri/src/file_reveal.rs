//! Reveal only a caller-validated local file in the operating system's file manager.
#[cfg(windows)]
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::{path::Path, process::Command};

pub(crate) fn reveal_in_os(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Err("The file is no longer available.".into());
    }
    #[cfg(windows)]
    {
        // Explorer returns exit code 1 even on success; report a failure to launch it.
        Command::new("explorer")
            .arg(format!("/select,{}", shell_path(path).display()))
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Open the containing folder: {error}"))
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Open the containing folder: {error}"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path.parent().unwrap_or(path))
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Open the containing folder: {error}"))
    }
    #[cfg(not(any(windows, unix)))]
    {
        Err("Opening folders is unsupported on this platform.".into())
    }
}

#[cfg(windows)]
pub(crate) fn shell_path(path: &Path) -> std::path::PathBuf {
    // Shell parsing needs DOS/UNC paths, not Rust's verbatim canonical prefixes.
    // Normalize separators without losing non-ASCII Windows filenames.
    let mut units: Vec<_> = path
        .as_os_str()
        .encode_wide()
        .map(|unit| {
            if unit == b'/' as u16 {
                b'\\' as u16
            } else {
                unit
            }
        })
        .collect();
    let prefix: Vec<_> = "\\\\?\\".encode_utf16().collect();
    if units.starts_with(&prefix) {
        units.drain(..prefix.len());
        let unc: Vec<_> = "UNC\\".encode_utf16().collect();
        if units.starts_with(&unc) {
            units.splice(..unc.len(), "\\\\".encode_utf16());
        }
    }
    std::ffi::OsString::from_wide(&units).into()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn missing_files_are_reported_without_launching_explorer() {
        let absent =
            std::env::temp_dir().join(format!("clio-absent-{:016x}.html", rand::random::<u64>()));
        assert_eq!(
            reveal_in_os(&absent).unwrap_err(),
            "The file is no longer available."
        );
    }
    #[test]
    fn shell_paths_preserve_unicode_and_normalize_dos_and_unc_names() {
        for (source, expected) in [
            ("C:/reports/café.html", "C:\\reports\\café.html"),
            (r"\\?\C:\reports\raccoon.html", r"C:\reports\raccoon.html"),
            (
                r"\\?\UNC\server\share\raccoon.html",
                r"\\server\share\raccoon.html",
            ),
        ] {
            assert_eq!(shell_path(Path::new(source)).to_string_lossy(), expected);
        }
    }
}

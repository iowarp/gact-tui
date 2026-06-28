//! "Reveal boot log in the OS file manager" action.
//!
//! Backs the boot-failure card's "Open logs" button: locates the
//! persisted boot log and highlights it in Explorer/Finder/`xdg-open`.

use std::{
    path::{Path, PathBuf},
    process::Command,
};

use crate::supervisor_boot_log::boot_log_path;

/// Reveal the persisted boot log in the OS file manager so the user can
/// open it in their default viewer.
pub fn open_boot_log() -> Result<PathBuf, String> {
    let path = boot_log_path().ok_or_else(|| "boot log path is not initialized".to_string())?;
    if !path.is_file() {
        return Err(format!("boot log not found at {}", path.display()));
    }
    reveal_in_os(&path).map(|()| path)
}

/// Best-effort "reveal this file in the OS file manager" across the three
/// desktop platforms. On Windows `explorer /select,` highlights the file;
/// on macOS `open -R` does the same; on Linux there is no portable select,
/// so we open the containing directory with `xdg-open`.
fn reveal_in_os(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        // explorer.exe returns exit code 1 even on success, so spawn failure is
        // the only real error.
        Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("explorer: {e}"))
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("open -R: {e}"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = path.parent().unwrap_or(path);
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("xdg-open: {e}"))
    }
    #[cfg(not(any(windows, target_os = "macos", all(unix, not(target_os = "macos")))))]
    {
        let _ = path;
        Err("reveal-in-OS is unsupported on this platform".to_string())
    }
}

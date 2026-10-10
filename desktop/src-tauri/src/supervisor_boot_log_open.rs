//! "Reveal boot log in the OS file manager" action.
//!
//! Backs the boot-failure card's "Open logs" button: locates the
//! persisted boot log and highlights it in Explorer/Finder/`xdg-open`.

use crate::file_reveal::reveal_in_os;
use std::path::PathBuf;

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

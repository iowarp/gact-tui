//! Persisted boot-log transcript shared across the lifecycle.
//!
//! Captures each boot/install/repair attempt to a single truncate-on-start
//! file so a boot failure's "Open logs" reveals only the latest run; the
//! supervisor's `AppHandle`-less worker threads append through it.

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::Mutex,
};
use tauri::AppHandle;

/// Filename of the persisted boot log under the app log dir. The
/// boot-failure card's "Open logs" button reveals THIS file. It is
/// truncated at the start of every boot/install/repair so it always
/// reflects the most recent attempt (not an ever-growing transcript).
const BOOT_LOG_FILENAME: &str = "backend-boot.log";

/// Process-wide path of the persisted boot log. Set once at startup by
/// [`init_boot_log`] (which has the `AppHandle` needed to resolve the OS
/// log dir) and read by the streaming/spawn paths — which run on worker
/// threads with no `AppHandle` in scope. `None` until init runs (e.g. in
/// unit tests that never call `init_boot_log`), in which case logging is a
/// silent no-op rather than a panic.
static BOOT_LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Resolve + remember the persisted boot-log path from the Tauri app log
/// dir, creating the directory if needed. Called once during `setup` so the
/// supervisor's worker threads (which hold no `AppHandle`) can append to it
/// via [`boot_log_line`] / [`open_boot_log`]. Returns the resolved path so
/// the caller can log it. Best-effort: a failure to create the dir leaves
/// the path unset (logging no-ops) rather than blocking boot.
pub fn init_boot_log<R: tauri::Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    use tauri::Manager;
    let dir = app.path().app_log_dir().ok()?;
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    let path = dir.join(BOOT_LOG_FILENAME);
    if let Ok(mut g) = BOOT_LOG_PATH.lock() {
        *g = Some(path.clone());
    }
    Some(path)
}

/// The persisted boot-log path, if [`init_boot_log`] has run.
pub(crate) fn boot_log_path() -> Option<PathBuf> {
    BOOT_LOG_PATH.lock().ok().and_then(|g| g.clone())
}

/// Truncate the boot log so the next attempt starts a fresh transcript.
/// Writes a single header line with the supplied phase label. No-op when
/// the path is unset (tests) or the file can't be opened.
pub(crate) fn reset_boot_log(phase: &str) {
    let Some(path) = boot_log_path() else { return };
    if let Ok(mut f) = File::create(&path) {
        let _ = writeln!(f, "=== backend {phase} log ===");
    }
}

/// Append one line to the persisted boot log (best-effort; never panics,
/// never blocks boot on an I/O error). Used by the spawn path and the
/// install/repair streamers so a failed boot leaves a re-openable log.
pub(crate) fn boot_log_line(line: &str) {
    let Some(path) = boot_log_path() else { return };
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::supervisor_boot_log_open::open_boot_log;
    use std::env;

    /// The boot-log helpers are a silent no-op until `init_boot_log` wires a
    /// path (e.g. in unit tests that never construct an AppHandle). They must
    /// never panic in that state — boot must not depend on logging.
    #[test]
    fn boot_log_helpers_no_op_without_init() {
        // BOOT_LOG_PATH starts unset in a fresh test process; these must not
        // panic regardless of ordering with other tests.
        reset_boot_log("test");
        boot_log_line("a line with no sink should be dropped silently");
        // open_boot_log surfaces a friendly error string, never a panic.
        if boot_log_path().is_none() {
            let err = open_boot_log().expect_err("no path -> Err, not Ok/panic");
            assert!(
                err.contains("not initialized"),
                "expected an uninitialized-path error, got: {err}"
            );
        }
    }

    /// When a path IS set, reset truncates with a header and append adds
    /// lines — the on-disk shape the "Open logs" button reveals. Uses a temp
    /// path and restores the global afterward so it doesn't leak into other
    /// tests in the same process.
    #[test]
    fn boot_log_writes_header_then_lines() {
        let dir = env::temp_dir().join(format!("backend-boot-log-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("backend-boot.log");

        let saved = BOOT_LOG_PATH.lock().unwrap().clone();
        *BOOT_LOG_PATH.lock().unwrap() = Some(path.clone());

        reset_boot_log("boot");
        boot_log_line("line one");
        boot_log_line("line two");

        let body = fs::read_to_string(&path).expect("boot log written");
        assert!(body.starts_with("=== backend boot log ==="), "got: {body}");
        assert!(
            body.contains("line one") && body.contains("line two"),
            "got: {body}"
        );

        // reset again truncates the prior content.
        reset_boot_log("repair");
        let body2 = fs::read_to_string(&path).expect("boot log re-written");
        assert!(body2.starts_with("=== backend repair log ==="), "got: {body2}");
        assert!(
            !body2.contains("line one"),
            "reset must truncate, got: {body2}"
        );

        *BOOT_LOG_PATH.lock().unwrap() = saved;
        let _ = fs::remove_dir_all(&dir);
    }
}

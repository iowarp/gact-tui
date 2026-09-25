//! Retrying directory swaps for the installer runtime pack (#I1).
//!
//! `runtime_pack::prepare_windows_runtime` moves three directories around
//! (`bundled-runtime` -> `bundled-runtime.previous`, the freshly extracted
//! `bundled-runtime.installing` -> `bundled-runtime`, then removes the old
//! `.previous`). Each of those is a single `fs::rename`/`fs::remove_dir_all`
//! that used to fail immediately on the first transient lock. This module
//! gives every one of those operations a bounded, backed-off retry — for
//! whatever `installer_runtime_stop`'s deterministic sweep missed (a
//! third-party antivirus scanning the freshly written tree, the Windows
//! Search indexer, File Explorer holding a thumbnail handle) — and, if the
//! retries still exhaust, names the process still holding the path via the
//! Restart Manager API so the error is actionable rather than a bare
//! "Access is denied. (os error 5)".

use std::io;
use std::path::Path;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
use windows_sys::Win32::System::RestartManager::{
    RmEndSession, RmGetList, RmRegisterResources, RmStartSession, CCH_RM_SESSION_KEY,
    RM_PROCESS_INFO,
};

/// Windows raw OS error for `ERROR_ACCESS_DENIED`.
pub(crate) const ERROR_ACCESS_DENIED: i32 = 5;
/// Windows raw OS error for `ERROR_SHARING_VIOLATION`.
pub(crate) const ERROR_SHARING_VIOLATION: i32 = 32;

/// Whether `error` is one of the two transient Windows codes a directory
/// swap should retry. These are the two codes a process holding an open
/// handle (or memory-mapped view) under the path produces; every other error
/// — disk full, path too long, permission denied for a real ACL reason —
/// fails immediately, since a delay cannot fix it.
pub(crate) fn is_retryable(error: &io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(ERROR_ACCESS_DENIED) | Some(ERROR_SHARING_VIOLATION)
    )
}

/// Bounded exponential backoff summing to a little under 30s of total sleep:
/// 250ms, 500ms, 1s, 2s, 4s, 8s, 8s, 8s (the ladder holds at its last step
/// rather than keep doubling into one unreasonably long final sleep).
pub(crate) fn backoff_schedule() -> Vec<Duration> {
    const STEP_CAP: Duration = Duration::from_secs(8);
    const BUDGET: Duration = Duration::from_secs(30);
    let mut steps = Vec::new();
    let mut delay = Duration::from_millis(250);
    let mut total = Duration::ZERO;
    while total < BUDGET {
        let step = delay.min(STEP_CAP);
        steps.push(step);
        total += step;
        delay = delay.saturating_mul(2).min(STEP_CAP);
    }
    steps
}

/// Retry `operation` on a transient lock using [`backoff_schedule`], logging
/// each attempt. Returns the last error once every attempt (the first try
/// plus the whole backoff schedule) has failed, or immediately on any
/// non-retryable error.
fn retry_on_lock<F>(label: &str, mut operation: F) -> io::Result<()>
where
    F: FnMut() -> io::Result<()>,
{
    let mut last_error = match operation() {
        Ok(()) => return Ok(()),
        Err(error) if !is_retryable(&error) => return Err(error),
        Err(error) => error,
    };
    for (attempt, delay) in backoff_schedule().into_iter().enumerate() {
        eprintln!(
            "[installer_dir_swap] {label} failed ({last_error}); retrying in {delay:?} \
             (attempt {} of a ~30s backoff)",
            attempt + 1
        );
        std::thread::sleep(delay);
        match operation() {
            Ok(()) => return Ok(()),
            Err(error) if !is_retryable(&error) => return Err(error),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

/// `fs::rename(from, to)` with the retry-on-lock policy above. `label` is the
/// FULL description of the action (both paths already interpolated in,
/// caller's own wording) so the error text this produces matches exactly what
/// the direct `fs::rename` call it replaces used to say. On exhaustion, the
/// returned message additionally names whatever [`processes_locking_path`]
/// can find still holding `from` open.
pub(crate) fn rename_with_retry(from: &Path, to: &Path, label: &str) -> Result<(), String> {
    retry_on_lock(label, || std::fs::rename(from, to))
        .map_err(|error| describe_swap_failure(label, from, &error))
}

/// `fs::remove_dir_all(path)` with the same retry-on-lock policy; see
/// [`rename_with_retry`] for the `label` contract.
pub(crate) fn remove_dir_all_with_retry(path: &Path, label: &str) -> Result<(), String> {
    retry_on_lock(label, || std::fs::remove_dir_all(path))
        .map_err(|error| describe_swap_failure(label, path, &error))
}

fn describe_swap_failure(action: &str, locked_path: &Path, error: &io::Error) -> String {
    let mut message = format!("{action}: {error}");
    if is_retryable(error) {
        let holders = processes_locking_path(locked_path);
        if holders.is_empty() {
            message.push_str(
                "; retried with exponential backoff for about 30s but the directory was \
                 still locked, and the process holding it could not be identified \
                 (Restart Manager reported nothing, or is unavailable)",
            );
        } else {
            message.push_str(&format!(
                "; retried with exponential backoff for about 30s but the directory was \
                 still locked by: {}",
                holders.join(", ")
            ));
        }
    }
    message
}

/// Best-effort Restart Manager (`RmGetList`) lookup of which process(es) hold
/// `path` (or anything below it, when it is a directory) open. Returns an
/// empty vec on any failure — starting a session, registering the resource,
/// or reading the list back — since this is a diagnostic addition to the
/// error message, never something the caller should depend on succeeding.
#[cfg(windows)]
pub(crate) fn processes_locking_path(path: &Path) -> Vec<String> {
    let mut session: u32 = 0;
    let mut key_buf = [0_u16; (CCH_RM_SESSION_KEY + 1) as usize];
    if unsafe { RmStartSession(&mut session, 0, key_buf.as_mut_ptr()) } != 0 {
        return Vec::new();
    }
    let holders = processes_locking_path_in_session(session, path);
    unsafe {
        RmEndSession(session);
    }
    holders
}

#[cfg(windows)]
fn processes_locking_path_in_session(session: u32, path: &Path) -> Vec<String> {
    let wide_path: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let file_ptr = wide_path.as_ptr();
    let registered = unsafe {
        RmRegisterResources(
            session,
            1,
            &file_ptr,
            0,
            std::ptr::null(),
            0,
            std::ptr::null(),
        )
    };
    if registered != 0 {
        return Vec::new();
    }

    let mut needed: u32 = 0;
    let mut count: u32 = 0;
    let mut reasons: u32 = 0;
    // First pass with a zero-capacity buffer just measures how many entries
    // RmGetList wants to hand back.
    unsafe {
        RmGetList(
            session,
            &mut needed,
            &mut count,
            std::ptr::null_mut(),
            &mut reasons,
        );
    }
    if needed == 0 {
        return Vec::new();
    }

    let mut buffer: Vec<RM_PROCESS_INFO> = Vec::with_capacity(needed as usize);
    // SAFETY: RM_PROCESS_INFO is a plain-old-data FFI struct (integers, fixed
    // WCHAR arrays, a BOOL) with no invariants a zeroed value violates, and
    // the capacity above matches the length we set here.
    unsafe {
        std::ptr::write_bytes(buffer.as_mut_ptr(), 0, needed as usize);
        buffer.set_len(needed as usize);
    }
    let mut info_count = needed;
    let mut needed_again = needed;
    let result = unsafe {
        RmGetList(
            session,
            &mut needed_again,
            &mut info_count,
            buffer.as_mut_ptr(),
            &mut reasons,
        )
    };
    if result != 0 {
        return Vec::new();
    }

    buffer
        .iter()
        .take(info_count as usize)
        .map(|entry| {
            let name_len = entry
                .strAppName
                .iter()
                .position(|ch| *ch == 0)
                .unwrap_or(entry.strAppName.len());
            let name = String::from_utf16_lossy(&entry.strAppName[..name_len]);
            format!("{name} (pid {})", entry.Process.dwProcessId)
        })
        .collect()
}

#[cfg(not(windows))]
pub(crate) fn processes_locking_path(_path: &Path) -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_denied_and_sharing_violation_are_retryable() {
        assert!(is_retryable(&io::Error::from_raw_os_error(
            ERROR_ACCESS_DENIED
        )));
        assert!(is_retryable(&io::Error::from_raw_os_error(
            ERROR_SHARING_VIOLATION
        )));
    }

    #[test]
    fn other_errors_are_not_retryable() {
        assert!(!is_retryable(&io::Error::from_raw_os_error(2))); // ERROR_FILE_NOT_FOUND
        assert!(!is_retryable(&io::Error::from_raw_os_error(112))); // ERROR_DISK_FULL
        assert!(!is_retryable(&io::Error::new(io::ErrorKind::Other, "boom")));
    }

    #[test]
    fn backoff_schedule_doubles_up_to_a_cap_and_totals_about_30s() {
        let schedule = backoff_schedule();
        assert_eq!(
            schedule[..6],
            [
                Duration::from_millis(250),
                Duration::from_millis(500),
                Duration::from_secs(1),
                Duration::from_secs(2),
                Duration::from_secs(4),
                Duration::from_secs(8),
            ]
        );
        // Every step after the cap is reached holds at 8s rather than
        // continuing to double.
        assert!(schedule[6..]
            .iter()
            .all(|step| *step == Duration::from_secs(8)));
        let total: Duration = schedule.iter().sum();
        assert!(total >= Duration::from_secs(29) && total <= Duration::from_secs(38));
    }

    #[test]
    fn rename_with_retry_succeeds_on_the_first_try_without_sleeping() {
        let root = std::env::temp_dir().join(format!(
            "clio-dir-swap-ok-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("test dir");
        let from = root.join("from");
        let to = root.join("to");
        std::fs::create_dir_all(&from).expect("from dir");

        let started = std::time::Instant::now();
        rename_with_retry(&from, &to, "move test dir").expect("rename must succeed");
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "a successful rename must not sleep at all"
        );
        assert!(to.is_dir());
        assert!(!from.exists());
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn rename_with_retry_fails_fast_on_a_non_retryable_error() {
        let root = std::env::temp_dir().join(format!(
            "clio-dir-swap-missing-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let from = root.join("does-not-exist");
        let to = root.join("to");

        let started = std::time::Instant::now();
        let error = rename_with_retry(&from, &to, "move test dir").expect_err("must fail");
        assert!(
            started.elapsed() < Duration::from_millis(500),
            "a non-retryable error (source missing) must not trigger the backoff"
        );
        assert!(error.contains("move test dir"));
    }

    /// Integration-style: holds a file inside the source directory open with a
    /// share mode that denies everything (including delete), which reproduces
    /// the real `ERROR_SHARING_VIOLATION` a straggling `clio_run.exe` handle
    /// would cause, then releases it partway through the backoff. Asserts the
    /// swap only succeeds AFTER the lock actually clears (never before, which
    /// would mean the retry loop wasn't really gated on the error) and well
    /// before the full ~30s budget is exhausted.
    #[cfg(windows)]
    #[test]
    fn rename_with_retry_succeeds_once_a_held_file_is_released() {
        use std::os::windows::fs::OpenOptionsExt;

        let root = std::env::temp_dir().join(format!(
            "clio-dir-swap-locked-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        let from = root.join("from");
        let to = root.join("to");
        std::fs::create_dir_all(&from).expect("from dir");
        let locked_file = from.join("locked.bin");
        std::fs::write(&locked_file, b"hold me").expect("seed file");

        let handle = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0) // deny ALL sharing, including delete -> guarantees a sharing violation on rename
            .open(&locked_file)
            .expect("open the file with an exclusive share mode");

        let release_after = Duration::from_millis(700);
        let releaser = std::thread::spawn(move || {
            std::thread::sleep(release_after);
            drop(handle);
        });

        let started = std::time::Instant::now();
        rename_with_retry(&from, &to, "move locked test dir")
            .expect("the swap must eventually succeed once the lock clears");
        let elapsed = started.elapsed();
        releaser.join().expect("releaser thread must not panic");

        assert!(
            elapsed >= release_after,
            "must not have succeeded before the lock was actually released (elapsed {elapsed:?})"
        );
        assert!(
            elapsed < Duration::from_secs(15),
            "a lock that cleared quickly must not burn anywhere near the full ~30s backoff \
             budget (elapsed {elapsed:?})"
        );
        assert!(to.join("locked.bin").is_file());
        std::fs::remove_dir_all(&root).expect("cleanup");
    }
}

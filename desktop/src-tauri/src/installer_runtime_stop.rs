//! Deterministic process stop for the installer's runtime directory swap (#I1).
//!
//! `runtime_pack::prepare_windows_runtime` renames `bundled-runtime` out of the
//! way and stages a fresh copy in its place. That rename fails with
//! `ERROR_ACCESS_DENIED` (raw OS error 5) or `ERROR_SHARING_VIOLATION` (32)
//! whenever anything still has a handle open under the directory — most
//! notably the shared clio-core runtime daemon (`clio_run.exe`), which
//! deliberately breaks away from our Job Object (see `supervisor_shutdown`)
//! so independent CLIO clients can keep using it after this one closes. A
//! user closing CLIO Desktop right before an update leaves that daemon
//! running as an orphan, still holding the very directory the installer is
//! about to replace.
//!
//! The NSIS hooks used to paper over this with a PowerShell one-liner (WMI
//! process enumeration + `Stop-Process -Force`) followed by a fixed
//! `Sleep 1500` — a guess, not a wait. This module replaces both: it finds
//! every CLIO-managed process whose executable lives under the install root
//! (via the same Toolhelp snapshot `supervisor_shutdown` already knows how to
//! walk, plus `QueryFullProcessImageNameW` for the full path WMI would have
//! given us), asks a managed `clio_run.exe` to stop cleanly first, then
//! terminates whatever remains and **waits on its handle** until it has
//! actually exited — never a fixed sleep. Callers are the `--prepare-runtime`
//! path (`runtime_pack.rs`) and the new `--stop-managed-runtime` installer
//! step that the NSIS hooks invoke in place of the old encoded PowerShell.

use std::path::Path;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::ffi::OsString;
#[cfg(windows)]
use std::os::windows::ffi::OsStringExt;
#[cfg(windows)]
use std::process::{Command, Stdio};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0},
    System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess, WaitForSingleObject,
        PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    },
};

#[cfg(windows)]
use crate::supervisor_shutdown::{windows_process_snapshot, ProcessEntry, SYNCHRONIZE};

/// Executable names (case-insensitive) that belong to a CLIO-managed install.
/// Mirrors the process list the deleted PowerShell one-liner matched on —
/// see `installer-hooks.nsh`'s (now-removed) `CLIO_STOP_MANAGED_RUNTIME`
/// encoded command for the prior art.
const MANAGED_PROCESS_NAMES: &[&str] = &[
    "clio-desktop.exe",
    "clio-agent.exe",
    "python.exe",
    "clio_run.exe",
];

/// How long a managed `clio_run.exe` gets to answer `stop` cleanly before this
/// sweep gives up and falls through to `TerminateProcess`. The daemon's own
/// clean-stop handshake (`clio_agent.arc.runtime_stop`) normally releases its
/// port within a few hundred ms; this is generous headroom, not a guess about
/// how long it "should" take — the actual wait below is event-driven.
const CLEAN_STOP_TIMEOUT: Duration = Duration::from_secs(5);
/// Per-process cap on waiting for a terminated process to actually exit.
const TERMINATE_WAIT_TIMEOUT: Duration = Duration::from_secs(10);
/// Overall last-resort cap across every matched process, so one wedged
/// handle can never hang the installer step forever. The directory-swap
/// retry (`installer_dir_swap`) is the real backstop if anything survives
/// past this — this cap only bounds how long THIS sweep waits before handing
/// control back.
const OVERALL_CAP: Duration = Duration::from_secs(25);

/// One process this sweep found under the install root and tried to stop.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct StoppedProcess {
    pub pid: u32,
    pub name: String,
    /// Whether it was confirmed to have exited (waited on its own handle),
    /// as opposed to `TerminateProcess` merely being requested.
    pub exited: bool,
}

/// Case-insensitive membership in [`MANAGED_PROCESS_NAMES`].
pub(crate) fn is_managed_process_name(name: &str) -> bool {
    MANAGED_PROCESS_NAMES
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(name))
}

/// Whether `candidate` (an absolute path) is `root` itself or lives below it.
///
/// Case-insensitive (Windows paths are), and a plain `starts_with` on the
/// lowercased strings is deliberately NOT enough on its own: `root` = `C:\A`
/// must not match `C:\AB\x.exe`, a sibling directory that merely shares `root`
/// as a *textual* prefix. The character right after the shared prefix must be
/// a path separator (or the paths must be exactly equal) for `candidate` to
/// actually be inside `root`.
pub(crate) fn path_is_under_root(candidate: &str, root: &str) -> bool {
    let candidate = candidate.trim_end_matches(['\\', '/']);
    let root = root.trim_end_matches(['\\', '/']);
    if root.is_empty() {
        return false;
    }
    let candidate_lower = candidate.to_ascii_lowercase();
    let root_lower = root.to_ascii_lowercase();
    if candidate_lower == root_lower {
        return true;
    }
    match candidate_lower.strip_prefix(root_lower.as_str()) {
        Some(rest) => rest.starts_with('\\') || rest.starts_with('/'),
        None => false,
    }
}

/// Find every CLIO-managed process under `root`, ask a managed `clio_run.exe`
/// to stop cleanly, then terminate and wait out whatever is left.
///
/// Best-effort by design: a process that vanishes mid-sweep, or one whose
/// handle this process cannot open (foreign session, already gone), is simply
/// skipped rather than treated as a hard failure — the directory-swap retry
/// is what actually gates on the outcome, this is only the deterministic
/// first line of defense that replaces the old fixed `Sleep 1500`.
#[cfg(windows)]
pub(crate) fn stop_processes_under_root(root: &Path) -> Vec<StoppedProcess> {
    let root_str = root.to_string_lossy().into_owned();
    let snapshot = windows_process_snapshot();
    let matches: Vec<ProcessEntry> = snapshot
        .into_iter()
        .filter(|process| is_managed_process_name(&process.name))
        .filter(|process| {
            windows_full_image_path(process.pid)
                .is_some_and(|path| path_is_under_root(&path, &root_str))
        })
        .collect();

    // Ask any managed clio_run.exe to release the runtime cleanly before any
    // TerminateProcess: a clean `stop` lets clio-core close its RPC socket
    // and any open handles into the runtime tree on its own, exactly like an
    // ordinary last-client release (`clio_agent.arc.runtime_stop`).
    for process in &matches {
        if process.name.eq_ignore_ascii_case("clio_run.exe") {
            if let Some(exe_path) = windows_full_image_path(process.pid) {
                windows_try_clean_stop(Path::new(&exe_path));
            }
        }
    }

    let deadline = Instant::now() + OVERALL_CAP;
    matches
        .into_iter()
        .map(|process| {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let wait_budget = remaining.min(TERMINATE_WAIT_TIMEOUT);
            let exited = windows_terminate_and_wait(process.pid, wait_budget);
            StoppedProcess {
                pid: process.pid,
                name: process.name,
                exited,
            }
        })
        .collect()
}

/// [`stop_processes_under_root`] plus stderr logging of what it found and
/// whether each match was confirmed to exit. Shared by the `--prepare-runtime`
/// path (`runtime_pack.rs`, right before it touches the runtime directory)
/// and the standalone `--stop-managed-runtime` installer step that the NSIS
/// hooks invoke ahead of an upgrade/uninstall — `label` distinguishes the two
/// call sites in the log.
#[cfg(windows)]
pub(crate) fn stop_and_log(root: &Path, label: &str) {
    for stopped in stop_processes_under_root(root) {
        if stopped.exited {
            eprintln!("[{label}] stopped {} (pid {})", stopped.name, stopped.pid);
        } else {
            eprintln!(
                "[{label}] {} (pid {}) did not confirm exit within its wait budget; the \
                 directory-swap retry will handle any lock it still holds",
                stopped.name, stopped.pid
            );
        }
    }
}

/// The full Win32 path (`QueryFullProcessImageNameW`) of a running process's
/// executable, or `None` when it has already exited or this process cannot
/// query it (a foreign session, insufficient rights) — either way, best
/// effort, matching the rest of this module.
///
/// `pub(crate)`: shared with `clio_core_daemon` (#D1), which resolves the
/// shared clio-core daemon's own exe path from its pidfile PID the same way
/// this sweep resolves a managed process's path from a Toolhelp snapshot
/// entry — one Win32 FFI wrapper, not two.
#[cfg(windows)]
pub(crate) fn windows_full_image_path(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buffer = [0_u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut size)
    };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 {
        return None;
    }
    Some(
        OsString::from_wide(&buffer[..size as usize])
            .to_string_lossy()
            .into_owned(),
    )
}

/// Spawn `<exe_path> stop` and give it [`CLEAN_STOP_TIMEOUT`] to finish. Purely
/// best-effort: any failure (the helper cannot start, exits non-zero, or does
/// not finish in time) just falls through to the hard-terminate step below —
/// this is an optimization to avoid a needless TerminateProcess, not a
/// required step.
///
/// `pub(crate)`: shared with `clio_core_daemon` (#D1)'s quit-time and
/// startup-orphan release, which asks the exact same `clio_run.exe` for the
/// exact same clean `stop` before ever falling back to a hard kill.
#[cfg(windows)]
pub(crate) fn windows_try_clean_stop(exe_path: &Path) {
    let Some(bin_dir) = exe_path.parent() else {
        return;
    };
    let mut command = Command::new(exe_path);
    command
        .arg("stop")
        .current_dir(bin_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let Ok(mut child) = command.spawn() else {
        return;
    };
    let deadline = Instant::now() + CLEAN_STOP_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }
}

/// `TerminateProcess`, then actually wait on the handle (`WaitForSingleObject`)
/// rather than assume the call took effect immediately — `TerminateProcess`
/// only *requests* termination; the target still needs time to unwind and
/// release its open handles into the directory this sweep exists to free up.
/// Returns whether the process was confirmed to exit within `timeout`.
///
/// `pub(crate)`: shared with `clio_core_daemon` (#D1)'s hard-kill fallback
/// when the clean `stop` above doesn't confirm in time.
#[cfg(windows)]
pub(crate) fn windows_terminate_and_wait(pid: u32, timeout: Duration) -> bool {
    let handle: HANDLE = unsafe { OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, 0, pid) };
    if handle.is_null() {
        // Cannot open it at all -- most likely already gone.
        return true;
    }
    unsafe {
        TerminateProcess(handle, 1);
    }
    let millis = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX);
    let result = unsafe { WaitForSingleObject(handle, millis) };
    unsafe {
        CloseHandle(handle);
    }
    result == WAIT_OBJECT_0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_process_names_match_case_insensitively() {
        assert!(is_managed_process_name("clio_run.exe"));
        assert!(is_managed_process_name("CLIO_RUN.EXE"));
        assert!(is_managed_process_name("Clio-Desktop.exe"));
        assert!(is_managed_process_name("python.EXE"));
        assert!(!is_managed_process_name("notepad.exe"));
        assert!(!is_managed_process_name("clio_run"));
    }

    #[test]
    fn path_under_root_matches_the_root_itself() {
        assert!(path_is_under_root(r"C:\CLIO Desktop", r"C:\CLIO Desktop"));
        assert!(path_is_under_root(r"C:\CLIO Desktop\", r"C:\CLIO Desktop"));
    }

    #[test]
    fn path_under_root_matches_nested_files_case_insensitively() {
        assert!(path_is_under_root(
            r"c:\clio desktop\data\bundled-runtime\gact-runtime\python\lib\site-packages\iowarp_core\bin\clio_run.exe",
            r"C:\CLIO Desktop"
        ));
    }

    #[test]
    fn path_under_root_rejects_a_sibling_that_shares_a_textual_prefix() {
        // "bundled-runtime2" must not be treated as inside "bundled-runtime".
        assert!(!path_is_under_root(
            r"C:\CLIO Desktop\data\bundled-runtime2\x.exe",
            r"C:\CLIO Desktop\data\bundled-runtime"
        ));
        // Same hazard one level up: "CLIO Desktop Beta" vs "CLIO Desktop".
        assert!(!path_is_under_root(
            r"C:\CLIO Desktop Beta\clio-desktop.exe",
            r"C:\CLIO Desktop"
        ));
    }

    #[test]
    fn path_under_root_rejects_an_unrelated_path() {
        assert!(!path_is_under_root(
            r"C:\Windows\System32\python.exe",
            r"C:\CLIO Desktop"
        ));
    }

    #[test]
    fn path_under_root_rejects_an_empty_root() {
        assert!(!path_is_under_root(r"C:\CLIO Desktop\x.exe", ""));
    }
}

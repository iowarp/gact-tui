//! Reads and prunes the clio-core shared-runtime HOST registry that
//! `clio_agent.arc.storage` (the Python GACT server) writes under
//! `~/.clio/hosts/<host>` (or `CLIO_RUNTIME_STATE_DIR` when overridden).
//!
//! There is exactly ONE clio-core daemon (`clio_run`) per machine; every
//! clio-agent process on it (this desktop's managed backend, a CLI, a dev
//! server) shares that daemon and registers itself as a client so the "last
//! one out" release knows when it is safe to stop it. The on-disk shapes
//! here are a CONTRACT with that Python writer — this module only reads and
//! prunes, it never registers this desktop process itself as a client (the
//! desktop never talks to clio-core directly; its managed Python backend
//! does that registration on its own).
//!
//! Format (Python is the writer; mirror `clio_agent.arc.storage` /
//! `clio_agent.arc.clio_core_config.runtime_state_dir` exactly, never drift
//! from it unilaterally on this side):
//!   * `<state_dir>/clio-runtime.pid` — one line, `"<pid> <create_time_or_empty>"`.
//!   * `<state_dir>/clio-runtime.clients/<pid>` — one file per attached
//!     client, named by decimal PID; content is `""` or `repr(create_time)`
//!     (a float epoch-seconds string).
//!
//! Liveness is verified by CREATION-TIME MATCH where a recorded time is
//! available (defeats PID reuse, mirrors `clio_agent.arc.storage._pid_alive`
//! within ~1s tolerance); bare existence is the fallback when no creation
//! time was recorded, exactly like the Python side.

use std::fs;
use std::path::{Path, PathBuf};

/// Filename of the daemon pidfile under the state directory.
pub(crate) const DAEMON_PIDFILE_NAME: &str = "clio-runtime.pid";
/// Directory name holding one file per registered client PID.
pub(crate) const CLIENT_REGISTRY_DIR_NAME: &str = "clio-runtime.clients";

/// The shared daemon's recorded PID + (optional) creation time, as read from
/// the pidfile — liveness is NOT judged here, see [`pid_is_alive`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct DaemonPid {
    pub pid: u32,
    pub created_at: Option<f64>,
}

/// Resolve the clio-core host state directory: `CLIO_RUNTIME_STATE_DIR` when
/// set to a non-empty value (the same override clio-agent's own test harness
/// and sandboxed deployments use), else `<home>/.clio/hosts/<host>`. Mirrors
/// `clio_agent.arc.clio_core_config.runtime_state_dir`: the state is keyed by
/// machine because a home directory can be shared by several machines (a
/// cluster's NFS home), and each machine runs its own daemon. Returns `None`
/// only when neither the override nor a home directory can be resolved.
///
/// Read-only: unlike the Python writer, this never creates the directory —
/// there is nothing to prune in a directory that doesn't exist yet.
pub(crate) fn runtime_state_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("CLIO_RUNTIME_STATE_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|home| machine_state_dir(Path::new(&home)))
}

/// `<home>/.clio/hosts/<this machine's host key>`.
fn machine_state_dir(home: &Path) -> PathBuf {
    home.join(".clio")
        .join("hosts")
        .join(host_key(&system_hostname()))
}

/// The directory name for a machine, from its host name. Mirrors
/// `clio_agent.arc.clio_core_config.host_key` exactly: the first DNS label,
/// lowercased, every run of characters outside `[a-z0-9_-]` replaced by one
/// `-`, leading/trailing `-` trimmed, and `localhost` when nothing is left.
pub(crate) fn host_key(hostname: &str) -> String {
    let label = hostname
        .split('.')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let mut key = String::with_capacity(label.len());
    let mut in_unsafe_run = false;
    for ch in label.chars() {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-' {
            key.push(ch);
            in_unsafe_run = false;
        } else if !in_unsafe_run {
            key.push('-');
            in_unsafe_run = true;
        }
    }
    let key = key.trim_matches('-');
    if key.is_empty() {
        "localhost".to_string()
    } else {
        key.to_string()
    }
}

/// This machine's host name, read the way Python's `socket.gethostname()`
/// reads it (`GetComputerNameExW(ComputerNamePhysicalDnsHostname)` on
/// Windows, `gethostname(2)` elsewhere), so both sides pick the same
/// directory. Empty when the OS does not answer.
fn system_hostname() -> String {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{
            ComputerNamePhysicalDnsHostname, GetComputerNameExW,
        };
        let mut buffer = [0u16; 256];
        let mut size = buffer.len() as u32;
        // SAFETY: `buffer` is writable for `size` UTF-16 units; on success the
        // call stores the name's length (without the terminator) in `size`.
        let ok = unsafe {
            GetComputerNameExW(
                ComputerNamePhysicalDnsHostname,
                buffer.as_mut_ptr(),
                &mut size,
            )
        };
        if ok == 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buffer[..size as usize])
    }
    #[cfg(unix)]
    {
        let mut buffer = [0u8; 256];
        // SAFETY: `buffer` is writable for its full length; the name is
        // NUL-terminated within it on success.
        let ok = unsafe { libc::gethostname(buffer.as_mut_ptr().cast(), buffer.len()) };
        if ok != 0 {
            return String::new();
        }
        let end = buffer
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(buffer.len());
        String::from_utf8_lossy(&buffer[..end]).into_owned()
    }
}

/// Read the daemon pidfile without judging liveness. `None` when absent,
/// empty, or the leading token isn't a valid PID — never panics.
pub(crate) fn read_daemon_pidfile(state_dir: &Path) -> Option<DaemonPid> {
    let text = fs::read_to_string(state_dir.join(DAEMON_PIDFILE_NAME)).ok()?;
    let mut parts = text.split_whitespace();
    let pid: u32 = parts.next()?.parse().ok()?;
    let created_at = parts.next().and_then(|token| token.parse::<f64>().ok());
    Some(DaemonPid { pid, created_at })
}

/// Remove the daemon pidfile (best-effort; a missing file is not an error).
pub(crate) fn remove_daemon_pidfile(state_dir: &Path) {
    let _ = fs::remove_file(state_dir.join(DAEMON_PIDFILE_NAME));
}

/// List every LIVE client PID registered under
/// `<state_dir>/clio-runtime.clients/`, deleting dead entries as a side
/// effect — mirrors `clio_agent.arc.storage._live_client_pids` exactly so
/// every other reader of the registry (a CLI, a dev server, this desktop's
/// own next boot) also sees a pruned list, not just this call's return value.
///
/// A missing registry directory (no client ever registered, or none left)
/// yields an empty list, never an error. A non-numeric filename is a
/// malformed/foreign entry and is skipped WITHOUT being touched — same as
/// the Python side's `if not entry.name.isdigit(): continue`.
pub(crate) fn prune_and_list_live_clients(state_dir: &Path) -> Vec<u32> {
    let registry_dir = state_dir.join(CLIENT_REGISTRY_DIR_NAME);
    let Ok(entries) = fs::read_dir(&registry_dir) else {
        return Vec::new();
    };
    let mut live = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name.is_empty() || !name.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let Ok(pid) = name.parse::<u32>() else {
            continue;
        };
        // A garbled/non-numeric CONTENT (as opposed to filename) falls back
        // to `None` here, exactly like the Python reader's `except
        // (OSError, ValueError): recorded = None` — it does NOT make the
        // entry malformed-and-skipped, it just loses the creation-time
        // cross-check and falls back to bare existence.
        let recorded = fs::read_to_string(entry.path())
            .ok()
            .map(|content| content.trim().to_string())
            .filter(|content| !content.is_empty())
            .and_then(|content| content.parse::<f64>().ok());
        if pid_is_alive(pid, recorded) {
            live.push(pid);
        } else {
            let _ = fs::remove_file(entry.path());
        }
    }
    live
}

/// Whether `pid` is alive AND (when `recorded_create_time` is known) its
/// creation time still matches within ~1s tolerance — defeats PID reuse,
/// mirroring `clio_agent.arc.storage._pid_alive`. Bare existence is enough
/// when no creation time was recorded.
#[cfg(windows)]
pub(crate) fn pid_is_alive(pid: u32, recorded_create_time: Option<f64>) -> bool {
    match windows_process_created_at(pid) {
        None => false,
        Some(WindowsCreationTime::Unknown) => true,
        Some(WindowsCreationTime::At(current)) => match recorded_create_time {
            None => true,
            Some(recorded) => (current - recorded).abs() < 1.0,
        },
    }
}

/// Unix has no creation-time source in this crate's dependency set (that
/// would need `/proc` parsing on Linux or a `sysctl` FFI on macOS, neither of
/// which anything else here pulls in) — a scoped simplification of the same
/// KIND `supervisor_shutdown.rs` already documents for its own Windows-only
/// PID-reuse defense. Existence via `kill(pid, 0)` is the fallback signal;
/// `EPERM` (exists, owned by someone else) still counts as alive, only
/// `ESRCH` (no such process) counts as dead.
#[cfg(unix)]
pub(crate) fn pid_is_alive(pid: u32, _recorded_create_time: Option<f64>) -> bool {
    let result = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if result == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

#[cfg(not(any(windows, unix)))]
pub(crate) fn pid_is_alive(_pid: u32, _recorded_create_time: Option<f64>) -> bool {
    false
}

/// The current creation time of a live `pid`, in the same epoch-seconds shape
/// the Python writer records (`psutil.Process.create_time()`), or `None` when
/// the process doesn't exist or this platform has no creation-time source.
///
/// Test-only (`#[cfg(test)]`): production callers never need to query a
/// PID's OWN creation time — the registry pidfile already carries whatever
/// the Python writer recorded, and every stop path (`clio_core_daemon`)
/// forwards that recorded value end-to-end rather than re-deriving it. Tests
/// use this to write REALISTIC pidfiles (PID + real creation time, exactly
/// like the Python writer) for a process they just spawned, so the
/// PID-reuse defense under test is exercised the same way it is in
/// production instead of via the weaker no-creation-time fallback.
#[cfg(all(test, windows))]
pub(crate) fn process_created_at(pid: u32) -> Option<f64> {
    match windows_process_created_at(pid) {
        Some(WindowsCreationTime::At(at)) => Some(at),
        Some(WindowsCreationTime::Unknown) | None => None,
    }
}

#[cfg(all(test, unix))]
pub(crate) fn process_created_at(_pid: u32) -> Option<f64> {
    None
}

/// A Windows process creation-time probe outcome: known, or exists-but-
/// unreadable (an access-denied handle open still proves existence).
#[cfg(windows)]
enum WindowsCreationTime {
    At(f64),
    Unknown,
}

/// Probe `pid`'s creation time via `OpenProcess` + `GetProcessTimes`.
/// `None` means the process does not exist; `Some(Unknown)` means it exists
/// but this process could not query it (e.g. a protected/foreign-session
/// process — `ERROR_ACCESS_DENIED`).
#[cfg(windows)]
fn windows_process_created_at(pid: u32) -> Option<WindowsCreationTime> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    // ERROR_ACCESS_DENIED: the process exists but this caller cannot query
    // it (protected process, different session/user). Every other failure
    // (most commonly ERROR_INVALID_PARAMETER for a PID with no process) is
    // treated as "does not exist".
    const ERROR_ACCESS_DENIED: i32 = 5;

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        let denied = std::io::Error::last_os_error().raw_os_error() == Some(ERROR_ACCESS_DENIED);
        return if denied {
            Some(WindowsCreationTime::Unknown)
        } else {
            None
        };
    }
    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit = creation;
    let mut kernel = creation;
    let mut user = creation;
    let ok = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 {
        return Some(WindowsCreationTime::Unknown);
    }
    let ticks = ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
    Some(WindowsCreationTime::At(filetime_ticks_to_unix_seconds(
        ticks,
    )))
}

/// Convert Windows FILETIME ticks (100ns intervals since 1601-01-01) to Unix
/// epoch seconds, matching what `psutil.Process.create_time()` (the Python
/// writer's source of recorded creation times) reports on Windows.
#[cfg(windows)]
fn filetime_ticks_to_unix_seconds(ticks: u64) -> f64 {
    const FILETIME_UNIX_EPOCH_DIFF_TICKS: u64 = 116_444_736_000_000_000;
    (ticks as f64 - FILETIME_UNIX_EPOCH_DIFF_TICKS as f64) / 10_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Child, Command, Stdio};

    fn temp_state_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "clio-core-registry-test-{label}-{}-{}",
            std::process::id(),
            label.len()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create isolated temp state dir");
        dir
    }

    /// Spawn a quiet, long-running process to stand in for a "live" PID.
    fn spawn_alive() -> Child {
        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("cmd");
            c.args(["/C", "ping -n 300 127.0.0.1 >NUL"]);
            c
        };
        #[cfg(unix)]
        let mut cmd = {
            let mut c = Command::new("sleep");
            c.arg("300");
            c
        };
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn a long-running stand-in process")
    }

    /// Kill `alive` AND any descendants it spawned (its `ping` grandchild on
    /// Windows), then reap it. `Child::kill` alone only reaches the direct
    /// `cmd.exe` child — its `ping` grandchild is a separate process Windows
    /// does not cascade-terminate, so it would otherwise sit alive for its
    /// own 300s duration after every test that spawns one.
    fn kill_process_tree(alive: &mut Child) {
        #[cfg(windows)]
        {
            use windows_sys::Win32::Foundation::CloseHandle;
            use windows_sys::Win32::System::Threading::{
                OpenProcess, TerminateProcess, PROCESS_TERMINATE,
            };

            // Two passes with a short gap: `cmd /C ping ...` may not have
            // finished launching its `ping` grandchild by the moment this
            // runs, so a single snapshot can miss it (observed under the
            // crate's default multi-threaded `cargo test`).
            for attempt in 0..2 {
                if attempt == 1 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                let snapshot = crate::supervisor_shutdown::windows_process_snapshot();
                let descendants =
                    crate::supervisor_shutdown::owned_descendants(&snapshot, &[alive.id()]);
                for pid in descendants {
                    let handle = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
                    if !handle.is_null() {
                        unsafe {
                            TerminateProcess(handle, 1);
                            CloseHandle(handle);
                        }
                    }
                }
            }
        }
        let _ = alive.kill();
        let _ = alive.wait();
    }

    /// A PID that is certainly dead.
    ///
    /// An earlier version of this helper spawned a quick-exiting process and
    /// waited for it, then reused its former PID — that raced Windows' own
    /// PID recycling under a busy test suite (many short-lived `cmd.exe`
    /// processes churn during this very test run) and was observed to flake:
    /// a DIFFERENT, genuinely running process could already have been handed
    /// that exact PID by the time `pid_is_alive` checked it. A fixed,
    /// deliberately implausible sentinel (odd, not a multiple of 4, far
    /// above any PID Windows or a POSIX kernel hands out in practice) is
    /// deterministic instead.
    fn dead_pid() -> u32 {
        1_999_999_999
    }

    #[test]
    fn host_key_matches_the_python_writer() {
        // The same cases as clio-agent's test_host_key_is_the_short_lowercase_hostname.
        for (hostname, key) in [
            ("ares", "ares"),
            ("ares.ares.local", "ares"),
            ("ares-comp-11.cluster.example.edu", "ares-comp-11"),
            ("DESKTOP-AB12CD", "desktop-ab12cd"),
            ("weird name!", "weird-name"),
            ("a-!b", "a--b"),
            ("", "localhost"),
            (".", "localhost"),
        ] {
            assert_eq!(host_key(hostname), key, "{hostname:?}");
        }
    }

    #[test]
    fn the_state_dir_is_keyed_by_this_machine() {
        let home = Path::new("shared-home");
        let hostname = system_hostname();
        assert!(!hostname.is_empty(), "the OS reports a host name");
        assert_eq!(
            machine_state_dir(home),
            home.join(".clio").join("hosts").join(host_key(&hostname))
        );
    }

    #[test]
    fn runtime_state_dir_honors_the_env_override() {
        let dir = temp_state_dir("override");
        std::env::set_var("CLIO_RUNTIME_STATE_DIR", &dir);
        let resolved = runtime_state_dir().expect("override must resolve");
        std::env::remove_var("CLIO_RUNTIME_STATE_DIR");
        assert_eq!(resolved, dir);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_daemon_pidfile_missing_file_returns_none() {
        let dir = temp_state_dir("missing-pidfile");
        assert_eq!(read_daemon_pidfile(&dir), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_daemon_pidfile_parses_pid_and_creation_time() {
        let dir = temp_state_dir("pidfile-full");
        fs::write(dir.join(DAEMON_PIDFILE_NAME), "4242 1234567890.5").unwrap();
        assert_eq!(
            read_daemon_pidfile(&dir),
            Some(DaemonPid {
                pid: 4242,
                created_at: Some(1234567890.5)
            })
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_daemon_pidfile_tolerates_a_missing_creation_time() {
        let dir = temp_state_dir("pidfile-pid-only");
        fs::write(dir.join(DAEMON_PIDFILE_NAME), "4242").unwrap();
        assert_eq!(
            read_daemon_pidfile(&dir),
            Some(DaemonPid {
                pid: 4242,
                created_at: None
            })
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_daemon_pidfile_garbage_content_returns_none() {
        let dir = temp_state_dir("pidfile-garbage");
        fs::write(dir.join(DAEMON_PIDFILE_NAME), "not-a-pid").unwrap();
        assert_eq!(read_daemon_pidfile(&dir), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_and_list_live_clients_missing_dir_returns_empty() {
        let dir = temp_state_dir("missing-clients-dir");
        assert_eq!(prune_and_list_live_clients(&dir), Vec::<u32>::new());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_and_list_live_clients_keeps_live_and_prunes_dead() {
        let dir = temp_state_dir("live-and-dead");
        let clients_dir = dir.join(CLIENT_REGISTRY_DIR_NAME);
        fs::create_dir_all(&clients_dir).unwrap();

        let mut alive = spawn_alive();
        let alive_pid = alive.id();
        let stale_pid = dead_pid();

        fs::write(clients_dir.join(alive_pid.to_string()), "").unwrap();
        fs::write(clients_dir.join(stale_pid.to_string()), "").unwrap();

        let mut live = prune_and_list_live_clients(&dir);
        live.sort_unstable();
        assert_eq!(live, vec![alive_pid]);
        assert!(
            !clients_dir.join(stale_pid.to_string()).exists(),
            "the dead client's registry entry must be pruned"
        );
        assert!(
            clients_dir.join(alive_pid.to_string()).exists(),
            "the live client's registry entry must survive"
        );

        kill_process_tree(&mut alive);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_and_list_live_clients_ignores_non_numeric_filenames() {
        let dir = temp_state_dir("non-numeric-name");
        let clients_dir = dir.join(CLIENT_REGISTRY_DIR_NAME);
        fs::create_dir_all(&clients_dir).unwrap();
        fs::write(clients_dir.join("not-a-pid"), "").unwrap();

        let live = prune_and_list_live_clients(&dir);

        assert!(live.is_empty());
        assert!(
            clients_dir.join("not-a-pid").exists(),
            "a non-numeric filename is foreign/malformed and must be left untouched"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn prune_and_list_live_clients_garbled_content_falls_back_to_bare_existence() {
        let dir = temp_state_dir("garbled-content");
        let clients_dir = dir.join(CLIENT_REGISTRY_DIR_NAME);
        fs::create_dir_all(&clients_dir).unwrap();

        let mut alive = spawn_alive();
        let alive_pid = alive.id();
        // Malformed CONTENT (not a float) must not make an otherwise-live PID
        // look dead — it only loses the creation-time cross-check.
        fs::write(
            clients_dir.join(alive_pid.to_string()),
            "definitely-not-a-float",
        )
        .unwrap();

        let live = prune_and_list_live_clients(&dir);

        assert_eq!(live, vec![alive_pid]);
        kill_process_tree(&mut alive);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pid_is_alive_true_for_a_running_process_with_no_recorded_time() {
        let mut alive = spawn_alive();
        assert!(pid_is_alive(alive.id(), None));
        kill_process_tree(&mut alive);
    }

    #[test]
    fn pid_is_alive_false_for_a_dead_pid() {
        assert!(!pid_is_alive(dead_pid(), None));
    }

    #[cfg(windows)]
    #[test]
    fn pid_is_alive_detects_a_creation_time_mismatch_as_pid_reuse() {
        let mut alive = spawn_alive();
        // A recorded creation time far in the past can never match the real
        // process just spawned — this is the PID-reuse defense kicking in.
        assert!(!pid_is_alive(alive.id(), Some(1.0)));
        kill_process_tree(&mut alive);
    }
}

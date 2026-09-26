//! Quit-time and startup-time lifecycle for the machine-wide clio-core shared
//! daemon (`clio_run`), keyed off the host client registry
//! [`crate::clio_core_registry`] reads (issue #D1).
//!
//! There is exactly ONE clio-core daemon per machine (fixed ports, host-global
//! state under `~/.clio`); every clio-agent process on it — this desktop's
//! managed backend, a CLI, a dev server — shares it and registers itself as a
//! client. The daemon is normally released by the Python server's own
//! `atexit` hook (`clio_agent.arc.storage.release_runtime_client`) on a
//! graceful shutdown, but `supervisor_shutdown`'s `owned_descendants` sweep
//! deliberately SPARES `clio_run.exe` from the force-kill tree — so if the
//! graceful request stalls past `GRACEFUL_SHUTDOWN_STALL` and this desktop
//! falls through to `TerminateProcess` on its own backend, that backstop
//! never runs and the daemon is orphaned. This module is the second line of
//! defense: after the server process is confirmed gone (either path), check
//! the registry ourselves and stop the daemon if nothing is left attached.
//!
//! Best-effort by design, the same posture as `installer_runtime_stop`'s
//! pre-upgrade sweep: no cross-process advisory lock is taken here (unlike
//! the Python writer's own `filelock`-guarded spawn/release lock at
//! `<state_dir>/clio-runtime.lock`) — reproducing that lock's exact on-disk
//! protocol from Rust was judged not worth the risk of a subtly incompatible
//! implementation racing the real one. The accepted race window — a new
//! client registers in the instant between this reading "zero live clients"
//! and issuing the stop — is narrow and self-healing: that client's own
//! connect-or-spawn retry simply spawns a fresh daemon, exactly the same
//! outcome as attaching to one that had never started. Every decision this
//! module makes is reported back to the caller as a typed [`DaemonOutcome`]
//! for the boot log, never a silent no-op.

use std::path::Path;
use std::time::Duration;

use crate::clio_core_registry::{self, DaemonPid};

/// How long a clean `<clio_run> stop` gets to finish before falling back to a
/// hard kill. Mirrors `installer_runtime_stop::CLEAN_STOP_TIMEOUT` (the same
/// daemon, the same clean-stop handshake); kept as its own constant here
/// since that one is private to its module and this is a distinct call site.
#[cfg(windows)]
const WINDOWS_CLEAN_STOP_CONFIRM_TIMEOUT: Duration = Duration::from_millis(500);
/// Per-process cap on waiting for the hard kill to actually take effect.
#[cfg(windows)]
const WINDOWS_TERMINATE_WAIT_TIMEOUT: Duration = Duration::from_secs(10);
/// Unix clean-stop grace before escalating from SIGTERM to SIGKILL.
#[cfg(unix)]
const UNIX_CLEAN_STOP_TIMEOUT: Duration = Duration::from_secs(3);
/// Unix cap on waiting for SIGKILL to actually take effect.
#[cfg(unix)]
const UNIX_TERMINATE_WAIT_TIMEOUT: Duration = Duration::from_secs(10);
#[cfg(unix)]
const UNIX_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// What a daemon-lifecycle check actually did — surfaced to the boot log so a
/// support bundle shows the decision instead of a silent guess (the
/// no-silent-fallback discipline `clio_agent`'s own daemon-lifecycle modules
/// document as `#897`/`#891`-style typed reasons, mirrored here for the Rust
/// side of the same seam).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DaemonOutcome {
    /// No daemon pidfile, or the recorded PID is already dead — nothing to
    /// do. The pidfile is pruned in the dead-PID case.
    AlreadyGone,
    /// At least one OTHER client is still registered live; the daemon was
    /// left running for it.
    LiveClientsPresent(Vec<u32>),
    /// Zero live clients; the daemon was asked to stop cleanly and confirmed
    /// gone without needing a hard kill.
    StoppedCleanly(u32),
    /// Zero live clients; the clean stop did not confirm in time (or this
    /// platform has no clean-stop path) and the daemon was hard-killed.
    StoppedByForce(u32),
}

/// Quit-time release: prune the client registry, and if this desktop's own
/// exit leaves NOTHING registered, stop the shared daemon (clean stop first,
/// then a hard-kill fallback). Idempotent and race-free with the server's own
/// graceful `atexit` release: an already-gone daemon, or one a concurrent
/// client's release already stopped, resolves to [`DaemonOutcome::AlreadyGone`]
/// rather than an error.
///
/// `state_dir` is the resolved clio-core host state directory; callers
/// resolve it once (`clio_core_registry::runtime_state_dir`) and pass it in
/// explicitly — this function never reads the environment itself, so a test
/// can point it at an isolated temp directory instead of the real `~/.clio`.
pub(crate) fn release_idle_daemon_on_quit(state_dir: &Path) -> DaemonOutcome {
    decide_and_act(state_dir)
}

/// Startup orphan cleanup: if the daemon is running with ZERO live clients (a
/// crash left it behind), stop it before this desktop spawns its own managed
/// backend, so that backend's connect-or-spawn creates a FRESH daemon against
/// the CURRENT config instead of attaching to a stale orphan. A daemon with
/// live clients is left alone — the caller attaches to it normally.
///
/// Shares the exact same decision + stop sequence as
/// [`release_idle_daemon_on_quit`] (an orphan is, by definition, a daemon
/// nothing is attached to — the same state a normal quit leaves behind), kept
/// as a separate entry point only so each call site logs its own framing.
pub(crate) fn stop_orphaned_daemon_before_boot(state_dir: &Path) -> DaemonOutcome {
    decide_and_act(state_dir)
}

fn decide_and_act(state_dir: &Path) -> DaemonOutcome {
    let live = clio_core_registry::prune_and_list_live_clients(state_dir);
    if !live.is_empty() {
        return DaemonOutcome::LiveClientsPresent(live);
    }
    let Some(daemon) = clio_core_registry::read_daemon_pidfile(state_dir) else {
        return DaemonOutcome::AlreadyGone;
    };
    if !clio_core_registry::pid_is_alive(daemon.pid, daemon.created_at) {
        clio_core_registry::remove_daemon_pidfile(state_dir);
        return DaemonOutcome::AlreadyGone;
    }
    let outcome = stop_daemon(&daemon);
    clio_core_registry::remove_daemon_pidfile(state_dir);
    outcome
}

fn stop_daemon(daemon: &DaemonPid) -> DaemonOutcome {
    #[cfg(windows)]
    {
        windows_stop_daemon(daemon)
    }
    #[cfg(unix)]
    {
        unix_stop_daemon(daemon)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = daemon;
        DaemonOutcome::AlreadyGone
    }
}

/// Clean-stop-then-kill on Windows, reusing the exact FFI wrappers
/// `installer_runtime_stop`'s pre-upgrade sweep already uses against this
/// same `clio_run.exe` binary: resolve its own image path from the PID,
/// spawn `<path> stop`, confirm via a fresh liveness probe (not the helper's
/// own exit code — `clio_run stop` reporting success and the daemon actually
/// releasing its socket are not perfectly atomic), then `TerminateProcess` +
/// wait if it is still alive.
///
/// Every confirmation probe below is cross-checked against
/// `daemon.created_at` (captured from the registry BEFORE any of this ran),
/// never a bare `pid_is_alive(pid, None)` — without that, a PID freed by the
/// real stop and immediately reused by some unrelated new process (this
/// module's own test suite reproduced exactly that under a busy box) would
/// read back as "still alive" and this would report `StoppedByForce` after
/// actually hard-killing a completely different process it never meant to
/// touch. `daemon.created_at` being `None` (the registry recorded no
/// creation time) is the one case this can't defend — the same accepted gap
/// the Python writer itself has when `psutil` cannot capture a creation time.
#[cfg(windows)]
fn windows_stop_daemon(daemon: &DaemonPid) -> DaemonOutcome {
    use crate::installer_runtime_stop::{
        windows_full_image_path, windows_terminate_and_wait, windows_try_clean_stop,
    };

    let pid = daemon.pid;
    if let Some(exe_path) = windows_full_image_path(pid) {
        windows_try_clean_stop(Path::new(&exe_path));
        // The clean-stop helper already waited out its own timeout; a short
        // extra grace covers the same non-atomicity `arc/runtime_stop.py`
        // documents between "the helper exited" and "the port is free".
        let deadline = std::time::Instant::now() + WINDOWS_CLEAN_STOP_CONFIRM_TIMEOUT;
        while std::time::Instant::now() < deadline {
            if !clio_core_registry::pid_is_alive(pid, daemon.created_at) {
                return DaemonOutcome::StoppedCleanly(pid);
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
    windows_terminate_and_wait(pid, WINDOWS_TERMINATE_WAIT_TIMEOUT);
    DaemonOutcome::StoppedByForce(pid)
}

/// Clean-stop-then-kill on Unix: no bundled `clio_run` exe-path resolution
/// exists on this platform in this crate today (that would need `/proc`
/// parsing on Linux or a `sysctl`/`proc_pidpath` FFI on macOS — out of scope
/// for this pass, matching the same platform-scoping precedent
/// `clio_core_registry::pid_is_alive` documents), so this goes straight to
/// SIGTERM-then-SIGKILL rather than attempting `clio_run stop` by exe path.
/// See `windows_stop_daemon`'s doc comment for why every confirmation below
/// is cross-checked against `daemon.created_at` instead of `None`.
#[cfg(unix)]
fn unix_stop_daemon(daemon: &DaemonPid) -> DaemonOutcome {
    let pid = daemon.pid as libc::pid_t;
    unsafe {
        libc::kill(pid, libc::SIGTERM);
    }
    if unix_wait_for_exit(pid, daemon.created_at, UNIX_CLEAN_STOP_TIMEOUT) {
        return DaemonOutcome::StoppedCleanly(pid as u32);
    }
    unsafe {
        libc::kill(pid, libc::SIGKILL);
    }
    unix_wait_for_exit(pid, daemon.created_at, UNIX_TERMINATE_WAIT_TIMEOUT);
    DaemonOutcome::StoppedByForce(pid as u32)
}

#[cfg(unix)]
fn unix_wait_for_exit(pid: libc::pid_t, created_at: Option<f64>, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        if !clio_core_registry::pid_is_alive(pid as u32, created_at) {
            return true;
        }
        std::thread::sleep(UNIX_POLL_INTERVAL);
    }
    !clio_core_registry::pid_is_alive(pid as u32, created_at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::{Child, Command, Stdio};

    fn temp_state_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "clio-core-daemon-test-{label}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(clio_core_registry::CLIENT_REGISTRY_DIR_NAME))
            .expect("create isolated temp state dir + clients subdir");
        dir
    }

    /// A dummy long-running process standing in for `clio_run.exe` — never a
    /// real clio-core daemon. `cmd /C ping ...` on Windows keeps `cmd.exe`
    /// itself alive as the direct child for the duration (it waits on its
    /// own `ping` grandchild), giving a real, resolvable executable path for
    /// `windows_full_image_path` to find — the same shape
    /// `supervisor_state.rs`'s own `spawn_sleeper` test helper uses.
    fn spawn_dummy_daemon() -> Child {
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
            .expect("spawn dummy stand-in daemon process")
    }

    /// Kill `daemon` AND any descendants it spawned (its `ping` grandchild on
    /// Windows), then reap it, so a test never leaves a process running past
    /// its own scope.
    ///
    /// `Child::kill` alone only reaches the direct child (`cmd.exe`) — its
    /// `ping` grandchild is a completely separate process Windows does not
    /// cascade-terminate, so it would otherwise sit alive for its own 300s
    /// duration after every test that spawns one. This is exactly the W4
    /// hardening finding `supervisor_shutdown.rs` fixes for the real
    /// launcher/backend tree; this test-only helper applies the same
    /// Toolhelp-snapshot + descendant walk at a much smaller scale.
    fn kill_dummy_daemon_tree(daemon: &mut Child) {
        #[cfg(windows)]
        {
            // Two passes with a short gap: `cmd /C ping ...` has not
            // necessarily finished launching its `ping` grandchild by the
            // moment this runs (a race observed under the crate's default
            // multi-threaded `cargo test`, not just `--test-threads=1`), so a
            // single snapshot can miss it. The second pass catches a
            // grandchild that only appeared in that gap.
            for attempt in 0..2 {
                if attempt == 1 {
                    std::thread::sleep(Duration::from_millis(50));
                }
                windows_kill_descendants(daemon.id());
            }
        }
        let _ = daemon.kill();
        let _ = daemon.wait();
    }

    /// Terminate every live descendant of `pid` (best-effort; see
    /// `kill_dummy_daemon_tree`).
    #[cfg(windows)]
    fn windows_kill_descendants(pid: u32) {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };

        let snapshot = crate::supervisor_shutdown::windows_process_snapshot();
        let descendants = crate::supervisor_shutdown::owned_descendants(&snapshot, &[pid]);
        for descendant in descendants {
            let handle = unsafe { OpenProcess(PROCESS_TERMINATE, 0, descendant) };
            if !handle.is_null() {
                unsafe {
                    TerminateProcess(handle, 1);
                    CloseHandle(handle);
                }
            }
        }
    }

    /// Write a pidfile the way the Python side actually does: PID plus its
    /// real creation time when this platform can read one. Recording the
    /// real creation time (rather than leaving it blank) is what lets every
    /// later liveness re-check defeat PID reuse — a plain bare-PID pidfile
    /// is exactly what let `quit_with_no_clients_stops_the_dummy_daemon` read
    /// back "still alive" after the real dummy daemon had already been
    /// killed and its PID reused by an unrelated process spawned later in
    /// this same test run.
    fn write_daemon_pidfile(state_dir: &Path, pid: u32) {
        let created_at = clio_core_registry::process_created_at(pid);
        let content = match created_at {
            Some(ts) => format!("{pid} {ts}"),
            None => pid.to_string(),
        };
        fs::write(
            state_dir.join(clio_core_registry::DAEMON_PIDFILE_NAME),
            content,
        )
        .expect("write dummy daemon pidfile");
    }

    fn register_live_client(state_dir: &Path, pid: u32) {
        fs::write(
            state_dir
                .join(clio_core_registry::CLIENT_REGISTRY_DIR_NAME)
                .join(pid.to_string()),
            "",
        )
        .expect("register dummy live client");
    }

    #[test]
    fn already_gone_when_no_pidfile() {
        let dir = temp_state_dir("no-pidfile");
        assert_eq!(
            release_idle_daemon_on_quit(&dir),
            DaemonOutcome::AlreadyGone
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn already_gone_and_prunes_a_stale_pidfile() {
        let dir = temp_state_dir("stale-pidfile");
        // A deliberately implausible, certainly-dead PID — see
        // `clio_core_registry::tests::dead_pid` for why this is a fixed
        // sentinel rather than a spawned-then-waited process (PID-reuse
        // races under a busy test suite made that flaky).
        let dead_pid: u32 = 1_999_999_999;
        write_daemon_pidfile(&dir, dead_pid);

        assert_eq!(
            release_idle_daemon_on_quit(&dir),
            DaemonOutcome::AlreadyGone
        );
        assert!(
            !dir.join(clio_core_registry::DAEMON_PIDFILE_NAME).exists(),
            "a stale pidfile pointing at a dead PID must be pruned"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// Whether the ORIGINALLY-SPAWNED `daemon` child has exited, checked via
    /// its own already-held `Child` handle (`try_wait`) rather than a fresh
    /// `pid_is_alive(pid, ...)` re-open by PID.
    ///
    /// This distinction is load-bearing, not stylistic: `pid_is_alive`
    /// re-opens the OS PID number from scratch, so on a busy box a brand-new,
    /// completely unrelated process can be assigned that exact PID within
    /// milliseconds of the real one exiting — and its creation time then
    /// falls inside `pid_is_alive`'s own ~1s PID-reuse tolerance too, since
    /// this whole spawn-stop-verify sequence completes in well under a
    /// second. `Child::try_wait` has no such gap: it reads the exit status of
    /// the EXACT kernel process object this test's own `CreateProcess` call
    /// produced, so a reused PID number elsewhere can never fool it. This
    /// was the actual root cause behind this test flaking even after the
    /// creation-time cross-check was added to `pid_is_alive` itself.
    fn daemon_has_exited(daemon: &mut Child) -> bool {
        matches!(daemon.try_wait(), Ok(Some(_)))
    }

    #[test]
    fn live_client_keeps_the_daemon_running() {
        let dir = temp_state_dir("live-client-keeps-daemon");
        let mut daemon = spawn_dummy_daemon();
        write_daemon_pidfile(&dir, daemon.id());
        // The registered "client" is this very test process — unambiguously
        // alive for the whole test, no coordination needed.
        register_live_client(&dir, std::process::id());

        let outcome = release_idle_daemon_on_quit(&dir);

        assert_eq!(
            outcome,
            DaemonOutcome::LiveClientsPresent(vec![std::process::id()])
        );
        assert!(
            !daemon_has_exited(&mut daemon),
            "the dummy daemon must be left running while a live client is registered"
        );

        kill_dummy_daemon_tree(&mut daemon);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn quit_with_no_clients_stops_the_dummy_daemon() {
        let dir = temp_state_dir("quit-stops-daemon");
        let mut daemon = spawn_dummy_daemon();
        let pid = daemon.id();
        write_daemon_pidfile(&dir, pid);

        let outcome = release_idle_daemon_on_quit(&dir);

        assert!(
            matches!(
                outcome,
                DaemonOutcome::StoppedCleanly(p) | DaemonOutcome::StoppedByForce(p) if p == pid
            ),
            "expected the dummy daemon to be stopped, got {outcome:?}"
        );
        assert!(
            daemon_has_exited(&mut daemon),
            "the dummy daemon must actually be gone"
        );
        assert!(!dir.join(clio_core_registry::DAEMON_PIDFILE_NAME).exists());

        // Best-effort: if the clean-stop-attempt path somehow left it alive
        // (it should not), do not leak a process on the test box.
        kill_dummy_daemon_tree(&mut daemon);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn startup_orphan_cleanup_stops_a_zero_client_daemon() {
        let dir = temp_state_dir("startup-orphan-cleanup");
        let mut daemon = spawn_dummy_daemon();
        let pid = daemon.id();
        write_daemon_pidfile(&dir, pid);

        let outcome = stop_orphaned_daemon_before_boot(&dir);

        assert!(
            matches!(
                outcome,
                DaemonOutcome::StoppedCleanly(p) | DaemonOutcome::StoppedByForce(p) if p == pid
            ),
            "expected the orphaned dummy daemon to be stopped before boot, got {outcome:?}"
        );
        assert!(daemon_has_exited(&mut daemon));

        kill_dummy_daemon_tree(&mut daemon);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn startup_orphan_cleanup_leaves_a_daemon_with_live_clients() {
        let dir = temp_state_dir("startup-leaves-live");
        let mut daemon = spawn_dummy_daemon();
        write_daemon_pidfile(&dir, daemon.id());
        register_live_client(&dir, std::process::id());

        let outcome = stop_orphaned_daemon_before_boot(&dir);

        assert_eq!(
            outcome,
            DaemonOutcome::LiveClientsPresent(vec![std::process::id()])
        );
        assert!(!daemon_has_exited(&mut daemon));

        kill_dummy_daemon_tree(&mut daemon);
        let _ = fs::remove_dir_all(&dir);
    }
}

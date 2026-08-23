//! Shutdown: the final stage of the sidecar lifecycle.
//!
//! Reaps the launcher and its sidecar descendants as a process tree
//! (SIGTERM-then-SIGKILL grace, `taskkill /T` on Windows) so spawned
//! clio-agent processes don't leak when the app exits or restarts.

use std::{
    process::Child,
    thread,
    time::{Duration, Instant},
};

/// Grace period between SIGTERM (or graceful kill on Windows) and SIGKILL.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);

/// Best-effort reap of the launcher and any sidecar descendants.
///
/// The launcher can spawn the real `clio-agent-gact` process underneath it.
/// Reaping just the direct child leaks that grandchild on some platforms, so
/// shutdown targets the process tree/group before waiting for the launcher.
pub(crate) fn reap_child_tree(mut child: Child) {
    // Windows: kill the tree (launcher + clio-agent-gact + uvicorn workers).
    // taskkill /T walks the child-process tree; /F because there is no
    // SIGTERM equivalent to deliver first.
    #[cfg(windows)]
    {
        use std::process::{Command, Stdio};

        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    // Unix: spawn_and_probe places the launcher and its descendants into a
    // dedicated process group. Kill that group so workers cannot outlive the
    // Tauri shell.
    #[cfg(unix)]
    terminate_process_group(child.id(), libc::SIGTERM);

    #[cfg(not(any(windows, unix)))]
    let _ = child.kill();

    let deadline = Instant::now() + SHUTDOWN_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                #[cfg(unix)]
                terminate_process_group(child.id(), libc::SIGKILL);
                break;
            }
            Ok(None) if Instant::now() >= deadline => {
                #[cfg(unix)]
                terminate_process_group(child.id(), libc::SIGKILL);
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
}

#[cfg(unix)]
fn terminate_process_group(pid: u32, signal: libc::c_int) {
    let pgid = pid as libc::pid_t;
    // Negative pid targets the process group whose id equals `pid`.
    unsafe {
        let _ = libc::kill(-pgid, signal);
    }
}

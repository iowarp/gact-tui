//! Spawn: the "spawn" stage of the sidecar lifecycle.
//!
//! Allocates a free port + bearer token, launches the sidecar via the
//! launcher (teeing output to the boot log), then calls the probe; maps
//! the launcher's exit-2 to `NeedsInstall` for the first-run flow.

use rand::RngCore;
use std::{
    io::{self, BufRead, BufReader},
    path::Path,
    process::Child,
    thread,
};

use crate::net_util::pick_free_port;
use crate::supervisor_boot_log::boot_log_line;
use crate::supervisor_probe::probe_capabilities;
use crate::supervisor_spawn_command::{launcher_spawn_command, LAUNCHER_HOST};
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Launcher exit code meaning "clio-agent-gact could not be resolved".
/// Must stay in lockstep with `exitNotFound` in
/// `apps/desktop/sidecar-launcher/main.go`.
pub(crate) const LAUNCHER_EXIT_NOT_FOUND: i32 = 2;

/// Reasons `spawn_and_probe` can fail. `NeedsInstall` is carved out from the
/// generic error so the supervisor can route the launcher's exit-2
/// ("clio-agent-gact not found") to the first-run auto-install flow instead
/// of the manual error card.
#[derive(Debug)]
pub(crate) enum SpawnError {
    /// The launcher exited with [`LAUNCHER_EXIT_NOT_FOUND`]: no clio install.
    NeedsInstall,
    /// Any other failure (port allocation, spawn failure, probe timeout while
    /// the launcher is still running, ...).
    Other(String),
}

impl From<String> for SpawnError {
    fn from(s: String) -> Self {
        SpawnError::Other(s)
    }
}

pub(crate) fn spawn_and_probe(launcher: &Path) -> Result<(BackendHandle, Child), SpawnError> {
    let port = pick_free_port().map_err(|e| format!("port allocation failed: {e}"))?;
    let token = generate_token();
    let url = format!("http://{LAUNCHER_HOST}:{port}");

    boot_log_line(&format!(
        "spawning launcher {launcher:?} on {LAUNCHER_HOST}:{port}"
    ));
    let mut command = launcher_spawn_command(launcher, port, &token);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;

        unsafe {
            command.pre_exec(|| {
                if libc::setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(io::Error::last_os_error())
                }
            });
        }
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("spawn launcher {launcher:?}: {e}"))?;

    // Tee child stdout/stderr to the boot log on background threads so a
    // full pipe buffer can't deadlock the probe below.
    if let Some(out) = child.stdout.take() {
        thread::spawn(move || tee_to_boot_log(BufReader::new(out)));
    }
    if let Some(err) = child.stderr.take() {
        thread::spawn(move || tee_to_boot_log(BufReader::new(err)));
    }

    match probe_capabilities(&url, &token) {
        Ok(()) => {
            boot_log_line("sidecar answered /v1/capabilities — backend ready");
            Ok((
                BackendHandle {
                    url,
                    bearer_token: token,
                    status: BackendStatus::Ready,
                },
                child,
            ))
        }
        Err(probe_err) => {
            // The probe failed. Distinguish "the launcher already exited 2
            // because clio isn't installed" (-> NeedsInstall, one-swoop) from
            // any other failure (-> Error). The launcher mirrors clio's exit
            // code, so a still-running child means clio is up but unhealthy.
            match child.try_wait() {
                Ok(Some(status)) if status.code() == Some(LAUNCHER_EXIT_NOT_FOUND) => {
                    Err(SpawnError::NeedsInstall)
                }
                _ => {
                    // Best-effort reap so a half-started launcher isn't leaked.
                    let _ = child.kill();
                    let _ = child.wait();
                    Err(SpawnError::Other(probe_err))
                }
            }
        }
    }
}

fn generate_token() -> String {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

/// Read a child stream line-by-line and append each to the persisted boot
/// log. Used for the launcher's stdout/stderr during the spawn path (no
/// frontend events — that stream is the install flow's job).
fn tee_to_boot_log<B: BufRead>(reader: B) {
    for line in reader.lines() {
        let Ok(line) = line else { break };
        boot_log_line(&line);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_has_expected_shape() {
        let t = generate_token();
        assert_eq!(t.len(), 64, "expected 32-byte hex token");
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn two_tokens_differ() {
        let a = generate_token();
        let b = generate_token();
        assert_ne!(a, b, "tokens must not collide");
    }

    #[test]
    fn pick_free_port_returns_nonzero() {
        let p = pick_free_port().expect("port pick");
        assert!(p >= 1024, "ephemeral ports are above 1024");
    }

    /// The not-found exit code we route to NeedsInstall must equal the Go
    /// launcher's `exitNotFound` constant. (Asserted directly in the Rust
    /// build; a drift here means the launcher's contract changed.)
    #[test]
    fn not_found_exit_code_matches_launcher_contract() {
        assert_eq!(LAUNCHER_EXIT_NOT_FOUND, 2);
    }
}

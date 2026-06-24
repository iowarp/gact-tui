//! Sidecar lifecycle supervisor (Wave 0c).
//!
//! On app launch the supervisor:
//!   1. Allocates a free localhost port (ephemeral-bind + release).
//!   2. Generates a 32-byte bearer token (hex-encoded; 64 chars).
//!   3. Locates the bundled launcher binary
//!      (`binaries/clio-agent-<triple>{.exe}`).
//!   4. Spawns the launcher with `--host 127.0.0.1 --port N --token T`.
//!   5. Polls `http://127.0.0.1:N/v1/capabilities` with the `Authorization:
//!      Bearer T` header until 200 (≤ 30 s).
//!   6. Holds the child handle in an `Arc<Mutex<…>>` shared via Tauri's
//!      managed state so the `get_backend` command can read it and the
//!      shutdown hook can reap it.
//!
//! Failure modes are surfaced as `BackendStatus::Error(message)` so the
//! frontend Splash screen can render a recoverable error card with the
//! upstream install hint.
//!
//! First-run "one swoop": when the launcher exits code 2 ("clio-agent-gact
//! not found") the supervisor reports `BackendStatus::NeedsInstall` instead
//! of a generic error. The frontend reacts by invoking the `install_clio`
//! Tauri command, which runs the same upstream install script the user
//! would run manually, streaming progress back as Tauri events.

use std::{path::PathBuf, thread};

use crate::supervisor_boot::boot_sidecar;
pub use crate::supervisor_launcher::locate_launcher;
use crate::supervisor_state::SupervisorState;
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Internal state owned by the Tauri runtime.
pub struct Supervisor {
    state: SupervisorState,
}

impl Supervisor {
    /// Creates a supervisor placeholder in the `Starting` state. The actual
    /// spawn happens in `start()` so callers can register the supervisor in
    /// managed state first and then kick off the spawn asynchronously.
    pub fn new() -> Self {
        Self {
            state: SupervisorState::new_starting(),
        }
    }

    /// Reads the current backend handle (cheap clone of a small struct).
    pub fn snapshot(&self) -> BackendHandle {
        self.state.snapshot()
    }

    /// Records a startup error without spawning anything. Used when the
    /// launcher binary can't be located at all.
    pub fn set_error(&self, msg: String) {
        self.state.set_error(msg);
    }

    /// Kicks off the sidecar in a worker thread and updates state
    /// in-place as it transitions Starting → Ready/Error.
    ///
    /// Attach-first behaviour: if a healthy `clio-agent-gact` is already
    /// answering on the conventional `:17800` port (the `clio start`
    /// default), we attach to it rather than spawn a second one. That
    /// keeps the user's existing LM configuration (ALCF / OpenAI / etc.)
    /// in play without us needing to mirror their env.
    pub fn start(&self, launcher: PathBuf) {
        let state = self.state.clone();
        thread::spawn(move || {
            boot_sidecar(state, launcher);
        });
    }

    /// Reset the handle to `Starting` and re-run the spawn pipeline. Used by
    /// the one-swoop install flow: after the installer exits 0, the
    /// supervisor restarts so the now-resolvable `clio-agent-gact` is picked
    /// up and the frontend's `get_backend` re-poll sees Starting → Ready.
    ///
    /// Re-locates the launcher (it never moves, but this keeps the missing-
    /// launcher failure mode identical to first boot) and reaps any prior
    /// child first.
    pub fn restart(&self) {
        // Reap a stale child (e.g. a half-started launcher) before re-spawning.
        self.shutdown();
        let launcher = match locate_launcher() {
            Ok(p) => p,
            Err(e) => {
                self.set_error(format!(
                    "sidecar launcher missing after install: {e}. Run `pnpm fetch-sidecar` and rebuild."
                ));
                return;
            }
        };
        self.state.set_status(BackendStatus::Starting);
        self.start(launcher);
    }

    /// Best-effort reap of the child process on app shutdown.
    ///
    /// W4 hardening finding: the child we spawn is the Go *launcher*, which
    /// in turn spawns the real `clio-agent-gact` (Python/uvicorn) as ITS
    /// child. On Windows, `Child::kill` is TerminateProcess on the launcher
    /// only — the grandchild kept running, leaking a clio process every
    /// time the app closed. The fix kills the whole process TREE.
    pub fn shutdown(&self) {
        self.state.shutdown();
    }
}

impl Default for Supervisor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::supervisor_spawn::spawn_and_probe;
    use std::time::Duration;

    /// W4 hardening: the SPAWN path + shutdown reaping, end-to-end.
    ///
    /// Spawns the real Go launcher (which resolves a real clio-agent-gact —
    /// on the dev box via the repo-local develop install), waits until the
    /// sidecar answers /v1/capabilities with the generated bearer token,
    /// then reaps it through Supervisor::shutdown and asserts the port
    /// actually stops answering (no orphaned sidecar).
    ///
    /// Soft-skips when the launcher binary or a resolvable clio-agent-gact
    /// is absent (e.g. CI without `pnpm fetch-sidecar` / no clio install) —
    /// those environments can't exercise the spawn path at all.
    #[test]
    fn spawn_path_launches_probes_and_reaps() {
        let launcher = match locate_launcher() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("skip: {e}");
                return;
            }
        };
        let (handle, child) = match spawn_and_probe(&launcher) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("skip: spawn failed (no resolvable clio-agent-gact?): {e:?}");
                return;
            }
        };

        // The sidecar is up: spawn_and_probe proved /v1/capabilities answers
        // 200. (Note: clio's auth model is trust_socket — localhost requests
        // are accepted with or without the bearer token, so there is no
        // negative-auth assertion to make here; the token only matters for
        // non-localhost transports.)

        // Reap through the same path the app shutdown uses.
        let sup = Supervisor::new();
        sup.state.set_handle_and_child(handle.clone(), child);
        sup.shutdown();

        // After reaping, the port stops answering entirely (transport error,
        // not an HTTP status) — i.e. no orphaned process holds the socket.
        let after = ureq::get(&format!("{}/v1/capabilities", handle.url))
            .timeout(Duration::from_secs(2))
            .call();
        assert!(
            matches!(after, Err(ureq::Error::Transport(_))),
            "sidecar port still answering after shutdown reap: {after:?}"
        );
    }
}

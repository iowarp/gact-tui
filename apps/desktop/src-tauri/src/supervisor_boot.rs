//! Boot orchestrator: the top of the sidecar lifecycle.
//!
//! Drives attach→spawn→probe in order — try to attach to an existing
//! local server, else spawn+probe our own — and routes a launcher
//! exit-2 to the first-run install flow, recording the outcome in state.

use std::path::PathBuf;

use crate::supervisor_attach::try_attach_existing;
use crate::supervisor_boot_log::{boot_log_line, reset_boot_log};
use crate::supervisor_spawn::{spawn_and_probe, SpawnError};
use crate::supervisor_state::SupervisorState;
use crate::supervisor_types::BackendStatus;

pub(crate) fn boot_sidecar(state: SupervisorState, launcher: PathBuf) {
    // Fresh transcript for this boot attempt so a later failure's
    // "Open logs" shows only the relevant run.
    reset_boot_log("boot");

    // 1. Attach to an existing local server if reachable.
    if let Some(handle) = try_attach_existing() {
        boot_log_line("attached to an existing clio-agent on the conventional port");
        state.set_handle(handle);
        return;
    }

    // 2. Otherwise spawn our own.
    let outcome = spawn_and_probe(&launcher);
    match outcome {
        Ok((handle, child)) => {
            state.set_handle_and_child(handle, child);
        }
        // The launcher exited 2 ("clio-agent-gact not found"): this is
        // a fresh install, not a broken one. Surface NeedsInstall so the
        // frontend auto-runs install_clio (one swoop) instead of the
        // manual error card.
        Err(SpawnError::NeedsInstall) => {
            boot_log_line("launcher reported clio-agent-gact is not installed (exit 2)");
            state.set_status(BackendStatus::NeedsInstall);
        }
        Err(SpawnError::Other(e)) => {
            boot_log_line(&format!("boot failed: {e}"));
            state.set_status(BackendStatus::Error(e));
        }
    }
}

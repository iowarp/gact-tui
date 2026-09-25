//! Boot orchestrator: the top of the sidecar lifecycle.
//!
//! Managed brands drive attach→spawn→probe in order — try to attach to an
//! existing local server, else spawn+probe our own — and route a launcher
//! exit-2 to the first-run install flow. Connect-mode brands (the neutral
//! default) attach-only: they own no launcher, so a missing backend is a
//! "start your backend" message, not a failure. The outcome is recorded in
//! state either way.

use std::path::PathBuf;

use crate::brand_backend::connect_mode_error;
use crate::clio_core_daemon::{self, DaemonOutcome};
use crate::clio_core_registry;
use crate::runtime_pack::prepare_bundled_runtime;
use crate::supervisor_attach::try_attach_existing;
use crate::supervisor_boot_log::{boot_log_line, reset_boot_log};
use crate::supervisor_spawn::{spawn_and_probe, SpawnError};
use crate::supervisor_state::SupervisorState;
use crate::supervisor_types::{BackendStartupStage, BackendStatus};

pub(crate) fn boot_sidecar(
    state: SupervisorState,
    launcher: PathBuf,
    working_dir: Option<PathBuf>,
    user_dir: Option<PathBuf>,
    runtime_resource_dir: Option<PathBuf>,
    app_local_data_dir: Option<PathBuf>,
) {
    // Fresh transcript for this boot attempt so a later failure's
    // "Open logs" shows only the relevant run.
    reset_boot_log("boot");

    // 1. Attach to an existing local server if reachable.
    state.set_status(BackendStatus::Starting(
        BackendStartupStage::CheckingExisting,
    ));
    if let Some(handle) = try_attach_existing() {
        boot_log_line("attached to an existing backend on the conventional port");
        state.set_handle(handle);
        return;
    }

    // 2. We're about to spawn our OWN backend: clean up a crashed-desktop
    // orphan first, so its connect-or-spawn attaches to a FRESH clio-core
    // daemon (current config) instead of a stale one nothing is using. A
    // daemon with live clients (another CLI, a dev server) is left alone.
    stop_orphaned_daemon_before_own_boot();

    // 3. Otherwise prepare the bundled runtime. Windows bundles carry one
    // compressed archive instead of tens of thousands of NSIS file entries.
    let bundled_runtime = match (
        runtime_resource_dir.as_deref(),
        app_local_data_dir.as_deref(),
    ) {
        (Some(resource_dir), Some(app_data_dir)) => {
            state.set_status(BackendStatus::Starting(
                BackendStartupStage::InstallingRuntime,
            ));
            match prepare_bundled_runtime(resource_dir, app_data_dir) {
                Ok(runtime) => runtime,
                Err(error) => {
                    let message = format!("prepare bundled runtime: {error}");
                    boot_log_line(&message);
                    state.set_status(BackendStatus::Error(message));
                    return;
                }
            }
        }
        _ => None,
    };

    // 4. Spawn our own.
    state.set_status(BackendStatus::Starting(
        BackendStartupStage::StartingService,
    ));
    if let Some(dir) = working_dir.as_deref() {
        boot_log_line(&format!("managed backend workspace={dir:?}"));
    }
    if let Some(dir) = user_dir.as_deref() {
        boot_log_line(&format!("managed backend user_dir={dir:?}"));
    }
    let outcome = spawn_and_probe(
        &launcher,
        working_dir.as_deref(),
        user_dir.as_deref(),
        bundled_runtime.as_deref(),
    );
    match outcome {
        Ok((handle, child)) => {
            state.set_handle_and_child(handle, child);
        }
        // The launcher exited 2 (sidecar not found): this is a fresh install,
        // not a broken one. Surface NeedsInstall so the frontend auto-runs the
        // install (one swoop) instead of the manual error card.
        Err(SpawnError::NeedsInstall) => {
            boot_log_line("launcher reported the sidecar is not installed (exit 2)");
            state.set_status(BackendStatus::NeedsInstall);
        }
        Err(SpawnError::Other(e)) => {
            boot_log_line(&format!("boot failed: {e}"));
            state.set_status(BackendStatus::Error(e));
        }
    }
}

/// Best-effort startup orphan cleanup (issue #D1): if the machine's shared
/// clio-core daemon is running with ZERO live clients — a crash left it
/// behind — stop it before this call site's caller spawns a fresh managed
/// backend, so that backend's own connect-or-spawn creates a new daemon
/// against the CURRENT config rather than attaching to a stale orphan. A
/// daemon with live clients (another CLI, a dev server) is left alone and
/// this desktop's fresh backend attaches to it normally, same as always.
fn stop_orphaned_daemon_before_own_boot() {
    let Some(state_dir) = clio_core_registry::runtime_state_dir() else {
        return;
    };
    match clio_core_daemon::stop_orphaned_daemon_before_boot(&state_dir) {
        DaemonOutcome::AlreadyGone => {}
        DaemonOutcome::LiveClientsPresent(pids) => {
            boot_log_line(&format!(
                "clio-core daemon already running with live client pid(s) {pids:?}; attaching normally"
            ));
        }
        DaemonOutcome::StoppedCleanly(pid) | DaemonOutcome::StoppedByForce(pid) => {
            boot_log_line(&format!(
                "stopped an orphaned clio-core daemon (pid {pid}, zero live clients) before boot"
            ));
        }
    }
}

/// Connect-mode boot: attach to an already-running backend, never spawn or
/// install. Used for brands whose `backend.mode == "connect"` (the neutral
/// default) where the launcher is intentionally absent — a missing backend is
/// NORMAL, so we surface a friendly "start your backend" error instead of
/// `NeedsInstall`.
pub(crate) fn boot_attach_only(state: SupervisorState) {
    reset_boot_log("attach");
    if let Some(handle) = try_attach_existing() {
        boot_log_line("attached to an existing backend on the conventional port");
        state.set_handle(handle);
        return;
    }
    let msg = connect_mode_error();
    boot_log_line(&msg);
    state.set_status(BackendStatus::Error(msg));
}

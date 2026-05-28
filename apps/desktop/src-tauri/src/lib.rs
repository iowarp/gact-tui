//! CLIO Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.

mod supervisor;

use serde::Serialize;
use std::sync::Mutex;
use supervisor::{BackendHandle, Supervisor};

#[derive(Serialize)]
struct HarnessInfo {
    name: &'static str,
    version: &'static str,
    contract: &'static str,
}

#[tauri::command]
fn harness_info() -> HarnessInfo {
    HarnessInfo {
        name: "clio-desktop",
        version: env!("CARGO_PKG_VERSION"),
        contract: "GACT v0.2",
    }
}

/// Frontend mounts on app load and polls this until `status.kind == "ready"`.
#[tauri::command]
fn get_backend(state: tauri::State<'_, Mutex<Supervisor>>) -> BackendHandle {
    state
        .lock()
        .expect("get_backend: supervisor mutex poisoned")
        .snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisor = Supervisor::new();

    // Locate the bundled launcher and kick off the sidecar boot. If the
    // launcher is missing, leave the handle in BackendStatus::Error so the
    // frontend Splash renders a recoverable error card.
    match supervisor::locate_launcher() {
        Ok(launcher) => supervisor.start(launcher),
        Err(e) => supervisor.set_error(format!(
            "sidecar launcher missing: {e}. Run `pnpm fetch-sidecar` and rebuild."
        )),
    }

    let state = Mutex::new(supervisor);

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![harness_info, get_backend])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Reap the sidecar when the last window goes away. Tauri
                // tears down the app loop after this returns.
                use tauri::Manager;
                if let Some(state) = window.app_handle().try_state::<Mutex<Supervisor>>() {
                    if let Ok(s) = state.lock() {
                        s.shutdown();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CLIO desktop application");
}

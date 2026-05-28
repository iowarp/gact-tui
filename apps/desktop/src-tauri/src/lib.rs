//! CLIO Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.
//!
//! Wave 3: also owns SSH tunnel lifecycles + OS notifications + tray.

mod ssh;
mod supervisor;

use serde::Serialize;
use std::sync::Mutex;
use ssh::{TunnelHandle, TunnelManager, TunnelRequest};
use supervisor::{BackendHandle, Supervisor};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

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

/// Open an SSH tunnel for an `ssh-tunnel` backend entry. Returns the
/// local URL the frontend should point its Client at, or an error code
/// the AddRemote wizard can route to a user-actionable message.
#[tauri::command]
fn tunnel_open(
    request: TunnelRequest,
    tunnels: tauri::State<'_, TunnelManager>,
) -> Result<TunnelHandle, String> {
    tunnels.open(request).map_err(|e| e.to_string())
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
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .manage(TunnelManager::new())
        .invoke_handler(tauri::generate_handler![
            harness_info,
            get_backend,
            tunnel_open
        ])
        .setup(|app| {
            // Tray icon with a single "Show / Quit" menu — counts as the
            // platform-native badge surface for `detached sessions` once
            // the live wire grows a session count signal we can push
            // here.
            let show = MenuItem::with_id(app, "show", "Show CLIO", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("clio-tray")
                .tooltip("CLIO Desktop")
                .menu(&menu)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<Mutex<Supervisor>>() {
                    if let Ok(s) = state.lock() {
                        s.shutdown();
                    }
                }
                if let Some(tm) = window.app_handle().try_state::<TunnelManager>() {
                    tm.shutdown_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CLIO desktop application");
}

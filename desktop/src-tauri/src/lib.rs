//! GACT Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.
//!
//! Wave 3: also owns SSH tunnel lifecycles + OS notifications + tray.

mod brand_backend;
mod commands;
mod credentials;
mod gact_http;
mod gact_http_response;
#[cfg(test)]
mod gact_http_tests;
mod infrastructure_setup;
mod installer_options;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod menu;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod menu_spec;
mod net_util;
mod plugins;
mod sidecar_setup;
mod sse_bridge;
mod sse_message;
mod sse_parse;
mod sse_registry;
mod sse_stream;
#[cfg(test)]
mod sse_stream_tests;
mod ssh;
mod ssh_command;
mod ssh_types;
mod supervisor;
mod supervisor_attach;
mod supervisor_boot;
mod supervisor_boot_log;
mod supervisor_boot_log_open;
mod supervisor_install_command;
mod supervisor_install_events;
mod supervisor_installer;
mod supervisor_launcher;
mod supervisor_probe;
mod supervisor_shutdown;
mod supervisor_spawn;
mod supervisor_spawn_command;
mod supervisor_state;
mod supervisor_types;
mod tray;
mod workspace_terminal;

use ssh::TunnelManager;
use std::sync::Mutex;
use supervisor::Supervisor;
use tauri::{Emitter, Manager};

const DESKTOP_RESUMED_EVENT: &str = "clio:desktop-resumed";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisor = Supervisor::new();
    let state = Mutex::new(supervisor);

    let app = tauri::Builder::default()
        // A second launch restores the existing tray-resident process instead
        // of booting another managed backend beside it.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        // Auto-update: pulls the signed latest.json marker from GitHub
        // releases, verifies it against the `plugins.updater.pubkey` in
        // tauri.conf.json, then downloads + installs on demand. The frontend
        // drives the check/install via @tauri-apps/plugin-updater (see
        // web/src/tauri/desktop-updater.ts). DESKTOP-AUTOUPDATE.md documents the
        // CI signing pipeline that produces latest.json.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Lets the frontend relaunch the app into the freshly installed binary
        // after the updater finishes (relaunch() in desktop-updater.ts).
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .manage(TunnelManager::new())
        .manage(sse_registry::SseRegistry::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_backend,
            commands::install_clio,
            commands::repair_clio,
            commands::update_clio,
            commands::open_logs,
            commands::read_logs,
            commands::open_document_path,
            commands::tunnel_open,
            infrastructure_setup::infrastructure_ssh_profiles,
            infrastructure_setup::infrastructure_preflight,
            infrastructure_setup::infrastructure_managed_service_catalog,
            infrastructure_setup::infrastructure_managed_service_action,
            infrastructure_setup::infrastructure_deploy_web_search,
            installer_options::read_installer_options,
            installer_options::complete_installer_web_search,
            credentials::credential_store,
            credentials::credential_read,
            credentials::credential_delete,
            credentials::provider_credential_store,
            credentials::provider_credential_read,
            gact_http::gact_http,
            sse_bridge::gact_sse_open,
            sse_bridge::gact_sse_close,
            plugins::exec_plugin,
            workspace_terminal::open_workspace_terminal
        ])
        .setup(|app| {
            // Resolve + remember the persisted boot-log path FIRST so the
            // supervisor's worker threads (spawn + install/repair streamers)
            // can append to it and the "Open logs" command can reveal it
            // after a failure. Best-effort: a failure here leaves logging a
            // no-op but never blocks boot.
            let _ = supervisor_boot_log::init_boot_log(app.handle());

            // Model runtimes are large and must not be duplicated per workspace,
            // release generation, or executable. Tauri resolves a stable,
            // bundle-scoped cache directory for the current OS user; every
            // managed child inherits these Hugging Face cache variables.
            match app.path().app_cache_dir() {
                Ok(app_cache_dir) => {
                    if let Err(error) = sidecar_setup::install_model_cache_env(&app_cache_dir) {
                        supervisor_boot_log::boot_log_line(&format!(
                            "warning: could not prepare shared model cache: {error}"
                        ));
                    }
                }
                Err(error) => supervisor_boot_log::boot_log_line(&format!(
                    "warning: no platform cache directory, so model downloads are not shared: {error}"
                )),
            }

            // Make the BUNDLED clio runtime (if this build is the bundled
            // installer variant) discoverable by the sidecar launcher on
            // EVERY platform layout. Tauri's resource dir differs per
            // installer: next-to-exe on Windows, Contents/Resources on
            // macOS, /usr/lib/<app>/ on Linux deb/rpm — the last of which
            // the launcher's exe-relative probes (it lives in /usr/bin/)
            // cannot reach. The launcher is spawned as our child, so it
            // inherits this env var; it probes it at top priority.
            if let Ok(resource_dir) = app.path().resource_dir() {
                let _ = sidecar_setup::install_bundled_runtime_env(&resource_dir);
            }

            let app_data = app
                .path()
                .app_local_data_dir()
                .map_err(|error| format!("resolve desktop app-data directory: {error}"))?;
            let desktop_workspace = sidecar_setup::prepare_desktop_workspace(&app_data)
                .map_err(|error| format!("prepare desktop workspace: {error}"))?;
            let desktop_user_dir = sidecar_setup::prepare_desktop_user_dir(&app_data)
                .map_err(|error| format!("prepare desktop user state: {error}"))?;

            // Kick off the backend boot — AFTER the env var above so a spawned
            // launcher sees it. Managed brands locate + spawn the bundled
            // launcher (a missing one is an Error card); connect-mode brands
            // (the neutral default) never own a launcher and attach-only to a
            // user-run backend, surfacing a friendly "start your backend"
            // message instead of treating the absent launcher as a failure.
            {
                let sup = app.state::<Mutex<Supervisor>>();
                let mut sup = supervisor_state::lock_recover(&sup);
                sup.set_working_dir(desktop_workspace);
                sup.set_user_dir(desktop_user_dir);
                if brand_backend::is_managed_install() {
                    match supervisor::locate_launcher() {
                        Ok(launcher) => sup.start(launcher),
                        Err(e) => sup.set_error(sidecar_setup::launcher_missing_message(&e)),
                    }
                } else {
                    sup.start_attach_only();
                }
            }

            tray::install_tray(app)?;

            // macOS keeps the native global application menu. Windows and
            // Linux use the product-owned title bar rendered by the frontend;
            // installing a native menu there creates a second, dated strip.
            // The tray menu above is independent and remains available.
            #[cfg(target_os = "macos")]
            {
                let app_menu = menu::build_menu(app.handle())?;
                app.set_menu(app_menu)?;
                app.on_menu_event(|app, ev| {
                    menu::handle_menu_event(app, ev.id().as_ref());
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Window close means "continue in the tray." Explicit Quit
                // exits the application and reaches the teardown path below.
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Destroyed => shutdown_owned_services(window.app_handle()),
                _ => {}
            }
        })
        .build(tauri::generate_context!());

    let app = match app {
        Ok(app) => app,
        Err(error) => {
            eprintln!("GACT desktop failed to start: {error}");
            std::process::exit(1);
        }
    };
    app.run(|app_handle, event| match event {
        tauri::RunEvent::Resumed => {
            let _ = app_handle.emit(DESKTOP_RESUMED_EVENT, ());
        }
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            shutdown_owned_services(app_handle);
        }
        _ => {}
    });
}

/// Tear down every process and stream owned by this desktop process.
///
/// This is intentionally idempotent because native shutdown can deliver both
/// `ExitRequested` and a final window-destroyed event.
fn shutdown_owned_services(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Mutex<Supervisor>>() {
        // lock_recover, not plain lock(): a poisoned mutex here would silently
        // skip child reaping and leak the sidecar process tree on exit.
        supervisor_state::lock_recover(&state).shutdown();
    }
    if let Some(tm) = app.try_state::<TunnelManager>() {
        tm.shutdown_all();
    }
    if let Some(sse) = app.try_state::<sse_registry::SseRegistry>() {
        sse.stop_all();
    }
}

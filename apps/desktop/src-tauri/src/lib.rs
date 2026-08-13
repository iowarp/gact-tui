//! GACT Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.
//!
//! Wave 3: also owns SSH tunnel lifecycles + OS notifications + tray.

mod brand_backend;
mod commands;
mod gact_http;
mod gact_http_response;
#[cfg(test)]
mod gact_http_tests;
mod menu;
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

use ssh::TunnelManager;
use std::sync::Mutex;
use supervisor::Supervisor;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisor = Supervisor::new();
    let state = Mutex::new(supervisor);

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        // Auto-update: pulls the signed latest.json marker from GitHub
        // releases, verifies it against the `plugins.updater.pubkey` in
        // tauri.conf.json, then downloads + installs on demand. The frontend
        // drives the check/install via @tauri-apps/plugin-updater (see
        // apps/web/src/tauri_update.ts). DESKTOP-AUTOUPDATE.md documents the
        // CI signing pipeline that produces latest.json.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Lets the frontend relaunch the app into the freshly installed binary
        // after the updater finishes (relaunch() in tauri_update.ts).
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
            gact_http::gact_http,
            sse_bridge::gact_sse_open,
            sse_bridge::gact_sse_close,
            plugins::exec_plugin
        ])
        .setup(|app| {
            // Resolve + remember the persisted boot-log path FIRST so the
            // supervisor's worker threads (spawn + install/repair streamers)
            // can append to it and the "Open logs" command can reveal it
            // after a failure. Best-effort: a failure here leaves logging a
            // no-op but never blocks boot.
            let _ = supervisor_boot_log::init_boot_log(app.handle());

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

            // Kick off the backend boot — AFTER the env var above so a spawned
            // launcher sees it. Managed brands locate + spawn the bundled
            // launcher (a missing one is an Error card); connect-mode brands
            // (the neutral default) never own a launcher and attach-only to a
            // user-run backend, surfacing a friendly "start your backend"
            // message instead of treating the absent launcher as a failure.
            {
                let sup = app.state::<Mutex<Supervisor>>();
                let sup = supervisor_state::lock_recover(&sup);
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

            // Native window/app menu (1.0 item 9). Non-predefined items emit
            // the `clio:menu` event the SolidJS frontend listens for; Quit +
            // the Edit submenu are predefined and handled natively. The tray
            // menu above is independent and keeps working.
            let app_menu = menu::build_menu(app.handle())?;
            app.set_menu(app_menu)?;
            app.on_menu_event(|app, ev| {
                menu::handle_menu_event(app, ev.id().as_ref());
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<Mutex<Supervisor>>() {
                    // lock_recover, not plain lock(): a poisoned mutex here
                    // would silently skip child reaping and leak the sidecar
                    // process tree on exit.
                    supervisor_state::lock_recover(&state).shutdown();
                }
                if let Some(tm) = window.app_handle().try_state::<TunnelManager>() {
                    tm.shutdown_all();
                }
                if let Some(sse) = window.app_handle().try_state::<sse_registry::SseRegistry>() {
                    sse.stop_all();
                }
            }
        })
        .run(tauri::generate_context!());

    // `run` only returns on a fatal runtime failure (e.g. the webview
    // backend can't initialize — WebView2 missing on Windows, no X11/Wayland
    // display on Linux). Panicking here gives the user an opaque backtrace; a
    // plain error line + non-zero exit is the actionable, scriptable failure.
    if let Err(e) = result {
        eprintln!("GACT desktop failed to start: {e}");
        std::process::exit(1);
    }
}

//! GACT Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.
//!
//! Wave 3: also owns SSH tunnel lifecycles + OS notifications + tray.

mod brand_backend;
mod clio_core_daemon;
mod clio_core_registry;
mod commands;
mod credentials;
mod gact_http;
mod gact_http_response;
#[cfg(test)]
mod gact_http_tests;
#[cfg_attr(not(windows), allow(dead_code))]
mod installer_dir_swap;
mod installer_options;
#[cfg_attr(not(windows), allow(dead_code))]
mod installer_runtime_stop;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod menu;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
mod menu_spec;
mod net_util;
mod plugins;
#[cfg_attr(not(windows), allow(dead_code))]
mod runtime_install_report;
mod runtime_pack;
mod sidecar_setup;
mod sse_bridge;
mod sse_message;
mod sse_parse;
mod sse_registry;
mod sse_stream;
#[cfg(test)]
mod sse_stream_tests;
mod ssh_profile_blocks;
mod ssh_profiles;
mod ssh_transport;
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
mod supervisor_update_verify;
mod terminal_pty;
mod terminal_reader;
mod tray;
mod workspace_terminal;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use supervisor::Supervisor;
use tauri::{Emitter, Manager};

const DESKTOP_RESUMED_EVENT: &str = "clio:desktop-resumed";

/// Emitted to the main window when a native close request (Alt+F4, the OS
/// close box, the traffic-light close button) arrives, so the frontend can
/// open the same "Keep CLIO running?" prompt the title-bar close button and
/// hamburger Quit use. Native close never auto-quits or auto-hides on its
/// own anymore — the prompt decides. Carries a sequence number (see
/// [`CLOSE_PROMPT_SEQ`]) so a fast repeat (e.g. Alt+F4 pressed twice) can be
/// correlated correctly instead of racing a single global ack flag.
const CLOSE_REQUESTED_EVENT: &str = "clio:close-requested";

/// Emitted right before the native 500ms fallback hides the window because
/// the frontend never acknowledged a close-request prompt in time, so the
/// frontend can clear its own prompt-open state rather than leaving a
/// confirmation dialog rendered over a now-hidden window.
const CLOSE_FALLBACK_HIDDEN_EVENT: &str = "clio:close-fallback-hidden";

/// Payload for [`CLOSE_REQUESTED_EVENT`].
#[derive(Clone, serde::Serialize)]
struct CloseRequestedPayload {
    seq: u64,
}

/// How long `CloseRequested` waits for the frontend to ack the prompt (via
/// the `close_prompt_shown` command) before assuming no listener is mounted
/// — an unloaded or crashed WebView — and falling back to hiding the window
/// outright. Keeps Alt+F4 / the OS close box safe even when the web layer
/// never answers.
const CLOSE_PROMPT_ACK_TIMEOUT: Duration = Duration::from_millis(500);

/// Monotonic sequence for [`CLOSE_REQUESTED_EVENT`] emissions. Each native
/// close request gets the next number; the frontend echoes it back via
/// `close_prompt_shown(seq)` so a late ack for an OLDER request (e.g. two
/// Alt+F4 presses within the 500ms fallback window) can never be mistaken
/// for an ack of the CURRENT one, and vice versa.
static CLOSE_PROMPT_SEQ: AtomicU64 = AtomicU64::new(0);

/// The highest close-request sequence number the frontend has acknowledged
/// so far. Monotonic: `close_prompt_shown` only ever advances it (via
/// `fetch_max`), so an out-of-order or duplicate ack of an older seq can
/// never regress an already-acked newer one.
static CLOSE_PROMPT_ACKED_SEQ: AtomicU64 = AtomicU64::new(0);

/// Guards every quit entry point — native `ExitRequested`/`Exit`/`Destroyed`,
/// the tray Quit item, the hamburger/title-bar Quit action, the macOS app
/// menu Quit, and the `quit_clio` command — so the owned process tree is
/// reaped exactly once no matter which path gets there first or how many
/// exit events the OS delivers on the way out.
static QUIT_STARTED: AtomicBool = AtomicBool::new(false);

/// Atomically claims the single quit attempt for this process.
///
/// Returns `true` for the caller that actually gets to run teardown, `false`
/// for every later caller (including the `ExitRequested`/`Exit`/`Destroyed`
/// events that `request_quit`'s own `app.exit(0)` goes on to trigger). A free
/// function, not a method on an `AppHandle`, so it is unit-testable without
/// booting a real Tauri runtime.
fn claim_quit() -> bool {
    !QUIT_STARTED.swap(true, Ordering::SeqCst)
}

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
        .plugin(tauri_plugin_opener::init())
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
        .manage(ssh_transport::SshTransportRegistry::new())
        .manage(sse_registry::SseRegistry::new())
        .manage(terminal_pty::TerminalRegistry::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_backend,
            commands::retry_backend,
            commands::install_clio,
            commands::repair_clio,
            commands::update_clio,
            commands::open_logs,
            commands::read_logs,
            commands::open_document_path,
            ssh_transport::ssh_transport_open,
            ssh_transport::ssh_transport_status,
            ssh_transport::ssh_transport_write,
            ssh_transport::ssh_transport_exec,
            ssh_transport::ssh_transport_forward,
            ssh_transport::ssh_transport_close,
            ssh_profiles::ssh_profiles_list,
            ssh_profiles::ssh_profile_save,
            ssh_profiles::ssh_profile_set_route,
            ssh_profiles::ssh_profile_set_hidden,
            ssh_profiles::ssh_profile_delete,
            installer_options::read_installer_options,
            installer_options::complete_installer_web_search,
            credentials::credential_store,
            credentials::credential_read,
            credentials::credential_delete,
            credentials::provider_credential_store,
            credentials::provider_credential_read,
            credentials::ssh_identity_store,
            gact_http::gact_http,
            sse_bridge::gact_sse_open,
            sse_bridge::gact_sse_close,
            plugins::exec_plugin,
            workspace_terminal::open_workspace_terminal,
            terminal_pty::terminal_open,
            terminal_pty::terminal_write,
            terminal_pty::terminal_resize,
            terminal_pty::terminal_close,
            quit_clio,
            restart_clio,
            close_prompt_shown
        ])
        .setup(|app| {
            // Resolve + remember the persisted boot-log path FIRST so the
            // supervisor's worker threads (spawn + install/repair streamers)
            // can append to it and the "Open logs" command can reveal it
            // after a failure. Best-effort: a failure here leaves logging a
            // no-op but never blocks boot.
            let _ = supervisor_boot_log::init_boot_log(app.handle());

            let app_data = app
                .path()
                .app_local_data_dir()
                .map_err(|error| format!("resolve desktop app-data directory: {error}"))?;
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|error| format!("resolve desktop resource directory: {error}"))?;
            let managed_storage = if brand_backend::is_managed_install() {
                sidecar_setup::prepare_managed_storage_root(&resource_dir, &app_data)
                    .map_err(|error| format!("prepare managed storage root: {error}"))?
            } else {
                app_data.clone()
            };

            // Model runtimes are large. On Windows this root follows the
            // install directory the user selected; elsewhere it remains in
            // the platform app-data directory.
            if let Err(error) = sidecar_setup::install_model_cache_env(&managed_storage) {
                supervisor_boot_log::boot_log_line(&format!(
                    "warning: could not prepare shared model cache: {error}"
                ));
            }

            let desktop_workspace = sidecar_setup::prepare_desktop_workspace(&managed_storage)
                .map_err(|error| format!("prepare desktop workspace: {error}"))?;
            let desktop_user_dir = sidecar_setup::prepare_desktop_user_dir(&managed_storage)
                .map_err(|error| format!("prepare desktop user state: {error}"))?;

            // Kick off the backend boot. Managed brands prepare the bundled
            // runtime on the worker and pass its path directly to the launcher.
            // They then locate + spawn the bundled
            // launcher (a missing one is an Error card); connect-mode brands
            // (the neutral default) never own a launcher and attach-only to a
            // user-run backend, surfacing a friendly "start your backend"
            // message instead of treating the absent launcher as a failure.
            {
                let sup = app.state::<Mutex<Supervisor>>();
                let mut sup = supervisor_state::lock_recover(&sup);
                sup.set_working_dir(desktop_workspace);
                sup.set_user_dir(desktop_user_dir);
                sup.set_bundled_runtime(resource_dir, managed_storage);
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
            // Defense in depth: nothing above should ever install a native
            // menu outside macOS — Tauri does not install a default one on
            // its own — but a debug build catches it immediately if a
            // future change reintroduces one. The whole point of the
            // product-owned title bar (`desktop-title-bar.tsx`) is that
            // Windows and Linux never draw a second, OS-owned menu strip.
            #[cfg(not(target_os = "macos"))]
            debug_assert!(
                app.menu().is_none(),
                "a native menu must never be installed outside macOS"
            );

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Native close (Alt+F4, the OS close box, the traffic light)
                // never auto-quits or auto-hides by itself: it opens the same
                // confirmation prompt the title-bar close button and
                // hamburger Quit use, via CLOSE_REQUESTED_EVENT. A 500ms
                // fallback covers a WebView that never mounts a listener.
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let seq = CLOSE_PROMPT_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
                    let app_handle = window.app_handle().clone();
                    let _ = app_handle.emit(CLOSE_REQUESTED_EVENT, CloseRequestedPayload { seq });
                    thread::spawn(move || {
                        thread::sleep(CLOSE_PROMPT_ACK_TIMEOUT);
                        // This specific request (seq) still unacked — a
                        // later close request bumping the seq further
                        // still counts as "handled" (its own prompt/ack
                        // cycle is in flight), so compare, don't just
                        // check "any ack ever happened".
                        if CLOSE_PROMPT_ACKED_SEQ.load(Ordering::SeqCst) < seq {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                            let _ = app_handle.emit(CLOSE_FALLBACK_HIDDEN_EVENT, ());
                        }
                    });
                }
                // Native window destruction is one of the quit entry points
                // request_quit guards against double teardown.
                tauri::WindowEvent::Destroyed => request_quit(window.app_handle()),
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
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            tray::show_main_window(app_handle);
        }
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            // `code` is `None` only when the exit was requested by native
            // interaction (tauri-runtime-wry's own "all windows closed"
            // behavior) rather than by our own `AppHandle::exit()` call
            // inside `request_quit` (which always carries `Some(code)`).
            // Left unblocked, the event loop would tear down the instant
            // this callback returns — racing (and likely abandoning
            // mid-flight) request_quit's background reap thread, e.g.
            // mid-POST to /v1/desktop/shutdown. Block it and drive our own
            // guarded quit instead; Tauri 2.11 ignores `prevent_exit` only
            // for the restart exit code, so this can never block our own
            // `exit(0)` below.
            if code.is_none() {
                api.prevent_exit();
            }
            request_quit(app_handle);
        }
        tauri::RunEvent::Exit => {
            // The true last event Tauri will ever deliver: `run()` tears
            // the process down immediately after this callback returns, so
            // a background thread spawned here would race real process
            // termination and might never finish. Some native exit paths
            // (Windows WM_ENDSESSION on logoff/shutdown, macOS Dock Quit /
            // session logout) deliver ONLY this event and skip
            // ExitRequested entirely, so this is also the sole chance to
            // reap on those paths. Run teardown synchronously right here;
            // claim_quit() makes this a no-op if request_quit already
            // handled it above (the common case).
            if claim_quit() {
                shutdown_owned_services(app_handle);
            }
        }
        _ => {}
    });
}

/// Expand the bundled runtime during the native installer instead of making
/// the first interactive launch pay that cost.
///
/// The executable itself lives in Tauri's Windows resource directory. Managed
/// storage deliberately lives below that same directory (`data/`) so choosing
/// a non-system drive in NSIS also moves the Python runtime, CTE arena,
/// workspace, and model cache off the system drive.
#[cfg(windows)]
pub fn prepare_runtime_for_install() -> Result<(), String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("resolve installed desktop executable: {error}"))?;
    let resource_dir = executable
        .parent()
        .ok_or_else(|| format!("installed desktop executable has no parent: {executable:?}"))?;
    let managed_storage =
        sidecar_setup::prepare_managed_storage_root(resource_dir, &resource_dir.join("data"))
            .map_err(|error| format!("prepare installer-managed storage: {error}"))?;
    runtime_pack::prepare_bundled_runtime(resource_dir, &managed_storage)?
        .ok_or_else(|| "the installer did not include a bundled CLIO runtime".to_string())?;
    Ok(())
}

/// The `--prepare-runtime` installer step. On failure the returned text leads
/// with the real error and names the saved log; the installer shows it and
/// offers the issue page recorded next to that log.
#[cfg(windows)]
pub fn prepare_runtime_command() -> Result<(), String> {
    let install_dir = std::env::current_exe()
        .ok()
        .and_then(|executable| executable.parent().map(std::path::Path::to_path_buf));
    match prepare_runtime_for_install() {
        Ok(()) => {
            if let Some(dir) = &install_dir {
                runtime_install_report::clear_failure(dir);
            }
            Ok(())
        }
        Err(error) => Err(match &install_dir {
            Some(dir) => runtime_install_report::record_failure(
                dir,
                &error,
                runtime_install_report::issue_url().as_deref(),
            ),
            None => error,
        }),
    }
}

/// Remove installer-owned runtime, CTE, and model-cache storage without
/// making NSIS interpret each file in the expanded Python environment.
#[cfg(windows)]
pub fn remove_managed_storage_for_uninstall() -> Result<(), String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("resolve installed desktop executable: {error}"))?;
    let resource_dir = executable
        .parent()
        .ok_or_else(|| format!("installed desktop executable has no parent: {executable:?}"))?;
    runtime_pack::remove_managed_install_storage(resource_dir)
}

/// The `--stop-managed-runtime` installer step: stop every CLIO-managed
/// process under the install root deterministically, waiting for each to
/// actually exit, before NSIS overwrites or removes anything.
///
/// Replaces the old `CLIO_STOP_MANAGED_RUNTIME` NSIS macro, which shelled out
/// to an encoded PowerShell one-liner (WMI process match + `Stop-Process
/// -Force`) and then blindly `Sleep 1500`'d regardless of whether anything
/// had actually exited. This is invoked from both `NSIS_HOOK_PREINSTALL`
/// (before an upgrade overwrites files) and `NSIS_HOOK_PREUNINSTALL` (before
/// the uninstaller removes managed storage) — always best-effort: a failure
/// here is never fatal to the installer, since the retrying directory swap in
/// `runtime_pack`/`installer_dir_swap` is the actual correctness backstop.
#[cfg(windows)]
pub fn stop_managed_runtime_command() -> Result<(), String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("resolve installed desktop executable: {error}"))?;
    let resource_dir = executable
        .parent()
        .ok_or_else(|| format!("installed desktop executable has no parent: {executable:?}"))?;
    installer_runtime_stop::stop_and_log(resource_dir, "stop-managed-runtime");
    Ok(())
}

/// The one quit path every entry point funnels through: the title-bar/
/// hamburger "Quit CLIO" action (via `quit_clio`), the tray Quit item, the
/// macOS app-menu Quit, and the native `ExitRequested`/`Exit`/`Destroyed`
/// events Tauri delivers once this function's own `app.exit(0)` unwinds the
/// runtime.
///
/// Hides the main window immediately — so the app disappears from the screen
/// right away even though reaping the owned process tree can take up to
/// `GRACEFUL_SHUTDOWN_STALL` — then tears down on a background thread and
/// exits once that finishes. Guarded by [`claim_quit`]: only the first
/// caller across the whole process does any of this; every later call is a
/// no-op, which is what makes running it from every entry point (rather than
/// threading a "did we already quit" flag through each of them) safe.
pub(crate) fn request_quit<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if !claim_quit() {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    let app_handle = app.clone();
    thread::spawn(move || {
        shutdown_owned_services(&app_handle);
        app_handle.exit(0);
    });
}

/// Tear down every process and stream owned by this desktop process.
///
/// Called exactly once per process, from inside [`request_quit`]'s guard (or
/// synchronously from `RunEvent::Exit` on the native paths that skip
/// `request_quit` entirely — see `run()`).
///
/// Order matters: the SSE bridge holds an open reader against the GACT
/// server we are about to ask to unwind. Stopping it FIRST closes that
/// reader before the server sees the shutdown request, so the server never
/// has to wait out its own connection-close grace on a reader we were going
/// to kill anyway — cheaper than closing it after.
pub(crate) fn shutdown_owned_services<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(sse) = app.try_state::<sse_registry::SseRegistry>() {
        sse.stop_all();
    }
    if let Some(state) = app.try_state::<Mutex<Supervisor>>() {
        // lock_recover, not plain lock(): a poisoned mutex here would silently
        // skip child reaping and leak the sidecar process tree on exit.
        supervisor_state::lock_recover(&state).shutdown();
    }
    if let Some(transports) = app.try_state::<ssh_transport::SshTransportRegistry>() {
        transports.shutdown_all();
    }
    if let Some(terminals) = app.try_state::<terminal_pty::TerminalRegistry>() {
        terminals.shutdown_all();
    }
    // Runs AFTER the supervisor shutdown above, so the server process (and
    // whichever exit path it took — a graceful atexit release, or the forced
    // TerminateProcess fallthrough that skips it) is already gone. The shared
    // clio-core daemon deliberately survives that process-tree reap
    // (`supervisor_shutdown::owned_descendants` spares `clio_run.exe` for
    // independent CLIO clients); this is the second line of defense that
    // stops it when THIS desktop's own client was the last one attached.
    release_idle_clio_core_daemon();
}

/// Stop the machine's shared clio-core daemon if this process's own exit
/// leaves no live client registered; leave it running for any other attached
/// client (a CLI, a dev server). Best-effort and logged either way — see
/// `clio_core_daemon::release_idle_daemon_on_quit`.
fn release_idle_clio_core_daemon() {
    let Some(state_dir) = clio_core_registry::runtime_state_dir() else {
        supervisor_boot_log::boot_log_line(
            "clio-core daemon release skipped: could not resolve the host state directory \
             (no CLIO_RUNTIME_STATE_DIR and no home directory)",
        );
        return;
    };
    match clio_core_daemon::release_idle_daemon_on_quit(&state_dir) {
        clio_core_daemon::DaemonOutcome::AlreadyGone => {}
        clio_core_daemon::DaemonOutcome::LiveClientsPresent(pids) => {
            supervisor_boot_log::boot_log_line(&format!(
                "clio-core daemon left running: kept alive by other client pid(s) {pids:?}"
            ));
        }
        clio_core_daemon::DaemonOutcome::StoppedCleanly(pid) => {
            supervisor_boot_log::boot_log_line(&format!(
                "clio-core daemon (pid {pid}) stopped cleanly on quit — this was the last client"
            ));
        }
        clio_core_daemon::DaemonOutcome::StoppedByForce(pid) => {
            supervisor_boot_log::boot_log_line(&format!(
                "clio-core daemon (pid {pid}) required a hard kill on quit \
                 (clean stop did not confirm in time) — this was the last client"
            ));
        }
    }
}

/// Product-owned Quit action, invoked from the title-bar/hamburger close
/// prompt's "Quit CLIO" button.
///
/// Returns immediately — `request_quit` only hides the window and spawns the
/// teardown before coming back — so the frontend's `invoke()` promise
/// resolves right away instead of racing `GRACEFUL_SHUTDOWN_STALL`. Before
/// this, quitting synchronously ran teardown on the command's own thread, so
/// a slow shutdown could make the invoke look rejected on a perfectly normal
/// quit and trip the "could not update the desktop window" toast.
#[tauri::command]
fn quit_clio(app: tauri::AppHandle) {
    request_quit(&app);
}

/// Whole-app relaunch, invoked from the Infrastructure > Agent "Protected
/// execution" row once a sandbox setup reports `sandbox_fence_pending_restart`.
///
/// A first version of this command called `Supervisor::restart()` directly —
/// that only respawns the managed backend child on a fresh port with a fresh
/// bearer token, which the webview never learns (the connection handshake
/// runs once, at mount, in `connection-provider.tsx`), so every request after
/// that "restart" failed. Restarting the whole app instead makes the webview
/// reload from scratch and redo that handshake against whatever the fresh
/// backend boots with — the only way this button's promise ("the fence is
/// active now") is actually kept.
///
/// Goes through the SAME owned-process teardown as [`quit_clio`] (guarded by
/// the same [`claim_quit`], so a restart can never race a concurrent quit or
/// vice versa) before calling [`tauri::AppHandle::restart`], which never
/// returns — it exits this process with Tauri's own restart exit code and a
/// fresh instance takes over. Runs on a background thread: `restart()` blocks
/// the calling thread until the process actually exits (it hands off to the
/// main event loop and parks), and this is a `#[tauri::command]` — parking
/// the command's own thread would otherwise stall the invoking webview call
/// for however long teardown and the runtime's own exit sequencing take.
#[tauri::command]
fn restart_clio(app: tauri::AppHandle) {
    if !claim_quit() {
        return;
    }
    thread::spawn(move || {
        shutdown_owned_services(&app);
        app.restart();
    });
}

/// Frontend ack for [`CLOSE_REQUESTED_EVENT`]: called once the close
/// confirmation prompt has mounted for the given `seq` (echoed from the
/// event payload), so the native 500ms fallback for THAT SAME close request
/// does not race a slow but healthy render and hide the window out from
/// under an open dialog. `fetch_max` keeps this monotonic — an ack for an
/// older seq arriving late (e.g. two Alt+F4 presses within 500ms) can never
/// regress a newer one that already acked.
#[tauri::command]
fn close_prompt_shown(seq: u64) {
    CLOSE_PROMPT_ACKED_SEQ.fetch_max(seq, Ordering::SeqCst);
}

#[cfg(test)]
mod quit_guard_tests {
    use super::claim_quit;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// A private, non-static reimplementation of the `QUIT_STARTED` guard so
    /// the idempotency contract can be verified without racing the real
    /// process-wide static across parallel `cargo test` threads.
    fn claim_quit_on(guard: &AtomicBool) -> bool {
        !guard.swap(true, Ordering::SeqCst)
    }

    #[test]
    fn quit_guard_is_idempotent() {
        let guard = AtomicBool::new(false);
        assert!(
            claim_quit_on(&guard),
            "the first claim must win and be allowed to run teardown"
        );
        assert!(
            !claim_quit_on(&guard),
            "every later claim (ExitRequested/Exit/Destroyed after app.exit) must be refused"
        );
        assert!(!claim_quit_on(&guard), "repeated later claims stay refused");
    }

    /// `quit_clio` and `restart_clio` share this exact guard (both call the
    /// bare `claim_quit()`), so whichever fires first must win the only
    /// teardown run and the other must see itself refused — neither may ever
    /// race the other into tearing down owned services twice or into an
    /// `app.restart()` racing an `app.exit(0)`.
    #[test]
    fn quit_and_restart_share_one_guard() {
        let guard = AtomicBool::new(false);
        assert!(
            claim_quit_on(&guard),
            "whichever of quit_clio/restart_clio the reader triggers first must win the claim"
        );
        assert!(
            !claim_quit_on(&guard),
            "the other of quit_clio/restart_clio must see the claim already taken and no-op"
        );
    }

    /// Smoke-test the real process-wide static once: it starts unclaimed in
    /// a fresh process and flips permanently on first use. Other tests never
    /// touch `QUIT_STARTED`, so this is not racy against them.
    #[test]
    fn real_quit_guard_claims_once() {
        assert!(claim_quit(), "QUIT_STARTED must start false");
        assert!(
            !claim_quit(),
            "QUIT_STARTED must latch true after the first claim"
        );
    }
}

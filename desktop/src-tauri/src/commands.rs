//! Tauri command handlers exposed to the SolidJS frontend over IPC.
//!
//! Thin glue between the WebView and the native subsystems: backend
//! status/install/repair (supervisor), SSH tunnels, and boot-log reveal.

use std::sync::Mutex;
use std::{
    path::{Component, Path, PathBuf},
    process::Command,
};

use crate::supervisor::Supervisor;
use crate::supervisor_boot_log;
use crate::supervisor_boot_log_open;
use crate::supervisor_installer;
use crate::supervisor_state::lock_recover;
use crate::supervisor_types::BackendHandle;
use tauri::Manager;

/// Frontend mounts on app load and polls this until `status.kind == "ready"`.
#[tauri::command]
pub fn get_backend(state: tauri::State<'_, Mutex<Supervisor>>) -> BackendHandle {
    lock_recover(&state).snapshot()
}

/// Retry a failed managed-backend boot without restarting the desktop shell.
///
/// A killed or stalled child leaves the supervisor in a typed Error state.
/// Merely polling that state can never recover it, so explicit user actions
/// such as "Use local CLIO" call this command before resuming readiness polls.
#[tauri::command]
pub fn retry_backend(state: tauri::State<'_, Mutex<Supervisor>>) {
    lock_recover(&state).restart();
}

/// First-run "one swoop" install. When `get_backend` reports
/// `{kind: "needs_install"}` the frontend Splash invokes this command,
/// which runs the upstream clio-agent installer and streams progress back
/// as Tauri events.
#[tauri::command]
pub fn install_clio(app: tauri::AppHandle) {
    run_installer(app, false);
}

/// Repair / reinstall the clio-agent runtime. Distinct from `install_clio`
/// and from the splash "Retry": this re-runs the upstream installer with a
/// force flag (`CLIO_FORCE=1`).
#[tauri::command]
pub fn repair_clio(app: tauri::AppHandle) {
    run_installer(app, true);
}

/// Update the exact CLIO runtime owned by this desktop installation.
/// Bundled installs are upgraded in place; legacy/lightweight installs use
/// the upstream bootstrap installer. The caller chooses whether this update
/// restarts immediately (CLIO-only) or lets a following desktop update perform
/// the single combined restart.
#[tauri::command]
pub fn update_clio(
    app: tauri::AppHandle,
    target_version: Option<String>,
    restart_app: Option<bool>,
) {
    let target = target_version.filter(|v| !v.trim().is_empty());
    let runtime = app
        .try_state::<Mutex<Supervisor>>()
        .and_then(|state| lock_recover(&state).managed_runtime_dir());
    if let Some(state) = app.try_state::<Mutex<Supervisor>>() {
        lock_recover(&state).shutdown();
    }
    std::thread::spawn(move || {
        let after_update = {
            let app = app.clone();
            move || {
                if restart_app.unwrap_or(true) {
                    // Let the verified-success event reach the webview before
                    // replacing the process.  This keeps the agent-only path
                    // observable instead of making a healthy restart look like
                    // a dropped update request.
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(250));
                        app.restart();
                    });
                }
            }
        };
        match (runtime, target.as_deref()) {
            (Some(runtime), Some(version)) => {
                supervisor_installer::update_bundled_clio(app, &runtime, version, after_update)
            }
            _ => supervisor_installer::install_clio_versioned(app, true, target, after_update),
        }
    });
}

fn run_installer(app: tauri::AppHandle, force: bool) {
    std::thread::spawn(move || {
        let restart_app = app.clone();
        supervisor_installer::install_clio(app, force, move || {
            if let Some(state) = restart_app.try_state::<Mutex<Supervisor>>() {
                lock_recover(&state).restart();
            }
        });
    });
}

/// Reveal the persisted boot log in the OS file manager so the user can
/// open it in their default viewer.
#[tauri::command]
pub fn open_logs() -> Result<String, String> {
    supervisor_boot_log_open::open_boot_log().map(|p| p.display().to_string())
}

/// Return the persisted boot-log transcript text for inline display + copy in
/// the boot-failure card. Distinct from `open_logs`, which reveals the file in
/// the OS file manager; this hands the WebView the text so the user can read
/// and copy it without leaving the app.
#[tauri::command]
pub fn read_logs() -> Result<String, String> {
    supervisor_boot_log::read_boot_log()
}

/// Open one confined document working copy in the operating system's default
/// application. The backend chooses and materializes the path; this command
/// validates that it names a real file and passes it as an argv element.
#[tauri::command]
pub fn open_document_path(path: String) -> Result<String, String> {
    let requested = PathBuf::from(path);
    let canonical = requested
        .canonicalize()
        .map_err(|error| format!("document path is unavailable: {error}"))?;
    if !canonical.is_file() {
        return Err("document path is not a file".to_string());
    }
    if !is_document_working_copy_path(&canonical) {
        return Err("document path is outside a CLIO working copy".to_string());
    }
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut value = Command::new("explorer.exe");
        value.arg(&canonical);
        value
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut value = Command::new("open");
        value.arg(&canonical);
        value
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut value = Command::new("xdg-open");
        value.arg(&canonical);
        value
    };
    command
        .spawn()
        .map_err(|error| format!("could not open document: {error}"))?;
    Ok(canonical.display().to_string())
}

fn is_document_working_copy_path(path: &Path) -> bool {
    let components: Vec<String> = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();
    components.windows(5).any(|window| {
        window[0].eq_ignore_ascii_case(".clio")
            && window[1].eq_ignore_ascii_case("agent")
            && window[2].eq_ignore_ascii_case("documents")
            && window[3].eq_ignore_ascii_case("working-copies")
            && window[4].starts_with("docwc_")
    })
}

#[cfg(test)]
mod document_path_tests {
    use super::is_document_working_copy_path;
    use std::path::Path;

    #[test]
    fn accepts_only_clio_document_working_copy_files() {
        assert!(is_document_working_copy_path(Path::new(
            "C:/workspace/.clio/agent/documents/working-copies/docwc_abc/brief.docx"
        )));
        assert!(!is_document_working_copy_path(Path::new(
            "C:/workspace/brief.docx"
        )));
        assert!(!is_document_working_copy_path(Path::new(
            "C:/workspace/.clio/agent/documents/working-copies/untrusted/brief.docx"
        )));
    }
}

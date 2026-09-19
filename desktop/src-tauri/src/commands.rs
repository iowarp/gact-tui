//! Tauri command handlers exposed to the SolidJS frontend over IPC.
//!
//! Thin glue between the WebView and the native subsystems: backend
//! status/install/repair (supervisor), SSH tunnels, and boot-log reveal.

use std::sync::Mutex;
use std::{
    path::{Component, Path, PathBuf},
    process::Command,
};

use crate::ssh::TunnelManager;
use crate::ssh_types::{TunnelHandle, TunnelRequest};
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

/// Update the clio-agent runtime to a specific released version. Driven by the
/// version-badge update panel's Backend row: it re-runs the upstream installer
/// pinned to `target_version` (a release tag like `v0.5.2`) with the force flag
/// so the new ref is checked out over the existing install. A null/empty
/// target falls back to the default `develop` ref.
#[tauri::command]
pub fn update_clio(app: tauri::AppHandle, target_version: Option<String>) {
    let target = target_version.filter(|v| !v.trim().is_empty());
    std::thread::spawn(move || {
        let restart_app = app.clone();
        supervisor_installer::install_clio_versioned(app, true, target, move || {
            if let Some(state) = restart_app.try_state::<Mutex<Supervisor>>() {
                lock_recover(&state).restart();
            }
        });
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

/// Open an SSH tunnel for an `ssh-tunnel` backend entry.
#[tauri::command]
pub fn tunnel_open(
    request: TunnelRequest,
    tunnels: tauri::State<'_, TunnelManager>,
) -> Result<TunnelHandle, String> {
    tunnels.open(request).map_err(|e| e.to_string())
}

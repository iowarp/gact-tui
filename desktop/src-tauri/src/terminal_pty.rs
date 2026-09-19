//! Embedded workspace terminal (Wave B9).
//!
//! A managed [`TerminalRegistry`] owns one real pty per open terminal tab —
//! ConPTY on Windows, a native pty on macOS/Linux, both behind
//! `portable_pty`'s one cross-platform API. Four commands drive it:
//! [`terminal_open`], [`terminal_write`], [`terminal_resize`],
//! [`terminal_close`]. Output streams back to the frontend as two
//! per-terminal events — `clio:terminal-data:{id}` (base64 chunks) and
//! `clio:terminal-exit:{id}` (the exit code once the shell dies) — read by
//! `web/src/components/clio/workspace-terminal-panel.tsx`.
//!
//! Every terminal is reaped from [`TerminalRegistry::shutdown_all`], called
//! from `shutdown_owned_services` in `lib.rs` on both the graceful quit path
//! and the native `RunEvent::Exit` path, so a shell can never outlive the
//! desktop process — the same owned-process guarantee `TunnelManager` and
//! the sidecar `Supervisor` already give the SSH tunnels and the backend.

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, Manager};

use crate::terminal_reader::run_terminal_reader;

/// The pieces of a freshly spawned pty a caller needs: the whole master (for
/// later resize), a writer for keystrokes, a reader for output, and the
/// child process itself so it can be killed and reaped.
pub(crate) struct SpawnedPty {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub reader: Box<dyn Read + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

/// Shell candidates in preference order, honoring an explicit override.
///
/// Windows: `pwsh` (PowerShell 7+) first, then Windows PowerShell, then
/// `%COMSPEC%` (cmd.exe) as the last resort. Unix: `$SHELL` if the desktop
/// process inherited one, else `/bin/zsh` then `/bin/bash`.
fn shell_candidates(explicit: Option<&str>) -> Vec<String> {
    if let Some(shell) = explicit {
        let trimmed = shell.trim();
        if !trimmed.is_empty() {
            return vec![trimmed.to_string()];
        }
    }
    platform_shell_candidates()
}

#[cfg(target_os = "windows")]
fn platform_shell_candidates() -> Vec<String> {
    vec![
        "pwsh.exe".to_string(),
        "powershell.exe".to_string(),
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string()),
    ]
}

#[cfg(not(target_os = "windows"))]
fn platform_shell_candidates() -> Vec<String> {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.trim().is_empty() {
            return vec![shell];
        }
    }
    vec!["/bin/zsh".to_string(), "/bin/bash".to_string()]
}

/// Open a pty running `cmd` rooted at `cwd`. The env the child sees is
/// whatever `CommandBuilder` inherits by default (the desktop process's own
/// environment) plus `TERM=xterm-256color`, so full-screen tools (vim,
/// htop, …) render correctly.
pub(crate) fn spawn_command(
    cwd: &Path,
    cols: u16,
    rows: u16,
    mut cmd: CommandBuilder,
) -> Result<SpawnedPty, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("open pty: {error}"))?;

    cmd.cwd(cwd);
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|error| format!("spawn: {error}"))?;
    // The child now holds its own handle to the slave side. Dropping ours
    // here is what lets the master's reader see EOF once the child exits —
    // on Unix a slave fd we kept open ourselves would keep the pty "alive"
    // and a read would block forever instead of returning 0.
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("clone pty reader: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("take pty writer: {error}"))?;

    Ok(SpawnedPty {
        master: pair.master,
        writer,
        reader,
        child,
    })
}

/// Try each shell candidate in order (mirrors `workspace_terminal.rs`'s
/// terminal-candidate fallback), returning the first one that spawns.
pub(crate) fn spawn_shell(
    cwd: &Path,
    cols: u16,
    rows: u16,
    shell: Option<&str>,
) -> Result<SpawnedPty, String> {
    let mut failures = Vec::new();
    for candidate in shell_candidates(shell) {
        match spawn_command(cwd, cols, rows, CommandBuilder::new(&candidate)) {
            Ok(spawned) => return Ok(spawned),
            Err(error) => failures.push(format!("{candidate}: {error}")),
        }
    }
    Err(format!(
        "No shell could be started ({})",
        failures.join("; ")
    ))
}

/// One live terminal: everything needed to write to it, resize it, and kill
/// its child. The reader lives only on its own thread (see
/// [`terminal_open`]) — it is never stored here.
struct TerminalHandle {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    stop: Arc<AtomicBool>,
}

fn kill_and_wait(handle: &TerminalHandle) {
    if let Ok(mut child) = handle.child.lock() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Tauri-managed state tracking every open embedded terminal.
pub struct TerminalRegistry {
    next: AtomicU64,
    handles: Mutex<HashMap<u64, Arc<TerminalHandle>>>,
}

impl TerminalRegistry {
    pub fn new() -> Self {
        Self {
            next: AtomicU64::new(1),
            handles: Mutex::new(HashMap::new()),
        }
    }

    /// Registers an already-spawned pty's writer/master/child under a fresh
    /// id. Returns the id plus the stop flag a reader thread watches.
    pub(crate) fn register(
        &self,
        writer: Box<dyn Write + Send>,
        master: Box<dyn MasterPty + Send>,
        child: Box<dyn Child + Send + Sync>,
    ) -> (u64, Arc<AtomicBool>) {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let stop = Arc::new(AtomicBool::new(false));
        let handle = TerminalHandle {
            writer: Mutex::new(writer),
            master: Mutex::new(master),
            child: Mutex::new(child),
            stop: stop.clone(),
        };
        if let Ok(mut guard) = self.handles.lock() {
            guard.insert(id, Arc::new(handle));
        }
        (id, stop)
    }

    pub(crate) fn write(&self, id: u64, data: &[u8]) -> Result<(), String> {
        let handle = self.get(id)?;
        let mut writer = handle
            .writer
            .lock()
            .map_err(|_| "terminal writer lock poisoned".to_string())?;
        writer
            .write_all(data)
            .map_err(|error| format!("pty write: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("pty flush: {error}"))
    }

    pub(crate) fn resize(&self, id: u64, cols: u16, rows: u16) -> Result<(), String> {
        let handle = self.get(id)?;
        let master = handle
            .master
            .lock()
            .map_err(|_| "terminal master lock poisoned".to_string())?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("pty resize: {error}"))
    }

    /// Explicit close: kills + reaps the child immediately and removes the
    /// entry so no later write/resize/close can find it. A repeat close (or
    /// one that races the shell exiting on its own) is a harmless no-op.
    pub(crate) fn close(&self, id: u64) {
        let Some(handle) = self.take(id) else {
            return;
        };
        handle.stop.store(true, Ordering::Relaxed);
        kill_and_wait(&handle);
    }

    /// Drops bookkeeping for a terminal whose reader thread reached EOF on
    /// its own (the shell exited). The child is already gone — this only
    /// forgets the entry, mirroring `SseRegistry::forget`.
    pub(crate) fn forget(&self, id: u64) {
        let _ = self.take(id);
    }

    /// Kills + reaps every live terminal. Called once from
    /// `shutdown_owned_services` on both the graceful quit path and the
    /// native `RunEvent::Exit` path.
    pub fn shutdown_all(&self) {
        let handles: Vec<Arc<TerminalHandle>> = match self.handles.lock() {
            Ok(mut guard) => guard.drain().map(|(_, v)| v).collect(),
            Err(poisoned) => poisoned.into_inner().drain().map(|(_, v)| v).collect(),
        };
        for handle in handles {
            handle.stop.store(true, Ordering::Relaxed);
            kill_and_wait(&handle);
        }
    }

    /// Blocks until the child has exited (reaping it) and returns its exit
    /// code. `Some(None)` means the terminal was still registered but no
    /// exit code could be determined; `None` means it was already closed
    /// out from under the reader thread (an explicit `terminal_close` raced
    /// the shell's own EOF) — callers must not emit an exit event for that
    /// case, since the frontend already knows it asked this terminal to go
    /// away.
    pub(crate) fn wait_exit_code(&self, id: u64) -> Option<Option<i32>> {
        let handle = {
            let guard = self.handles.lock().ok()?;
            guard.get(&id).cloned()
        }?;
        let mut child = match handle.child.lock() {
            Ok(child) => child,
            Err(_) => return Some(None),
        };
        Some(child.wait().ok().map(|status| status.exit_code() as i32))
    }

    #[cfg(test)]
    pub(crate) fn pid(&self, id: u64) -> Option<u32> {
        self.get(id).ok()?.child.lock().ok()?.process_id()
    }

    /// Test-only: read back the pty's current size (cols, rows) so a resize
    /// test can verify `resize()` actually took effect, not just that it
    /// returned `Ok`.
    #[cfg(test)]
    pub(crate) fn size(&self, id: u64) -> Result<(u16, u16), String> {
        let handle = self.get(id)?;
        let master = handle
            .master
            .lock()
            .map_err(|_| "terminal master lock poisoned".to_string())?;
        let size = master
            .get_size()
            .map_err(|error| format!("pty get_size: {error}"))?;
        Ok((size.cols, size.rows))
    }

    fn get(&self, id: u64) -> Result<Arc<TerminalHandle>, String> {
        self.handles
            .lock()
            .map_err(|_| "terminal registry lock poisoned".to_string())?
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("unknown terminal id {id}"))
    }

    fn take(&self, id: u64) -> Option<Arc<TerminalHandle>> {
        match self.handles.lock() {
            Ok(mut guard) => guard.remove(&id),
            Err(poisoned) => poisoned.into_inner().remove(&id),
        }
    }
}

impl Default for TerminalRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(serde::Serialize)]
pub struct TerminalOpenResult {
    pub id: u64,
}

#[derive(Clone, serde::Serialize)]
struct TerminalDataPayload {
    /// Base64-encoded pty output — a shell's bytes are not guaranteed to be
    /// valid UTF-8 at an arbitrary chunk boundary, and the rest of this
    /// bridge (`gact_http_response.rs`) already uses base64 for the same
    /// reason.
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct TerminalExitPayload {
    code: Option<i32>,
}

/// Open a new embedded terminal rooted at `cwd`. `cwd` is validated exactly
/// like the OS-terminal path (`workspace_terminal::resolve_workspace_dir`):
/// it must canonicalize to a directory that exists, which is the only
/// "known workspace root" check the desktop has today.
#[tauri::command]
pub fn terminal_open(
    app: tauri::AppHandle,
    registry: tauri::State<'_, TerminalRegistry>,
    cwd: String,
    cols: u16,
    rows: u16,
    shell: Option<String>,
) -> Result<TerminalOpenResult, String> {
    let workspace = crate::workspace_terminal::resolve_workspace_dir(&cwd)?;
    let SpawnedPty {
        master,
        writer,
        reader,
        child,
    } = spawn_shell(&workspace, cols, rows, shell.as_deref())?;
    let (id, stop) = registry.register(writer, master, child);
    eprintln!(
        "[terminal_pty] open id={id} cwd={}",
        workspace.display()
    );

    let app_for_thread = app.clone();
    if let Err(error) = thread::Builder::new()
        .name(format!("clio-terminal-{id}"))
        .spawn(move || {
            let data_event = format!("clio:terminal-data:{id}");
            run_terminal_reader(
                id,
                reader,
                stop.as_ref(),
                |chunk| {
                    let _ = app_for_thread.emit(
                        &data_event,
                        TerminalDataPayload {
                            data: BASE64_STANDARD.encode(chunk.bytes),
                        },
                    );
                },
                |dropped_id, reason, len| {
                    eprintln!(
                        "[terminal_pty] dropped {len} bytes id={dropped_id} reason={reason:?}"
                    );
                },
            );
            let registry = app_for_thread.state::<TerminalRegistry>();
            let exit_code = registry.wait_exit_code(id);
            registry.forget(id);
            if let Some(code) = exit_code {
                let _ = app_for_thread.emit(&format!("clio:terminal-exit:{id}"), TerminalExitPayload { code });
            }
            eprintln!("[terminal_pty] closed id={id}");
        })
    {
        registry.close(id);
        return Err(format!("terminal reader thread spawn: {error}"));
    }

    Ok(TerminalOpenResult { id })
}

/// Write keystrokes (or pasted text) into a terminal's pty.
#[tauri::command]
pub fn terminal_write(
    registry: tauri::State<'_, TerminalRegistry>,
    id: u64,
    data: String,
) -> Result<(), String> {
    registry.write(id, data.as_bytes())
}

/// Resize a terminal's pty to match its pane.
#[tauri::command]
pub fn terminal_resize(
    registry: tauri::State<'_, TerminalRegistry>,
    id: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.resize(id, cols, rows)
}

/// Close a terminal: kills its shell and forgets it. Idempotent.
#[tauri::command]
pub fn terminal_close(registry: tauri::State<'_, TerminalRegistry>, id: u64) {
    registry.close(id);
}

#[cfg(test)]
#[path = "terminal_pty_tests.rs"]
mod tests;

//! Embedded workspace terminal (Wave B9).
//!
//! A managed [`TerminalRegistry`] owns one real pty per open terminal tab —
//! ConPTY on Windows, a native pty on macOS/Linux, both behind
//! `portable_pty`'s one cross-platform API. Four commands drive it:
//! [`terminal_open`], [`terminal_write`], [`terminal_resize`],
//! [`terminal_close`]. Every terminal is identified by a CLIENT-SUPPLIED
//! `id` (not server-generated): the frontend registers its
//! `clio:terminal-data` / `clio:terminal-exit` listeners — both fixed,
//! shared event names carrying `id` in the payload, mirroring
//! `sse_bridge.rs`'s keyed `gact:sse` channel — BEFORE calling
//! `terminal_open`, so the shell's first prompt can never race a
//! not-yet-registered listener.
//!
//! Each terminal runs TWO background threads:
//! - a **reader** thread (`run_reader`, built on `terminal_reader.rs`)
//!   that only reads pty output and emits `clio:terminal-data` chunks;
//! - a **waiter** thread (`run_waiter`) that blocks on `child.wait()` —
//!   the real process, not the pty pipe — and is what actually detects a
//!   shell exiting on its own. This split matters on Windows: ConPTY keeps
//!   the output pipe open until `ClosePseudoConsole` runs, so a shell that
//!   exits by itself never makes the reader's `read()` return; only
//!   `child.wait()` (via `WaitForSingleObject` on the process handle) sees
//!   it. Once the waiter's `wait()` returns, it drops the pty's `master`
//!   (unblocking the reader) and, unless this was an explicit
//!   `terminal_close`, emits `clio:terminal-exit` and forgets the entry.
//!
//! Killing a child from `terminal_close`/`shutdown_all` happens through a
//! `ChildKiller` split off via `Child::clone_killer()` — portable_pty's own
//! documented mechanism for signaling a child from a thread OTHER than the
//! one blocked in `.wait()` (using the same `Mutex<Box<dyn Child>>` for
//! both would deadlock: the waiter thread holds that lock for the entire
//! blocking `wait()` call).
//!
//! Every terminal is reaped from [`TerminalRegistry::shutdown_all`], called
//! from `shutdown_owned_services` in `lib.rs` on both the graceful quit path
//! and the native `RunEvent::Exit` path, so a shell can never outlive the
//! desktop process — the same owned-process guarantee `TunnelManager` and
//! the sidecar `Supervisor` already give the SSH tunnels and the backend.

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use portable_pty::{
    native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize,
};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
#[cfg(unix)]
use std::time::{Duration, Instant};
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

/// Shell candidates in preference order, honoring an explicit override
/// (used only by tests — the `terminal_open` command itself never accepts
/// a client-chosen shell; server-side candidates only).
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
    // and a read would block forever instead of returning 0. (On Windows,
    // exit detection does not depend on this at all — see the waiter
    // thread docs above.)
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

/// Whether `pid` still refers to a live process. Unix only: the Windows
/// termination path (`ChildKiller::kill` = `TerminateProcess`) needs no
/// polling escalation — see [`terminate_all`].
#[cfg(unix)]
fn pid_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

/// One live terminal: everything needed to write to it, resize it, and kill
/// its child.
///
/// `child` is touched ONLY by the waiter thread's blocking `wait()` — never
/// by `close()`/`shutdown_all()`, which use `killer` instead (see the
/// module docs on why: `child`'s lock is held for the ENTIRE blocking
/// `wait()` call, so anything needing to signal the process from another
/// thread must not contend on that same lock).
pub(crate) struct TerminalHandle {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    // Only read by the Unix escalation path in `terminate_all` and the
    // `#[cfg(test)]` `pid()` accessor — a non-Unix, non-test build never
    // touches it.
    #[cfg_attr(not(unix), allow(dead_code))]
    pid: Option<u32>,
    /// Watched by the reader thread's read loop.
    stop: Arc<AtomicBool>,
    /// Set before an explicit `close()`/`shutdown_all()` terminates the
    /// child, so the waiter thread — whose blocked `wait()` that same kill
    /// unblocks — knows this exit was requested, not organic, and skips
    /// emitting `clio:terminal-exit` (the frontend already knows).
    user_closed: Arc<AtomicBool>,
    waiter: Mutex<Option<thread::JoinHandle<()>>>,
}

/// Signals every handle to terminate, escalating a stubborn Unix child from
/// `ChildKiller::kill` (SIGHUP — see `portable_pty`'s `ProcessSignaller`,
/// which unlike `std::process::Child::kill` does NOT retry/escalate on its
/// own) to SIGKILL. Bounded to ~2s TOTAL across every handle passed in, not
/// per terminal, so `shutdown_all` on the synchronous `RunEvent::Exit` path
/// can never hang the whole app on N stuck shells.
fn terminate_all(handles: &[Arc<TerminalHandle>]) {
    for handle in handles {
        handle.user_closed.store(true, Ordering::SeqCst);
        handle.stop.store(true, Ordering::Relaxed);
        if let Ok(mut killer) = handle.killer.lock() {
            let _ = killer.kill();
        }
    }
    // Dropping the master closes the pty (ConPTY's `ClosePseudoConsole` on
    // Windows, the pty fd on Unix) right away, unblocking each reader
    // thread's `read()` without waiting on the child to actually exit.
    for handle in handles {
        if let Ok(mut master_slot) = handle.master.lock() {
            master_slot.take();
        }
    }
    #[cfg(unix)]
    {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let still_alive: Vec<u32> = handles
                .iter()
                .filter_map(|handle| handle.pid)
                .filter(|&pid| pid_alive(pid))
                .collect();
            if still_alive.is_empty() {
                break;
            }
            if Instant::now() >= deadline {
                for pid in still_alive {
                    // killpg, not kill: `spawn_command` sets up the child
                    // as a session leader (`setsid()`, see portable_pty's
                    // unix spawn path), so its pid IS its process group id
                    // — signaling the group reaps any grandchildren
                    // (e.g. a shell's own background jobs) too, not just
                    // the single tracked process.
                    unsafe {
                        libc::killpg(pid as i32, libc::SIGKILL);
                    }
                }
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
    }
}

/// Tauri-managed state tracking every open embedded terminal, keyed by the
/// client-supplied terminal id (see the module docs).
pub struct TerminalRegistry {
    handles: Mutex<HashMap<String, Arc<TerminalHandle>>>,
}

impl TerminalRegistry {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }

    /// Registers an already-spawned pty's writer/master/child under `id`.
    /// Errors if `id` is already in use (a client bug, or a replayed id).
    pub(crate) fn register(
        &self,
        id: String,
        writer: Box<dyn Write + Send>,
        master: Box<dyn MasterPty + Send>,
        child: Box<dyn Child + Send + Sync>,
    ) -> Result<Arc<TerminalHandle>, String> {
        let pid = child.process_id();
        let killer = child.clone_killer();
        let handle = Arc::new(TerminalHandle {
            writer: Mutex::new(writer),
            master: Mutex::new(Some(master)),
            child: Mutex::new(child),
            killer: Mutex::new(killer),
            pid,
            stop: Arc::new(AtomicBool::new(false)),
            user_closed: Arc::new(AtomicBool::new(false)),
            waiter: Mutex::new(None),
        });
        let mut guard = self
            .handles
            .lock()
            .map_err(|_| "terminal registry lock poisoned".to_string())?;
        if guard.contains_key(&id) {
            return Err(format!("terminal id {id} already in use"));
        }
        guard.insert(id, handle.clone());
        Ok(handle)
    }

    pub(crate) fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
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

    pub(crate) fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let handle = self.get(id)?;
        let master_slot = handle
            .master
            .lock()
            .map_err(|_| "terminal master lock poisoned".to_string())?;
        let master = master_slot
            .as_ref()
            .ok_or_else(|| format!("terminal {id} is closing"))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| format!("pty resize: {error}"))
    }

    /// Explicit close: terminates the child immediately, removes the entry
    /// so no later write/resize/close can find it, and blocks until the
    /// waiter thread has actually reaped it. A repeat close (or one that
    /// races the shell exiting on its own) is a harmless no-op.
    pub(crate) fn close(&self, id: &str) {
        let Some(handle) = self.take(id) else {
            return;
        };
        terminate_all(std::slice::from_ref(&handle));
        let waiter = handle.waiter.lock().ok().and_then(|mut guard| guard.take());
        if let Some(join) = waiter {
            let _ = join.join();
        }
    }

    /// Drops bookkeeping for a terminal whose waiter thread detected a
    /// natural exit. The child is already reaped — this only forgets the
    /// entry, mirroring `SseRegistry::forget`.
    pub(crate) fn forget(&self, id: &str) {
        let _ = self.take(id);
    }

    /// Terminates + reaps every live terminal. Called once from
    /// `shutdown_owned_services` on both the graceful quit path and the
    /// native `RunEvent::Exit` path.
    pub fn shutdown_all(&self) {
        let handles: Vec<Arc<TerminalHandle>> = match self.handles.lock() {
            Ok(mut guard) => guard.drain().map(|(_, v)| v).collect(),
            Err(poisoned) => poisoned.into_inner().drain().map(|(_, v)| v).collect(),
        };
        terminate_all(&handles);
        for handle in handles {
            let waiter = handle.waiter.lock().ok().and_then(|mut guard| guard.take());
            if let Some(join) = waiter {
                let _ = join.join();
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn pid(&self, id: &str) -> Option<u32> {
        self.get(id).ok()?.pid
    }

    /// Test-only: read back the pty's current size (cols, rows) so a resize
    /// test can verify `resize()` actually took effect, not just that it
    /// returned `Ok`.
    #[cfg(test)]
    pub(crate) fn size(&self, id: &str) -> Result<(u16, u16), String> {
        let handle = self.get(id)?;
        let master_slot = handle
            .master
            .lock()
            .map_err(|_| "terminal master lock poisoned".to_string())?;
        let master = master_slot
            .as_ref()
            .ok_or_else(|| format!("terminal {id} is closing"))?;
        let size = master
            .get_size()
            .map_err(|error| format!("pty get_size: {error}"))?;
        Ok((size.cols, size.rows))
    }

    fn get(&self, id: &str) -> Result<Arc<TerminalHandle>, String> {
        self.handles
            .lock()
            .map_err(|_| "terminal registry lock poisoned".to_string())?
            .get(id)
            .cloned()
            .ok_or_else(|| format!("unknown terminal id {id}"))
    }

    fn take(&self, id: &str) -> Option<Arc<TerminalHandle>> {
        match self.handles.lock() {
            Ok(mut guard) => guard.remove(id),
            Err(poisoned) => poisoned.into_inner().remove(id),
        }
    }
}

impl Default for TerminalRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, serde::Serialize)]
struct TerminalDataPayload {
    id: String,
    /// Base64-encoded pty output — a shell's bytes are not guaranteed to be
    /// valid UTF-8 at an arbitrary chunk boundary, and the rest of this
    /// bridge (`gact_http_response.rs`) already uses base64 for the same
    /// reason.
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct TerminalExitPayload {
    id: String,
    code: Option<i32>,
}

/// Reads and emits `clio:terminal-data` until the pty closes. Only reads —
/// see the module docs for why exit detection lives in [`run_waiter`]
/// instead.
fn run_reader(id: String, reader: Box<dyn Read + Send>, stop: Arc<AtomicBool>, app: tauri::AppHandle) {
    run_terminal_reader(
        &id,
        reader,
        stop.as_ref(),
        |chunk| {
            let _ = app.emit(
                "clio:terminal-data",
                TerminalDataPayload {
                    id: id.clone(),
                    data: BASE64_STANDARD.encode(chunk.bytes),
                },
            );
        },
        |dropped_id, reason, len| {
            eprintln!("[terminal_pty] dropped {len} bytes id={dropped_id} reason={reason:?}");
        },
    );
}

/// The waiter's core exit-detection: blocks on `child.wait()` — the real
/// process, never the pty pipe (see the module docs on why) — then drops
/// the master to unblock the reader thread. Returns the exit code if one
/// could be determined.
///
/// Split out from [`run_waiter`] (which also decides whether to emit
/// `clio:terminal-exit` and needs a live `AppHandle`) so this core
/// mechanism — the actual fix for ConPTY holding its pipe open past
/// process exit — is unit-testable without booting a Tauri app.
fn wait_for_exit(handle: &TerminalHandle) -> Option<i32> {
    let code = {
        let mut child = match handle.child.lock() {
            Ok(child) => child,
            Err(poisoned) => poisoned.into_inner(),
        };
        child.wait().ok().map(|status| status.exit_code() as i32)
    };
    handle.stop.store(true, Ordering::Relaxed);
    if let Ok(mut master_slot) = handle.master.lock() {
        master_slot.take();
    }
    code
}

/// Blocks on `child.wait()` — the real process, not the pty pipe — so a
/// shell that exits on its own is detected even when ConPTY keeps the
/// output pipe open. See the module docs for the full sequencing.
fn run_waiter(id: String, handle: Arc<TerminalHandle>, app: tauri::AppHandle) {
    let code = wait_for_exit(&handle);
    if handle.user_closed.load(Ordering::SeqCst) {
        // `close()`/`shutdown_all()` already own cleanup and are joining
        // this very thread — nothing left to do.
        return;
    }
    if let Some(registry) = app.try_state::<TerminalRegistry>() {
        registry.forget(&id);
    }
    let _ = app.emit("clio:terminal-exit", TerminalExitPayload { id, code });
}

/// Open a new embedded terminal rooted at `cwd`, under the caller-supplied
/// `id` (see the module docs on why the id is client-chosen). `cwd` is
/// validated exactly like the OS-terminal path
/// (`workspace_terminal::resolve_workspace_dir`): it must canonicalize to a
/// directory that exists, which is the only "known workspace root" check
/// the desktop has today. Runs off the main thread (`async` command
/// option) — spawning a pty and two threads is cheap, but a plain `fn`
/// command would still tie up the same dispatcher the write/resize/close
/// commands need to stay responsive on.
#[tauri::command(async)]
pub fn terminal_open(
    app: tauri::AppHandle,
    registry: tauri::State<'_, TerminalRegistry>,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let workspace = crate::workspace_terminal::resolve_workspace_dir(&cwd)?;
    let SpawnedPty {
        master,
        writer,
        reader,
        child,
    } = spawn_shell(&workspace, cols, rows, None)?;
    let handle = registry.register(id.clone(), writer, master, child)?;
    eprintln!("[terminal_pty] open id={id} cwd={}", workspace.display());

    let reader_app = app.clone();
    let reader_id = id.clone();
    let reader_stop = handle.stop.clone();
    if let Err(error) = thread::Builder::new()
        .name(format!("clio-terminal-reader-{id}"))
        .spawn(move || run_reader(reader_id, reader, reader_stop, reader_app))
    {
        registry.close(&id);
        return Err(format!("terminal reader thread spawn: {error}"));
    }

    let waiter_app = app.clone();
    let waiter_id = id.clone();
    let waiter_handle = handle.clone();
    match thread::Builder::new()
        .name(format!("clio-terminal-waiter-{id}"))
        .spawn(move || run_waiter(waiter_id, waiter_handle, waiter_app))
    {
        Ok(join) => {
            if let Ok(mut slot) = handle.waiter.lock() {
                *slot = Some(join);
            }
        }
        Err(error) => {
            registry.close(&id);
            return Err(format!("terminal waiter thread spawn: {error}"));
        }
    }

    Ok(())
}

/// Write keystrokes (or pasted text) into a terminal's pty.
#[tauri::command(async)]
pub fn terminal_write(
    registry: tauri::State<'_, TerminalRegistry>,
    id: String,
    data: String,
) -> Result<(), String> {
    registry.write(&id, data.as_bytes())
}

/// Resize a terminal's pty to match its pane.
#[tauri::command(async)]
pub fn terminal_resize(
    registry: tauri::State<'_, TerminalRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.resize(&id, cols, rows)
}

/// Close a terminal: kills its shell and forgets it. Idempotent.
#[tauri::command(async)]
pub fn terminal_close(registry: tauri::State<'_, TerminalRegistry>, id: String) {
    registry.close(&id);
}

#[cfg(test)]
#[path = "terminal_pty_tests.rs"]
mod tests;

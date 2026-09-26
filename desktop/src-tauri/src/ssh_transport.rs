//! Reusable interactive system-OpenSSH sessions for CLIO-owned infrastructure.
//!
//! The desktop owns authentication and the live byte transport only. CLIO
//! owns targets, service drivers, operation state, and the commands sent over
//! this channel. Keeping OpenSSH in a PTY preserves host-key confirmation,
//! keyboard-interactive/Duo, rolling passwords, Kerberos, agents, security
//! keys, certificates, and ProxyJump without reimplementing SSH.
//!
//! Port forwards ride the same authenticated connection through OpenSSH's
//! `-D` SOCKS listener (see `ssh_transport_forward`), so a forward never needs
//! a second login.

use portable_pty::{ChildKiller, CommandBuilder, MasterPty};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

use crate::blocking_command::off_main;
use crate::ssh_transport_command::{
    compatible_route, posix_command, powershell_command, safe_host, ssh_arguments,
    validate_command, validate_route, SshTransportRoute, TransportCommand,
};
use crate::ssh_transport_forward::{free_loopback_port, start_forward, verify_http, LocalForward};
use crate::ssh_transport_output::{
    classify_prompt, clean_transport_log, last_meaningful_line, SshPrompt,
};
use crate::ssh_transport_steps::{classify_command, parse_marker_blocks, step_event, SshStepEvent};
use crate::terminal_pty::spawn_command;

const READY_MARKER: &str = "__CLIO_SSH_READY__";
const OUTPUT_LIMIT: usize = 4 * 1024 * 1024;
/// How much of the newest output prompt detection looks at.
const PROMPT_WINDOW: usize = 4096;
/// Logs of recently ended sessions kept so a failure can still be explained.
const CLOSED_LOG_LIMIT: usize = 8;
/// Attempts, one second apart, to see the freshly started service answer
/// through a new tunnel.
const TUNNEL_VERIFY_ATTEMPTS: usize = 5;

#[derive(Deserialize)]
pub struct SshTransportOpenRequest {
    pub target_id: String,
    pub route: SshTransportRoute,
    #[serde(default = "default_interactive")]
    pub interactive: bool,
}

fn default_interactive() -> bool {
    true
}

#[derive(Clone, Serialize)]
pub struct SshTransportStatus {
    pub session_id: String,
    pub state: String,
    pub reused: bool,
    pub output: String,
    /// The authentication question OpenSSH is waiting on, if any.
    pub prompt: Option<SshPrompt>,
    /// For a session that has ended: OpenSSH's own last words, cleaned
    /// ("alice@node: Permission denied (publickey)."), for a one-line reason.
    pub failure: Option<String>,
}

#[derive(Serialize)]
pub struct TransportCommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Serialize)]
struct SshDataEvent {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct SshStateEvent {
    session_id: String,
    state: String,
    prompt: Option<SshPrompt>,
}

struct Capture {
    text: String,
    state: String,
    prompt: Option<SshPrompt>,
}

struct Session {
    id: String,
    route: SshTransportRoute,
    socks_port: u16,
    pid: Option<u32>,
    exited: AtomicBool,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    capture: Arc<(Mutex<Capture>, Condvar)>,
    operation: Mutex<()>,
    forwards: Mutex<Vec<LocalForward>>,
}

impl Session {
    fn write(&self, bytes: &[u8]) -> Result<(), String> {
        let mut writer = self
            .writer
            .lock()
            .map_err(|_| "SSH transport writer lock poisoned".to_string())?;
        writer
            .write_all(bytes)
            .map_err(|error| format!("write SSH transport: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("flush SSH transport: {error}"))
    }

    fn status(&self, reused: bool) -> Result<SshTransportStatus, String> {
        let (lock, _) = &*self.capture;
        let capture = lock
            .lock()
            .map_err(|_| "SSH transport capture lock poisoned".to_string())?;
        Ok(SshTransportStatus {
            session_id: self.id.clone(),
            state: capture.state.clone(),
            reused,
            output: capture.text.clone(),
            prompt: capture.prompt.clone(),
            failure: None,
        })
    }

    fn state(&self) -> Result<String, String> {
        Ok(self.status(true)?.state)
    }

    fn clean_log(&self) -> String {
        let (lock, _) = &*self.capture;
        lock.lock()
            .map(|capture| clean_transport_log(&capture.text))
            .unwrap_or_default()
    }

    fn stop_forwards(&self) {
        if let Ok(mut forwards) = self.forwards.lock() {
            for forward in forwards.drain(..) {
                forward.stop();
            }
        }
    }

    /// End the session and everything OpenSSH started for it — including the
    /// `ssh -W` helper processes a `-J` route spawns, which would otherwise
    /// outlive their parent on Windows.
    fn close(&self) {
        self.stop_forwards();
        if !self.exited.load(Ordering::SeqCst) {
            if let Some(pid) = self.pid {
                kill_process_tree(pid);
            }
        }
        if let Ok(mut killer) = self.killer.lock() {
            let _ = killer.kill();
        }
        if let Ok(mut master) = self.master.lock() {
            master.take();
        }
    }
}

#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use crate::supervisor_shutdown::{
        owned_descendants, windows_process_snapshot, windows_terminate,
    };
    let descendants = owned_descendants(&windows_process_snapshot(), &[pid]);
    for child in descendants.into_iter().rev() {
        windows_terminate(child);
    }
}

#[cfg(unix)]
fn kill_process_tree(pid: u32) {
    // portable-pty starts the child as a session leader, so its process
    // group is exactly OpenSSH plus every helper it spawned.
    crate::supervisor_shutdown::terminate_process_group(pid, libc::SIGKILL);
}

pub struct SshTransportRegistry {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    target_sessions: Mutex<HashMap<String, String>>,
    authenticating: Mutex<Option<String>>,
    closed_logs: Mutex<VecDeque<(String, String)>>,
}

impl SshTransportRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            target_sessions: Mutex::new(HashMap::new()),
            authenticating: Mutex::new(None),
            closed_logs: Mutex::new(VecDeque::new()),
        }
    }

    fn get(&self, id: &str) -> Result<Arc<Session>, String> {
        self.sessions
            .lock()
            .map_err(|_| "SSH transport registry lock poisoned".to_string())?
            .get(id)
            .cloned()
            .ok_or_else(|| format!("SSH transport session {id} is not open"))
    }

    fn find_route(&self, route: &SshTransportRoute) -> Result<Option<Arc<Session>>, String> {
        Ok(self
            .sessions
            .lock()
            .map_err(|_| "SSH transport registry lock poisoned".to_string())?
            .values()
            .find(|session| compatible_route(&session.route, route))
            .cloned())
    }

    fn for_target(&self, target_id: &str) -> Result<Option<Arc<Session>>, String> {
        let session_id = self
            .target_sessions
            .lock()
            .map_err(|_| "SSH target-session registry lock poisoned".to_string())?
            .get(target_id)
            .cloned();
        session_id.map(|id| self.get(&id)).transpose()
    }

    fn insert(&self, target_id: &str, session: Arc<Session>) -> Result<(), String> {
        let session_id = session.id.clone();
        self.sessions
            .lock()
            .map_err(|_| "SSH transport registry lock poisoned".to_string())?
            .insert(session_id.clone(), session);
        self.target_sessions
            .lock()
            .map_err(|_| "SSH target-session registry lock poisoned".to_string())?
            .insert(target_id.to_string(), session_id);
        Ok(())
    }

    fn associate(&self, target_id: &str, session_id: &str) -> Result<(), String> {
        self.target_sessions
            .lock()
            .map_err(|_| "SSH target-session registry lock poisoned".to_string())?
            .insert(target_id.to_string(), session_id.to_string());
        Ok(())
    }

    /// Drop a session from the registry, keeping its cleaned log for
    /// `ssh_transport_log`.
    fn remove(&self, id: &str) -> Option<Arc<Session>> {
        let session = self.sessions.lock().ok()?.remove(id);
        if let Some(session) = &session {
            if let Ok(mut targets) = self.target_sessions.lock() {
                targets.retain(|_, session_id| session_id != id);
            }
            self.remember_log(id, session.clean_log());
        }
        session
    }

    fn remember_log(&self, id: &str, log: String) {
        if let Ok(mut logs) = self.closed_logs.lock() {
            logs.retain(|(session_id, _)| session_id != id);
            logs.push_back((id.to_string(), log));
            while logs.len() > CLOSED_LOG_LIMIT {
                logs.pop_front();
            }
        }
    }

    /// The cleaned log of a session that ended recently.
    fn closed_log(&self, session_id: &str) -> Result<String, String> {
        let logs = self
            .closed_logs
            .lock()
            .map_err(|_| "SSH transport log lock poisoned".to_string())?;
        let found = logs
            .iter()
            .find(|(id, _)| id == session_id)
            .map(|(_, log)| log.clone());
        found.ok_or_else(|| format!("SSH transport session {session_id} is not known"))
    }

    fn detach_target(&self, target_id: &str, session_id: &str) -> Result<bool, String> {
        let mut targets = self
            .target_sessions
            .lock()
            .map_err(|_| "SSH target-session registry lock poisoned".to_string())?;
        if targets
            .get(target_id)
            .is_some_and(|value| value == session_id)
        {
            targets.remove(target_id);
        }
        Ok(!targets.values().any(|value| value == session_id))
    }

    pub fn shutdown_all(&self) {
        let sessions = self
            .sessions
            .lock()
            .map(|mut sessions| sessions.drain().map(|(_, item)| item).collect::<Vec<_>>())
            .unwrap_or_default();
        for session in sessions {
            session.close();
        }
        if let Ok(mut targets) = self.target_sessions.lock() {
            targets.clear();
        }
    }
}

fn emit_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    session_id: &str,
    state: &str,
    prompt: Option<SshPrompt>,
) {
    let _ = app.emit(
        "clio:ssh-transport-state",
        SshStateEvent {
            session_id: session_id.to_string(),
            state: state.to_string(),
            prompt,
        },
    );
}

fn ssh_transport_open_blocking(
    app: &tauri::AppHandle,
    request: SshTransportOpenRequest,
) -> Result<SshTransportStatus, String> {
    let registry = app.state::<SshTransportRegistry>();
    validate_route(&request.route)?;
    if let Some(previous) = registry.for_target(&request.target_id)? {
        if compatible_route(&previous.route, &request.route) {
            return previous.status(true);
        }
        if registry.detach_target(&request.target_id, &previous.id)? {
            if let Some(orphaned) = registry.remove(&previous.id) {
                orphaned.close();
            }
        }
    }
    if let Some(existing) = registry.find_route(&request.route)? {
        registry.associate(&request.target_id, &existing.id)?;
        return existing.status(true);
    }
    if request.interactive {
        let mut authenticating = registry
            .authenticating
            .lock()
            .map_err(|_| "SSH authentication lock poisoned".to_string())?;
        if let Some(active) = authenticating.as_ref() {
            return Err(format!(
                "Finish authenticating {active} before opening another SSH connection"
            ));
        }
        *authenticating = Some(request.target_id.clone());
    }
    let release_authentication = || {
        if let Ok(mut authenticating) = registry.authenticating.lock() {
            *authenticating = None;
        }
    };

    let socks_port = free_loopback_port().inspect_err(|_| release_authentication())?;
    let mut command = CommandBuilder::new("ssh");
    for argument in ssh_arguments(&request.route, request.interactive, socks_port) {
        command.arg(argument);
    }
    let remote_command = if request.route.platform == "windows" {
        format!(
            "powershell -NoLogo -NoProfile -Command \"Write-Output '{READY_MARKER}'; while (($line = [Console]::In.ReadLine()) -ne $null) {{ Invoke-Expression $line }}\""
        )
    } else {
        format!("sh -lc \"stty -echo; printf '{READY_MARKER}\\n'; exec sh -s\"")
    };
    command.arg(remote_command);
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let spawned =
        spawn_command(&cwd, 100, 30, command).inspect_err(|_| release_authentication())?;
    let initial_state = if request.interactive {
        "reauthentication_required"
    } else {
        "reconnecting"
    };
    let capture = Arc::new((
        Mutex::new(Capture {
            text: String::new(),
            state: initial_state.to_string(),
            prompt: None,
        }),
        Condvar::new(),
    ));
    let id = format!("ssh-{:016x}", rand::random::<u64>());
    let session = Arc::new(Session {
        id: id.clone(),
        route: request.route,
        socks_port,
        pid: spawned.child.process_id(),
        exited: AtomicBool::new(false),
        writer: Mutex::new(spawned.writer),
        master: Mutex::new(Some(spawned.master)),
        killer: Mutex::new(spawned.child.clone_killer()),
        capture,
        operation: Mutex::new(()),
        forwards: Mutex::new(Vec::new()),
    });
    registry.insert(&request.target_id, session.clone())?;

    let reader_app = app.clone();
    let reader_session = session.clone();
    thread::spawn(move || read_transport(reader_app, reader_session, spawned.reader));
    let waiter_app = app.clone();
    let waiter_session = session.clone();
    thread::spawn(move || {
        let mut child = spawned.child;
        let _ = child.wait();
        waiter_session.exited.store(true, Ordering::SeqCst);
        // Wake a command waiting on output: it ends now, not at its deadline.
        waiter_session.capture.1.notify_all();
        waiter_session.stop_forwards();
        if let Some(registry) = waiter_app.try_state::<SshTransportRegistry>() {
            registry.remove(&waiter_session.id);
            if let Ok(mut authenticating) = registry.authenticating.lock() {
                *authenticating = None;
            }
        }
        emit_state(&waiter_app, &waiter_session.id, "disconnected", None);
    });

    session.status(false)
}

/// The newest `PROMPT_WINDOW` bytes of `text`, cut on a character boundary.
fn tail(text: &str) -> &str {
    let mut start = text.len().saturating_sub(PROMPT_WINDOW);
    while !text.is_char_boundary(start) {
        start += 1;
    }
    &text[start..]
}

fn read_transport<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    session: Arc<Session>,
    mut reader: Box<dyn Read + Send>,
) {
    let mut bytes = [0_u8; 8192];
    while let Ok(count) = reader.read(&mut bytes) {
        if count == 0 {
            break;
        }
        let data = String::from_utf8_lossy(&bytes[..count]).to_string();
        let (lock, wake) = &*session.capture;
        if let Ok(mut capture) = lock.lock() {
            capture.text.push_str(&data);
            if capture.text.len() > OUTPUT_LIMIT {
                let mut drain = capture.text.len() - OUTPUT_LIMIT;
                while !capture.text.is_char_boundary(drain) {
                    drain += 1;
                }
                capture.text.drain(..drain);
            }
            if capture.state != "connected" {
                if capture.text.contains(READY_MARKER) {
                    capture.state = "connected".to_string();
                    capture.prompt = None;
                    if let Some(registry) = app.try_state::<SshTransportRegistry>() {
                        if let Ok(mut authenticating) = registry.authenticating.lock() {
                            *authenticating = None;
                        }
                    }
                    emit_state(&app, &session.id, "connected", None);
                } else {
                    let prompt = classify_prompt(tail(&capture.text));
                    if prompt != capture.prompt {
                        capture.prompt = prompt.clone();
                        let state = capture.state.clone();
                        emit_state(&app, &session.id, &state, prompt);
                    }
                }
            }
            wake.notify_all();
        }
        let _ = app.emit(
            "clio:ssh-transport-data",
            SshDataEvent {
                session_id: session.id.clone(),
                data,
            },
        );
    }
}

fn ssh_transport_status_blocking(
    app: &tauri::AppHandle,
    session_id: String,
) -> Result<SshTransportStatus, String> {
    let registry = app.state::<SshTransportRegistry>();
    if let Ok(session) = registry.get(&session_id) {
        return session.status(true);
    }
    // A session that just ended answers with why, instead of "not open".
    let log = registry.closed_log(&session_id)?;
    Ok(ended_status(session_id, log))
}

/// The status of a session that has ended, carrying its cleaned log.
fn ended_status(session_id: String, log: String) -> SshTransportStatus {
    SshTransportStatus {
        failure: Some(
            last_meaningful_line(&log)
                .unwrap_or_else(|| "OpenSSH closed the connection without saying why".to_string()),
        ),
        session_id,
        state: "disconnected".to_string(),
        reused: true,
        output: log,
        prompt: None,
    }
}

/// The session's output as a person reads it: control sequences, transport
/// markers, and idle prompts removed. Also answers for a session that has
/// just ended, so its failure can still be explained.
fn ssh_transport_log_blocking(
    app: &tauri::AppHandle,
    session_id: String,
) -> Result<String, String> {
    let registry = app.state::<SshTransportRegistry>();
    if let Ok(session) = registry.get(&session_id) {
        return Ok(session.clean_log());
    }
    registry.closed_log(&session_id)
}

fn ssh_transport_write_blocking(
    app: &tauri::AppHandle,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let registry = app.state::<SshTransportRegistry>();
    registry.get(&session_id)?.write(data.as_bytes())
}

fn ssh_transport_exec_blocking(
    app: &tauri::AppHandle,
    session_id: String,
    command: TransportCommand,
) -> Result<TransportCommandResult, String> {
    let registry = app.state::<SshTransportRegistry>();
    validate_command(&command)?;
    let session = registry.get(&session_id)?;
    if session.state()? != "connected" {
        return Err("SSH authentication is not complete".to_string());
    }
    let _operation = session
        .operation
        .lock()
        .map_err(|_| "SSH operation lock poisoned".to_string())?;
    execute_remote(&session, command, |event| {
        let _ = app.emit("clio:ssh-transport-step", event);
    })
}

fn execute_remote(
    session: &Session,
    command: TransportCommand,
    emit: impl Fn(SshStepEvent),
) -> Result<TransportCommandResult, String> {
    let request_id = format!("{:016x}", rand::random::<u64>());
    let kind = classify_command(&command.program, &command.args);
    let begin = format!("__CLIO_BEGIN_{request_id}__");
    let end = format!("__CLIO_END_{request_id}__:");
    let line = if session.route.platform == "windows" {
        powershell_command(&command, &begin, &end)
    } else {
        posix_command(&command, &begin, &end)
    };
    let (lock, wake) = &*session.capture;
    let start = lock
        .lock()
        .map_err(|_| "SSH transport capture lock poisoned".to_string())?
        .text
        .len();
    session.write(line.as_bytes())?;
    let deadline = Instant::now() + Duration::from_secs_f64(command.timeout_seconds);
    let mut capture = lock
        .lock()
        .map_err(|_| "SSH transport capture lock poisoned".to_string())?;
    let mut last_emitted: Option<(&'static str, String)> = None;
    loop {
        let observed = capture.text.get(start..).unwrap_or(&capture.text);
        if let Some(block) = parse_marker_blocks(observed)
            .into_iter()
            .find(|block| block.id == request_id)
        {
            let event = step_event(&session.id, kind, &block, &command.allowed_exit_codes);
            let signature = (event.phase, event.detail.clone());
            if last_emitted.as_ref() != Some(&signature) {
                last_emitted = Some(signature);
                emit(event);
            }
            if let Some(status) = block.exit_code {
                let output = block.body.trim_matches(['\r', '\n']).to_string();
                if !command.allowed_exit_codes.contains(&status) {
                    let readable = clean_transport_log(&output);
                    return Err(if readable.is_empty() {
                        format!("Remote command exited with status {status}")
                    } else {
                        readable
                    });
                }
                return Ok(TransportCommandResult {
                    exit_code: status,
                    stdout: output,
                    stderr: String::new(),
                });
            }
        }
        let now = Instant::now();
        let closed = session.exited.load(Ordering::SeqCst);
        if closed || now >= deadline {
            let reason = if closed {
                "The SSH connection closed before the remote command finished".to_string()
            } else {
                format!(
                    "Remote command timed out after {:.0} seconds",
                    command.timeout_seconds
                )
            };
            emit(SshStepEvent {
                session_id: session.id.clone(),
                request_id: request_id.clone(),
                kind,
                phase: "failed",
                exit_code: None,
                detail: reason.clone(),
            });
            return Err(reason);
        }
        let wait = deadline
            .saturating_duration_since(now)
            .min(Duration::from_millis(500));
        let (next, _) = wake
            .wait_timeout(capture, wait)
            .map_err(|_| "SSH transport capture lock poisoned".to_string())?;
        capture = next;
    }
}

/// Forward a loopback port to `remote_host:remote_port` as seen from the
/// destination host, over the session that is already authenticated.
fn ssh_transport_forward_blocking(
    app: &tauri::AppHandle,
    session_id: String,
    remote_host: String,
    remote_port: u16,
    local_port: Option<u16>,
) -> Result<String, String> {
    let registry = app.state::<SshTransportRegistry>();
    if !safe_host(&remote_host) {
        return Err("Invalid remote forward host".to_string());
    }
    let session = registry.get(&session_id)?;
    let mut forwards = session
        .forwards
        .lock()
        .map_err(|_| "SSH forward lock poisoned".to_string())?;
    if let Some(existing) = forwards
        .iter()
        .find(|forward| forward.remote_host == remote_host && forward.remote_port == remote_port)
    {
        return Ok(existing.url());
    }
    let request_id = format!("tunnel-{remote_port}");
    let emit = |phase: &'static str, detail: String| {
        let _ = app.emit(
            "clio:ssh-transport-step",
            SshStepEvent {
                session_id: session_id.clone(),
                request_id: request_id.clone(),
                kind: "tunnel",
                phase,
                exit_code: None,
                detail,
            },
        );
    };
    emit("running", String::new());
    let forward = start_forward(session.socks_port, &remote_host, remote_port, local_port)
        .inspect_err(|error| emit("failed", error.clone()))?;
    let mut verified = verify_http(forward.local_port);
    for _ in 1..TUNNEL_VERIFY_ATTEMPTS {
        if verified.is_ok() || session.exited.load(Ordering::SeqCst) {
            break;
        }
        thread::sleep(Duration::from_secs(1));
        verified = verify_http(forward.local_port);
    }
    if let Err(error) = verified {
        forward.stop();
        let reason = format!("The tunnel to remote port {remote_port} did not answer: {error}");
        emit("failed", reason.clone());
        return Err(reason);
    }
    emit("done", String::new());
    let url = forward.url();
    forwards.push(forward);
    Ok(url)
}

fn ssh_transport_close_blocking(
    app: &tauri::AppHandle,
    session_id: String,
    target_id: String,
) -> Result<(), String> {
    let registry = app.state::<SshTransportRegistry>();
    if registry.detach_target(&target_id, &session_id)? {
        if let Some(session) = registry.remove(&session_id) {
            session.close();
        }
    }
    Ok(())
}

/// Stop a session now, whoever else shares it: kill OpenSSH and every helper
/// it started. This is what Cancel means during a deployment.
fn ssh_transport_cancel_blocking(app: &tauri::AppHandle, session_id: String) -> Result<(), String> {
    let registry = app.state::<SshTransportRegistry>();
    if let Some(session) = registry.remove(&session_id) {
        session.close();
        if let Ok(mut authenticating) = registry.authenticating.lock() {
            *authenticating = None;
        }
        emit_state(&app, &session_id, "disconnected", None);
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_transport_open(
    app: tauri::AppHandle,
    request: SshTransportOpenRequest,
) -> Result<SshTransportStatus, String> {
    off_main(move || ssh_transport_open_blocking(&app, request)).await
}

#[tauri::command]
pub async fn ssh_transport_status(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<SshTransportStatus, String> {
    off_main(move || ssh_transport_status_blocking(&app, session_id)).await
}

#[tauri::command]
pub async fn ssh_transport_log(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<String, String> {
    off_main(move || ssh_transport_log_blocking(&app, session_id)).await
}

#[tauri::command]
pub async fn ssh_transport_write(
    app: tauri::AppHandle,
    session_id: String,
    data: String,
) -> Result<(), String> {
    off_main(move || ssh_transport_write_blocking(&app, session_id, data)).await
}

#[tauri::command]
pub async fn ssh_transport_exec(
    app: tauri::AppHandle,
    session_id: String,
    command: TransportCommand,
) -> Result<TransportCommandResult, String> {
    off_main(move || ssh_transport_exec_blocking(&app, session_id, command)).await
}

#[tauri::command]
pub async fn ssh_transport_forward(
    app: tauri::AppHandle,
    session_id: String,
    remote_host: String,
    remote_port: u16,
    local_port: Option<u16>,
) -> Result<String, String> {
    off_main(move || {
        ssh_transport_forward_blocking(&app, session_id, remote_host, remote_port, local_port)
    })
    .await
}

#[tauri::command]
pub async fn ssh_transport_close(
    app: tauri::AppHandle,
    session_id: String,
    target_id: String,
) -> Result<(), String> {
    off_main(move || ssh_transport_close_blocking(&app, session_id, target_id)).await
}

#[tauri::command]
pub async fn ssh_transport_cancel(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    off_main(move || ssh_transport_cancel_blocking(&app, session_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every transport command runs through `off_main`: a remote command
    /// that takes minutes must not hold up status polls, prompt answers, or
    /// Cancel issued meanwhile.
    #[test]
    fn a_slow_command_does_not_block_another_command() {
        tauri::async_runtime::block_on(async {
            let (release, gate) = std::sync::mpsc::channel::<()>();
            let slow = tauri::async_runtime::spawn(off_main(move || {
                gate.recv_timeout(Duration::from_secs(10))
                    .map_err(|error| error.to_string())?;
                Ok("exec finished")
            }));
            let started = Instant::now();
            let quick = off_main(|| Ok("status answered")).await;
            assert_eq!(quick.as_deref(), Ok("status answered"));
            assert!(started.elapsed() < Duration::from_secs(2));
            assert!(!slow.inner().is_finished());
            release.send(()).unwrap();
            assert_eq!(slow.await.unwrap(), Ok("exec finished"));
        });
    }

    #[test]
    fn an_ended_session_reports_openssh_own_reason() {
        let log = "ares-comp-10: Could not resolve hostname
jcernudagarcia@ares-comp-10: Permission denied (publickey).";
        let status = ended_status("ssh-1".to_string(), log.to_string());
        assert_eq!(status.state, "disconnected");
        assert_eq!(
            status.failure.as_deref(),
            Some("jcernudagarcia@ares-comp-10: Permission denied (publickey).")
        );
        assert_eq!(status.output, log);
        assert_eq!(
            ended_status("ssh-2".to_string(), String::new())
                .failure
                .as_deref(),
            Some("OpenSSH closed the connection without saying why")
        );
    }

    #[test]
    fn prompt_window_cuts_on_a_character_boundary() {
        let text = format!("{}é password: ", "x".repeat(PROMPT_WINDOW));
        assert!(tail(&text).ends_with("password: "));
        assert!(tail("short").eq("short"));
    }
}

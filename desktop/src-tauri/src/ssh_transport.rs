//! Reusable interactive system-OpenSSH sessions for CLIO-owned infrastructure.
//!
//! The desktop owns authentication and the live byte transport only. CLIO
//! owns targets, service drivers, operation state, and the commands sent over
//! this channel. Keeping OpenSSH in a PTY preserves host-key confirmation,
//! keyboard-interactive/Duo, rolling passwords, Kerberos, agents, security
//! keys, certificates, and ProxyJump without reimplementing SSH.

use portable_pty::{ChildKiller, CommandBuilder, MasterPty};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

use crate::terminal_pty::spawn_command;

const READY_MARKER: &str = "__CLIO_SSH_READY__";
const OUTPUT_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct SshTransportRoute {
    pub profile: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    #[serde(default)]
    pub jump_hosts: Vec<String>,
    #[serde(default)]
    pub identity_file: String,
    #[serde(default)]
    pub platform: String,
}

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
}

#[derive(Deserialize)]
pub struct TransportCommand {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub scope: String,
    pub timeout_seconds: f64,
    #[serde(default)]
    pub stdin: String,
    #[serde(default = "default_exit_codes")]
    pub allowed_exit_codes: Vec<i32>,
}

fn default_exit_codes() -> Vec<i32> {
    vec![0]
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
}

struct Capture {
    text: String,
    state: String,
}

struct Session {
    id: String,
    route: SshTransportRoute,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    capture: Arc<(Mutex<Capture>, Condvar)>,
    operation: Mutex<()>,
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

    fn state(&self) -> Result<String, String> {
        let (lock, _) = &*self.capture;
        Ok(lock
            .lock()
            .map_err(|_| "SSH transport capture lock poisoned".to_string())?
            .state
            .clone())
    }

    fn output(&self) -> Result<String, String> {
        let (lock, _) = &*self.capture;
        Ok(lock
            .lock()
            .map_err(|_| "SSH transport capture lock poisoned".to_string())?
            .text
            .clone())
    }

    fn close(&self) {
        if let Ok(mut killer) = self.killer.lock() {
            let _ = killer.kill();
        }
        if let Ok(mut master) = self.master.lock() {
            master.take();
        }
    }
}

pub struct SshTransportRegistry {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    target_sessions: Mutex<HashMap<String, String>>,
    authenticating: Mutex<Option<String>>,
}

impl SshTransportRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            target_sessions: Mutex::new(HashMap::new()),
            authenticating: Mutex::new(None),
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

    fn remove(&self, id: &str) -> Option<Arc<Session>> {
        let session = self.sessions.lock().ok()?.remove(id);
        if session.is_some() {
            self.target_sessions
                .lock()
                .ok()?
                .retain(|_, session_id| session_id != id);
        }
        session
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

#[tauri::command]
pub fn ssh_transport_open(
    app: tauri::AppHandle,
    registry: tauri::State<'_, SshTransportRegistry>,
    request: SshTransportOpenRequest,
) -> Result<SshTransportStatus, String> {
    validate_route(&request.route)?;
    if let Some(previous) = registry.for_target(&request.target_id)? {
        if compatible_route(&previous.route, &request.route) {
            return Ok(SshTransportStatus {
                session_id: previous.id.clone(),
                state: previous.state()?,
                reused: true,
                output: previous.output()?,
            });
        }
        if registry.detach_target(&request.target_id, &previous.id)? {
            if let Some(orphaned) = registry.remove(&previous.id) {
                orphaned.close();
            }
        }
    }
    if let Some(existing) = registry.find_route(&request.route)? {
        registry.associate(&request.target_id, &existing.id)?;
        return Ok(SshTransportStatus {
            session_id: existing.id.clone(),
            state: existing.state()?,
            reused: true,
            output: existing.output()?,
        });
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

    let mut command = CommandBuilder::new("ssh");
    for argument in ssh_arguments(&request.route, request.interactive) {
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
    let spawned = spawn_command(&cwd, 100, 30, command).map_err(|error| {
        if let Ok(mut authenticating) = registry.authenticating.lock() {
            *authenticating = None;
        }
        error
    })?;
    let capture = Arc::new((
        Mutex::new(Capture {
            text: String::new(),
            state: if request.interactive {
                "reauthentication_required".to_string()
            } else {
                "reconnecting".to_string()
            },
        }),
        Condvar::new(),
    ));
    let id = format!("ssh-{:016x}", rand::random::<u64>());
    let killer = spawned.child.clone_killer();
    let session = Arc::new(Session {
        id: id.clone(),
        route: request.route,
        writer: Mutex::new(spawned.writer),
        master: Mutex::new(Some(spawned.master)),
        killer: Mutex::new(killer),
        capture: capture.clone(),
        operation: Mutex::new(()),
    });
    registry.insert(&request.target_id, session.clone())?;

    let reader_app = app.clone();
    let reader_id = id.clone();
    thread::spawn(move || read_transport(reader_app, reader_id, spawned.reader));
    let waiter_app = app.clone();
    let waiter_id = id.clone();
    thread::spawn(move || {
        let mut child = spawned.child;
        let _ = child.wait();
        if let Some(registry) = waiter_app.try_state::<SshTransportRegistry>() {
            registry.remove(&waiter_id);
            if let Ok(mut authenticating) = registry.authenticating.lock() {
                *authenticating = None;
            }
        }
        let _ = waiter_app.emit(
            "clio:ssh-transport-state",
            SshStateEvent {
                session_id: waiter_id,
                state: "disconnected".to_string(),
            },
        );
    });

    Ok(SshTransportStatus {
        session_id: id,
        state: if request.interactive {
            "reauthentication_required".to_string()
        } else {
            "reconnecting".to_string()
        },
        reused: false,
        output: String::new(),
    })
}

fn read_transport<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    mut reader: Box<dyn Read + Send>,
) {
    let registry = app.state::<SshTransportRegistry>();
    let session = match registry.get(&id) {
        Ok(session) => session,
        Err(_) => return,
    };
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
                let drain = capture.text.len() - OUTPUT_LIMIT;
                capture.text.drain(..drain);
            }
            if capture.state != "connected" && capture.text.contains(READY_MARKER) {
                capture.state = "connected".to_string();
                if let Ok(mut authenticating) = registry.authenticating.lock() {
                    *authenticating = None;
                }
                let _ = app.emit(
                    "clio:ssh-transport-state",
                    SshStateEvent {
                        session_id: id.clone(),
                        state: "connected".to_string(),
                    },
                );
            }
            wake.notify_all();
        }
        let _ = app.emit(
            "clio:ssh-transport-data",
            SshDataEvent {
                session_id: id.clone(),
                data,
            },
        );
    }
}

#[tauri::command]
pub fn ssh_transport_status(
    registry: tauri::State<'_, SshTransportRegistry>,
    session_id: String,
) -> Result<SshTransportStatus, String> {
    let session = registry.get(&session_id)?;
    Ok(SshTransportStatus {
        session_id,
        state: session.state()?,
        reused: true,
        output: session.output()?,
    })
}

#[tauri::command]
pub fn ssh_transport_write(
    registry: tauri::State<'_, SshTransportRegistry>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    registry.get(&session_id)?.write(data.as_bytes())
}

#[tauri::command]
pub fn ssh_transport_exec(
    registry: tauri::State<'_, SshTransportRegistry>,
    session_id: String,
    command: TransportCommand,
) -> Result<TransportCommandResult, String> {
    validate_command(&command)?;
    let session = registry.get(&session_id)?;
    if session.state()? != "connected" {
        return Err("SSH authentication is not complete".to_string());
    }
    let _operation = session
        .operation
        .lock()
        .map_err(|_| "SSH operation lock poisoned".to_string())?;
    execute_remote(&session, command)
}

fn execute_remote(
    session: &Session,
    command: TransportCommand,
) -> Result<TransportCommandResult, String> {
    let request_id = format!("{:016x}", rand::random::<u64>());
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
    loop {
        let observed = capture.text.get(start..).unwrap_or(&capture.text);
        if let Some(begin_index) = observed.find(&begin) {
            let output_start = begin_index + begin.len();
            if let Some(relative_end) = observed[output_start..].find(&end) {
                let output_end = output_start + relative_end;
                let status_start = output_end + end.len();
                let status = observed[status_start..]
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .parse::<i32>()
                    .map_err(|_| "SSH command returned an invalid exit status".to_string())?;
                let output = observed[output_start..output_end]
                    .trim_matches(['\r', '\n'])
                    .to_string();
                if !command.allowed_exit_codes.contains(&status) {
                    return Err(if output.is_empty() {
                        format!("Remote command exited with status {status}")
                    } else {
                        output
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
        if now >= deadline {
            return Err(format!(
                "Remote command timed out after {:.0} seconds",
                command.timeout_seconds
            ));
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

#[tauri::command]
pub fn ssh_transport_forward(
    registry: tauri::State<'_, SshTransportRegistry>,
    session_id: String,
    remote_host: String,
    remote_port: u16,
    local_port: Option<u16>,
) -> Result<String, String> {
    if !safe_host(&remote_host) {
        return Err("Invalid remote forward host".to_string());
    }
    let session = registry.get(&session_id)?;
    let _operation = session
        .operation
        .lock()
        .map_err(|_| "SSH operation lock poisoned".to_string())?;
    let listener = local_port
        .filter(|port| *port != 0)
        .and_then(|port| TcpListener::bind(("127.0.0.1", port)).ok())
        .or_else(|| TcpListener::bind(("127.0.0.1", 0)).ok())
        .ok_or_else(|| "allocate forwarding port: no loopback port is available".to_string())?;
    let local_port = listener
        .local_addr()
        .map_err(|error| format!("read forwarding port: {error}"))?
        .port();
    drop(listener);
    session.write(format!("\n~C\n-L {local_port}:{remote_host}:{remote_port}\n").as_bytes())?;
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{local_port}")
                .parse()
                .map_err(|_| "invalid local forwarding address".to_string())?,
            Duration::from_millis(200),
        )
        .is_ok()
        {
            return Ok(format!("http://127.0.0.1:{local_port}"));
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("OpenSSH did not establish the requested port forward".to_string())
}

#[tauri::command]
pub fn ssh_transport_close(
    registry: tauri::State<'_, SshTransportRegistry>,
    session_id: String,
    target_id: String,
) -> Result<(), String> {
    if registry.detach_target(&target_id, &session_id)? {
        if let Some(session) = registry.remove(&session_id) {
            session.close();
        }
    }
    Ok(())
}

fn validate_route(route: &SshTransportRoute) -> Result<(), String> {
    if route.profile.trim().is_empty() && route.host.trim().is_empty() {
        return Err("SSH profile or host is required".to_string());
    }
    if route.jump_hosts.iter().any(|jump| jump.trim().is_empty()) {
        return Err("Jump-host entries cannot be empty".to_string());
    }
    Ok(())
}

fn compatible_route(left: &SshTransportRoute, right: &SshTransportRoute) -> bool {
    left.host.eq_ignore_ascii_case(&right.host)
        && left.user == right.user
        && left.port == right.port
        && left.jump_hosts == right.jump_hosts
        && left.identity_file == right.identity_file
        && left.platform == right.platform
}

fn ssh_arguments(route: &SshTransportRoute, interactive: bool) -> Vec<String> {
    let mut args = vec![
        "-tt".to_string(),
        "-o".to_string(),
        "EnableEscapeCommandline=yes".to_string(),
        "-o".to_string(),
        "ServerAliveInterval=30".to_string(),
        "-o".to_string(),
        "ServerAliveCountMax=3".to_string(),
    ];
    if !interactive {
        args.extend(["-o".to_string(), "BatchMode=yes".to_string()]);
    }
    if route.port != 22 {
        args.extend(["-p".to_string(), route.port.to_string()]);
    }
    if !route.identity_file.trim().is_empty() {
        args.extend(["-i".to_string(), route.identity_file.clone()]);
    }
    if !route.jump_hosts.is_empty() {
        args.extend(["-J".to_string(), route.jump_hosts.join(",")]);
    }
    let destination = if !route.profile.trim().is_empty() {
        route.profile.clone()
    } else if !route.user.trim().is_empty() {
        format!("{}@{}", route.user, route.host)
    } else {
        route.host.clone()
    };
    args.push(destination);
    args
}

fn validate_command(command: &TransportCommand) -> Result<(), String> {
    if command.program.trim().is_empty() || command.program.contains('\0') {
        return Err("Command program is invalid".to_string());
    }
    if command.args.len() > 256 || command.args.iter().any(|arg| arg.contains('\0')) {
        return Err("Command arguments are invalid".to_string());
    }
    if !(0.1..=1800.0).contains(&command.timeout_seconds) {
        return Err("Command timeout is outside the supported range".to_string());
    }
    if command.scope != "target" {
        return Err("Desktop accepts only target-scoped CLIO operations".to_string());
    }
    Ok(())
}

fn posix_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn posix_command(command: &TransportCommand, begin: &str, end: &str) -> String {
    let invocation = std::iter::once(command.program.as_str())
        .chain(command.args.iter().map(String::as_str))
        .map(posix_quote)
        .collect::<Vec<_>>()
        .join(" ");
    let stdin = if command.stdin.is_empty() {
        String::new()
    } else {
        format!("printf %s {} | ", posix_quote(&command.stdin))
    };
    format!(
        "printf '\\n{begin}\\n'; {stdin}{invocation}; __clio_status=$?; printf '\\n{end}%s\\n' \"$__clio_status\"\n"
    )
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn powershell_command(command: &TransportCommand, begin: &str, end: &str) -> String {
    let invocation = std::iter::once(command.program.as_str())
        .chain(command.args.iter().map(String::as_str))
        .map(powershell_quote)
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "Write-Output '{begin}'; & {invocation}; $s=$LASTEXITCODE; Write-Output ('{end}' + $s)\r\n"
    )
}

fn safe_host(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | ':' | '-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route() -> SshTransportRoute {
        SshTransportRoute {
            profile: String::new(),
            host: "login.example.edu".to_string(),
            user: "alice".to_string(),
            port: 2202,
            jump_hosts: vec!["jump-a".to_string(), "jump-b".to_string()],
            identity_file: "/keys/id ed25519".to_string(),
            platform: "linux".to_string(),
        }
    }

    #[test]
    fn ssh_arguments_preserve_jump_order_and_values() {
        assert_eq!(
            ssh_arguments(&route(), true),
            vec![
                "-tt",
                "-o",
                "EnableEscapeCommandline=yes",
                "-o",
                "ServerAliveInterval=30",
                "-o",
                "ServerAliveCountMax=3",
                "-p",
                "2202",
                "-i",
                "/keys/id ed25519",
                "-J",
                "jump-a,jump-b",
                "alice@login.example.edu",
            ]
        );
    }

    #[test]
    fn posix_wrapper_quotes_untrusted_arguments() {
        let command = TransportCommand {
            program: "docker".to_string(),
            args: vec!["inspect".to_string(), "a'; rm -rf /".to_string()],
            scope: "target".to_string(),
            timeout_seconds: 30.0,
            stdin: String::new(),
            allowed_exit_codes: vec![0, 1],
        };
        let rendered = posix_command(&command, "BEGIN", "END:");
        assert!(rendered.contains("'a'\\''; rm -rf /'"));
        assert!(rendered.contains("END:%s"));
    }

    #[test]
    fn compatible_routes_ignore_alias_but_not_jump_chain() {
        let mut first = route();
        first.profile = "utah".to_string();
        let mut second = first.clone();
        second.profile = "university".to_string();
        assert!(compatible_route(&first, &second));
        second.jump_hosts.reverse();
        assert!(!compatible_route(&first, &second));
    }

    #[test]
    fn silent_recovery_disables_interactive_prompts() {
        let arguments = ssh_arguments(&route(), false);
        assert!(arguments
            .windows(2)
            .any(|value| value == ["-o", "BatchMode=yes"]));
    }

    #[test]
    fn powershell_wrapper_quotes_untrusted_arguments() {
        let command = TransportCommand {
            program: "docker".to_string(),
            args: vec![
                "inspect".to_string(),
                "a'; Remove-Item C:\\data".to_string(),
            ],
            scope: "target".to_string(),
            timeout_seconds: 30.0,
            stdin: String::new(),
            allowed_exit_codes: vec![0],
        };
        let rendered = powershell_command(&command, "BEGIN", "END:");
        assert!(rendered.contains("'a''; Remove-Item C:\\data'"));
        assert!(rendered.contains("Write-Output ('END:' + $s)"));
    }

    #[test]
    fn desktop_rejects_controller_scoped_commands() {
        let command = TransportCommand {
            program: "clio-relay".to_string(),
            args: Vec::new(),
            scope: "controller".to_string(),
            timeout_seconds: 30.0,
            stdin: String::new(),
            allowed_exit_codes: vec![0],
        };
        assert_eq!(
            validate_command(&command),
            Err("Desktop accepts only target-scoped CLIO operations".to_string())
        );
    }
}

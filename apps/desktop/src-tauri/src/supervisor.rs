//! Sidecar lifecycle supervisor (Wave 0c).
//!
//! On app launch the supervisor:
//!   1. Allocates a free localhost port (ephemeral-bind + release).
//!   2. Generates a 32-byte bearer token (hex-encoded; 64 chars).
//!   3. Locates the bundled launcher binary
//!      (`binaries/clio-agent-<triple>{.exe}`).
//!   4. Spawns the launcher with `--host 127.0.0.1 --port N --token T`.
//!   5. Polls `http://127.0.0.1:N/v1/capabilities` with the `Authorization:
//!      Bearer T` header until 200 (≤ 10 s).
//!   6. Holds the child handle in an `Arc<Mutex<…>>` shared via Tauri's
//!      managed state so the `get_backend` command can read it and the
//!      shutdown hook can reap it.
//!
//! Failure modes are surfaced as `BackendStatus::Error(message)` so the
//! frontend Splash screen can render a recoverable error card with the
//! upstream install hint.

use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    env, io,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

/// Maximum time to wait for /v1/capabilities to return 200 before
/// declaring the sidecar broken.
const CAPABILITIES_TIMEOUT: Duration = Duration::from_secs(30);
/// Health-poll cadence while waiting for capabilities.
const POLL_INTERVAL: Duration = Duration::from_millis(200);
/// Grace period between SIGTERM (or graceful kill on Windows) and SIGKILL.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
/// Port the upstream `clio` installer binds by default. If a server is
/// answering here we attach to it instead of spawning a competing one
/// — the user's existing config (CLIO_LM_PROVIDER=alcf etc.) is then
/// honored automatically.
const ATTACH_DEFAULT_PORT: u16 = 17800;
/// Env var that overrides the attach-port — matches the upstream
/// `clio.{ps1,sh}` launcher convention.
const ATTACH_PORT_ENV: &str = "CLIO_PORT";
/// Fast probe used during the attach-first check.
const ATTACH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// Snapshot of the sidecar handle returned to the frontend.
///
/// This is the shape consumed by `<SplashScreen />` and (after transition)
/// by `<ChatScreen />` so they can mount a `Client` from `@clio/core`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendHandle {
    pub url: String,
    pub bearer_token: String,
    pub status: BackendStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase", tag = "kind", content = "detail")]
pub enum BackendStatus {
    Starting,
    Ready,
    Error(String),
}

/// Internal state owned by the Tauri runtime.
pub struct Supervisor {
    inner: Arc<Mutex<SupervisorInner>>,
}

struct SupervisorInner {
    handle: BackendHandle,
    child: Option<Child>,
}

impl Supervisor {
    /// Creates a supervisor placeholder in the `Starting` state. The actual
    /// spawn happens in `start()` so callers can register the supervisor in
    /// managed state first and then kick off the spawn asynchronously.
    pub fn new() -> Self {
        let handle = BackendHandle {
            url: String::new(),
            bearer_token: String::new(),
            status: BackendStatus::Starting,
        };
        Self {
            inner: Arc::new(Mutex::new(SupervisorInner {
                handle,
                child: None,
            })),
        }
    }

    /// Reads the current backend handle (cheap clone of a small struct).
    pub fn snapshot(&self) -> BackendHandle {
        self.inner.lock().expect("supervisor poisoned").handle.clone()
    }

    /// Records a startup error without spawning anything. Used when the
    /// launcher binary can't be located at all.
    pub fn set_error(&self, msg: String) {
        if let Ok(mut g) = self.inner.lock() {
            g.handle.status = BackendStatus::Error(msg);
        }
    }

    /// Kicks off the sidecar in a worker thread and updates state
    /// in-place as it transitions Starting → Ready/Error.
    ///
    /// Attach-first behaviour: if a healthy `clio-agent-gact` is already
    /// answering on the conventional `:17800` port (the `clio start`
    /// default), we attach to it rather than spawn a second one. That
    /// keeps the user's existing LM configuration (ALCF / OpenAI / etc.)
    /// in play without us needing to mirror their env.
    pub fn start(&self, launcher: PathBuf) {
        let state = self.inner.clone();
        thread::spawn(move || {
            // 1. Attach to an existing local server if reachable.
            if let Some(handle) = try_attach_existing() {
                let mut guard = state.lock().expect("supervisor poisoned");
                guard.handle = handle;
                return;
            }
            // 2. Otherwise spawn our own.
            let outcome = spawn_and_probe(&launcher);
            let mut guard = state.lock().expect("supervisor poisoned");
            match outcome {
                Ok((handle, child)) => {
                    guard.handle = handle;
                    guard.child = Some(child);
                }
                Err(e) => {
                    guard.handle.status = BackendStatus::Error(e);
                }
            }
        });
    }

    /// Best-effort reap of the child process on app shutdown.
    ///
    /// W4 hardening finding: the child we spawn is the Go *launcher*, which
    /// in turn spawns the real `clio-agent-gact` (Python/uvicorn) as ITS
    /// child. On Windows, `Child::kill` is TerminateProcess on the launcher
    /// only — the grandchild kept running, leaking a clio process every
    /// time the app closed. The fix kills the whole process TREE.
    pub fn shutdown(&self) {
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        if let Some(mut child) = guard.child.take() {
            // Windows: kill the tree (launcher + clio-agent-gact + uvicorn
            // workers). taskkill /T walks the child-process tree; /F because
            // there is no SIGTERM equivalent to deliver first.
            #[cfg(windows)]
            {
                let _ = Command::new("taskkill")
                    .args(["/T", "/F", "/PID", &child.id().to_string()])
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            // Unix: the launcher execs/waits on clio in the same process
            // group; killing the launcher delivers SIGKILL to it and uvicorn
            // shuts down when its parent dies. (Tree-kill via process groups
            // is a follow-up if a Linux/macOS leak is ever observed.)
            let _ = child.kill();
            let deadline = Instant::now() + SHUTDOWN_GRACE;
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) if Instant::now() >= deadline => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }
        }
    }
}

impl Default for Supervisor {
    fn default() -> Self {
        Self::new()
    }
}

/// One-shot probe of the conventional clio port. Returns a Ready
/// handle (with an empty bearer token — the server's trust_socket auth
/// scheme accepts localhost requests on its own) when an answer comes
/// back with a contract_version. Any other outcome returns None and the
/// caller falls back to spawning a fresh sidecar.
///
/// Honors `$CLIO_PORT` if set (matches the upstream `clio` launcher
/// convention) before falling back to the documented :17800 default.
fn try_attach_existing() -> Option<BackendHandle> {
    let port = env::var(ATTACH_PORT_ENV)
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(ATTACH_DEFAULT_PORT);
    let url = format!("http://127.0.0.1:{port}");
    let endpoint = format!("{url}/v1/capabilities");
    let resp = ureq::get(&endpoint)
        .timeout(ATTACH_PROBE_TIMEOUT)
        .call()
        .ok()?;
    if resp.status() != 200 {
        return None;
    }
    let body = resp.into_string().ok()?;
    // Cheap shape check — parse the contract_version field. We don't
    // need the full envelope here; the SplashScreen will refetch and
    // gate on it client-side.
    let parsed: serde_json::Value = serde_json::from_str(&body).ok()?;
    parsed.get("contract_version").and_then(|v| v.as_str())?;
    Some(BackendHandle {
        url,
        bearer_token: String::new(),
        status: BackendStatus::Ready,
    })
}

fn spawn_and_probe(launcher: &Path) -> Result<(BackendHandle, Child), String> {
    let port = pick_free_port().map_err(|e| format!("port allocation failed: {e}"))?;
    let token = generate_token();
    let url = format!("http://127.0.0.1:{port}");

    let child = Command::new(launcher)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("spawn launcher {launcher:?}: {e}"))?;

    probe_capabilities(&url, &token)?;

    Ok((
        BackendHandle {
            url,
            bearer_token: token,
            status: BackendStatus::Ready,
        },
        child,
    ))
}

/// Binds 127.0.0.1:0 to discover a free ephemeral port, then drops the
/// listener so the child can rebind it.
///
/// There is a small race window where another process can claim the port
/// between drop and child-bind; the launcher / clio-agent-gact surfaces a
/// bind error on its own stderr in that case and we'd retry on next launch.
fn pick_free_port() -> io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn generate_token() -> String {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

fn probe_capabilities(url: &str, token: &str) -> Result<(), String> {
    let endpoint = format!("{url}/v1/capabilities");
    let auth = format!("Bearer {token}");
    let start = Instant::now();
    let mut last_err = String::from("no probe attempted");
    while start.elapsed() < CAPABILITIES_TIMEOUT {
        match ureq::get(&endpoint)
            .set("Authorization", &auth)
            .timeout(Duration::from_millis(800))
            .call()
        {
            Ok(resp) if resp.status() == 200 => return Ok(()),
            Ok(resp) => last_err = format!("/v1/capabilities returned {}", resp.status()),
            Err(e) => last_err = format!("/v1/capabilities probe: {e}"),
        }
        thread::sleep(POLL_INTERVAL);
    }
    Err(format!(
        "sidecar did not report ready within {}s: {}",
        CAPABILITIES_TIMEOUT.as_secs(),
        last_err
    ))
}

/// Looks up the bundled launcher binary, honoring Tauri's externalBin
/// placement convention.
///
/// Production install: alongside the main executable, named
///   `clio-agent-<host-triple>{.exe}` (e.g. `clio-agent-x86_64-pc-windows-msvc.exe`).
/// `tauri:dev`: Tauri copies the externalBin into `target/debug/` so the
///   `current_exe + sibling` lookup works there too.
/// Fallback for tests / cargo-run: `apps/desktop/src-tauri/binaries/`
///   relative to `CARGO_MANIFEST_DIR`.
pub fn locate_launcher() -> Result<PathBuf, String> {
    let triple = host_target_triple();
    let basename = if cfg!(windows) {
        format!("clio-agent-{triple}.exe")
    } else {
        format!("clio-agent-{triple}")
    };

    // 1) Tauri-installed: next to current_exe.
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let cand = dir.join(&basename);
            if cand.is_file() {
                return Ok(cand);
            }
        }
    }
    // 2) Dev: binaries/ next to CARGO_MANIFEST_DIR.
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        let cand = Path::new(manifest).join("binaries").join(&basename);
        if cand.is_file() {
            return Ok(cand);
        }
    }
    // 3) Workspace-relative fallback (for cargo test from any cwd).
    let cwd = env::current_dir().map_err(|e| format!("cwd: {e}"))?;
    let cand = cwd.join("binaries").join(&basename);
    if cand.is_file() {
        return Ok(cand);
    }

    Err(format!(
        "launcher binary not found: looked for `{basename}` next to current_exe \
         and under binaries/ — run `pnpm fetch-sidecar` (or the equivalent \
         scripts/fetch-sidecar.ps1)"
    ))
}

/// Best-effort host target triple in the form Tauri's externalBin uses.
/// Mirrors the keys in `apps/desktop/scripts/fetch-sidecar.sh`.
fn host_target_triple() -> &'static str {
    if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "x86_64-apple-darwin"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "x86_64-unknown-linux-gnu"
    } else {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_has_expected_shape() {
        let t = generate_token();
        assert_eq!(t.len(), 64, "expected 32-byte hex token");
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn two_tokens_differ() {
        let a = generate_token();
        let b = generate_token();
        assert_ne!(a, b, "tokens must not collide");
    }

    #[test]
    fn pick_free_port_returns_nonzero() {
        let p = pick_free_port().expect("port pick");
        assert!(p >= 1024, "ephemeral ports are above 1024");
    }

    #[test]
    fn locate_launcher_finds_dev_binary() {
        // The host build pipeline runs `pnpm fetch-sidecar` before any
        // Rust build; that puts the host-triple launcher under binaries/.
        let p = locate_launcher().expect("launcher binary present after fetch-sidecar");
        let s = p.to_string_lossy();
        assert!(
            s.contains("clio-agent-"),
            "launcher path should include the basename, got {s}"
        );
        assert!(p.is_file());
    }

    #[test]
    fn host_target_triple_is_supported() {
        assert_ne!(
            host_target_triple(),
            "unknown",
            "host platform unsupported by sidecar bundling"
        );
    }

    #[test]
    fn backend_handle_serializes_round_trip() {
        let h = BackendHandle {
            url: "http://127.0.0.1:12345".into(),
            bearer_token: "deadbeef".into(),
            status: BackendStatus::Ready,
        };
        let j = serde_json::to_string(&h).expect("serialize");
        let back: BackendHandle = serde_json::from_str(&j).expect("deserialize");
        assert_eq!(back.url, h.url);
        assert!(matches!(back.status, BackendStatus::Ready));
    }

    /// W4 hardening: the SPAWN path + shutdown reaping, end-to-end.
    ///
    /// Spawns the real Go launcher (which resolves a real clio-agent-gact —
    /// on the dev box via the repo-local develop install), waits until the
    /// sidecar answers /v1/capabilities with the generated bearer token,
    /// then reaps it through Supervisor::shutdown and asserts the port
    /// actually stops answering (no orphaned sidecar).
    ///
    /// Soft-skips when the launcher binary or a resolvable clio-agent-gact
    /// is absent (e.g. CI without `pnpm fetch-sidecar` / no clio install) —
    /// those environments can't exercise the spawn path at all.
    #[test]
    fn spawn_path_launches_probes_and_reaps() {
        let launcher = match locate_launcher() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("skip: {e}");
                return;
            }
        };
        let (handle, child) = match spawn_and_probe(&launcher) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("skip: spawn failed (no resolvable clio-agent-gact?): {e}");
                return;
            }
        };

        // The sidecar is up: spawn_and_probe proved /v1/capabilities answers
        // 200. (Note: clio's auth model is trust_socket — localhost requests
        // are accepted with or without the bearer token, so there is no
        // negative-auth assertion to make here; the token only matters for
        // non-localhost transports.)

        // Reap through the same path the app shutdown uses.
        let sup = Supervisor::new();
        {
            let mut g = sup.inner.lock().expect("fresh supervisor");
            g.handle = handle.clone();
            g.child = Some(child);
        }
        sup.shutdown();

        // After reaping, the port stops answering entirely (transport error,
        // not an HTTP status) — i.e. no orphaned process holds the socket.
        let after = ureq::get(&format!("{}/v1/capabilities", handle.url))
            .timeout(Duration::from_secs(2))
            .call();
        assert!(
            matches!(after, Err(ureq::Error::Transport(_))),
            "sidecar port still answering after shutdown reap: {after:?}"
        );
    }
}

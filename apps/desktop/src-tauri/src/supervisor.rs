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
//!
//! First-run "one swoop": when the launcher exits code 2 ("clio-agent-gact
//! not found") the supervisor reports `BackendStatus::NeedsInstall` instead
//! of a generic error. The frontend reacts by invoking the `install_clio`
//! Tauri command, which runs the same upstream install script the user
//! would run manually, streaming progress back as Tauri events.

use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{self, BufRead, BufReader, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

/// Launcher exit code meaning "clio-agent-gact could not be resolved".
/// Must stay in lockstep with `exitNotFound` in
/// `apps/desktop/sidecar-launcher/main.go`.
const LAUNCHER_EXIT_NOT_FOUND: i32 = 2;
/// Git ref of clio-agent the upstream installer should check out. Matches
/// the `CLIO_REF=develop` the manual install hint uses.
const CLIO_INSTALL_REF: &str = "develop";
/// Tauri event names for the streamed install. The frontend subscribes to
/// these on the `needs_install` → auto-install transition.
const EVT_INSTALL_PROGRESS: &str = "clio:install-progress";
const EVT_INSTALL_DONE: &str = "clio:install-done";
const EVT_INSTALL_FAILED: &str = "clio:install-failed";
/// How many trailing log lines to ship in the `clio:install-failed` payload
/// so the error card can show the tail without the whole transcript.
const INSTALL_FAILURE_TAIL_LINES: usize = 30;

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

/// Filename of the persisted boot log under the app log dir. The
/// boot-failure card's "Open logs" button reveals THIS file. It is
/// truncated at the start of every boot/install/repair so it always
/// reflects the most recent attempt (not an ever-growing transcript).
const BOOT_LOG_FILENAME: &str = "clio-boot.log";

/// Process-wide path of the persisted boot log. Set once at startup by
/// [`init_boot_log`] (which has the `AppHandle` needed to resolve the OS
/// log dir) and read by the streaming/spawn paths — which run on worker
/// threads with no `AppHandle` in scope. `None` until init runs (e.g. in
/// unit tests that never call `init_boot_log`), in which case logging is a
/// silent no-op rather than a panic.
static BOOT_LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Resolve + remember the persisted boot-log path from the Tauri app log
/// dir, creating the directory if needed. Called once during `setup` so the
/// supervisor's worker threads (which hold no `AppHandle`) can append to it
/// via [`boot_log_line`] / [`open_boot_log`]. Returns the resolved path so
/// the caller can log it. Best-effort: a failure to create the dir leaves
/// the path unset (logging no-ops) rather than blocking boot.
pub fn init_boot_log<R: tauri::Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    use tauri::Manager;
    let dir = app.path().app_log_dir().ok()?;
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }
    let path = dir.join(BOOT_LOG_FILENAME);
    if let Ok(mut g) = BOOT_LOG_PATH.lock() {
        *g = Some(path.clone());
    }
    Some(path)
}

/// The persisted boot-log path, if [`init_boot_log`] has run.
pub fn boot_log_path() -> Option<PathBuf> {
    BOOT_LOG_PATH.lock().ok().and_then(|g| g.clone())
}

/// Truncate the boot log so the next attempt starts a fresh transcript.
/// Writes a single header line with the supplied phase label. No-op when
/// the path is unset (tests) or the file can't be opened.
fn reset_boot_log(phase: &str) {
    let Some(path) = boot_log_path() else { return };
    if let Ok(mut f) = File::create(&path) {
        let _ = writeln!(f, "=== clio {phase} log ===");
    }
}

/// Append one line to the persisted boot log (best-effort; never panics,
/// never blocks boot on an I/O error). Used by the spawn path and the
/// install/repair streamers so a failed boot leaves a re-openable log.
fn boot_log_line(line: &str) {
    let Some(path) = boot_log_path() else { return };
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{line}");
    }
}

/// Reveal the persisted boot log in the OS file manager (selecting the
/// file where supported) so the user can open it with their default
/// viewer. Falls back to opening the containing directory. Returns the
/// path that was revealed, or an error string the frontend surfaces.
///
/// Uses native OS commands directly (explorer / open / xdg-open) rather
/// than a Tauri opener plugin so no extra capability surface is exposed —
/// matching the existing `taskkill` / `ssh` direct-spawn pattern.
pub fn open_boot_log() -> Result<PathBuf, String> {
    let path = boot_log_path()
        .ok_or_else(|| "boot log path is not initialized".to_string())?;
    if !path.is_file() {
        return Err(format!("boot log not found at {}", path.display()));
    }
    reveal_in_os(&path).map(|()| path)
}

/// Best-effort "reveal this file in the OS file manager" across the three
/// desktop platforms. On Windows `explorer /select,` highlights the file;
/// on macOS `open -R` does the same; on Linux there is no portable select,
/// so we open the containing directory with `xdg-open`.
fn reveal_in_os(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        // explorer.exe returns exit code 1 even on success, so we don't
        // gate on the status — spawn failure is the only real error.
        Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("explorer: {e}"))
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("open -R: {e}"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = path.parent().unwrap_or(path);
        Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("xdg-open: {e}"))
    }
    #[cfg(not(any(windows, target_os = "macos", all(unix, not(target_os = "macos")))))]
    {
        let _ = path;
        Err("reveal-in-OS is unsupported on this platform".to_string())
    }
}

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
#[serde(rename_all = "snake_case", tag = "kind", content = "detail")]
pub enum BackendStatus {
    Starting,
    Ready,
    /// The bundled launcher resolved no `clio-agent-gact` (it exited with
    /// [`LAUNCHER_EXIT_NOT_FOUND`]). The frontend reacts by auto-running
    /// `install_clio` — a one-swoop first-run install — rather than showing
    /// the manual copy-paste error card. Serializes as `{"kind":"needs_install"}`.
    NeedsInstall,
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
            // Fresh transcript for this boot attempt so a later failure's
            // "Open logs" shows only the relevant run.
            reset_boot_log("boot");
            // 1. Attach to an existing local server if reachable.
            if let Some(handle) = try_attach_existing() {
                boot_log_line("attached to an existing clio-agent on the conventional port");
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
                // The launcher exited 2 ("clio-agent-gact not found"): this is
                // a fresh install, not a broken one. Surface NeedsInstall so the
                // frontend auto-runs install_clio (one swoop) instead of the
                // manual error card.
                Err(SpawnError::NeedsInstall) => {
                    boot_log_line("launcher reported clio-agent-gact is not installed (exit 2)");
                    guard.handle.status = BackendStatus::NeedsInstall;
                }
                Err(SpawnError::Other(e)) => {
                    boot_log_line(&format!("boot failed: {e}"));
                    guard.handle.status = BackendStatus::Error(e);
                }
            }
        });
    }

    /// Reset the handle to `Starting` and re-run the spawn pipeline. Used by
    /// the one-swoop install flow: after the installer exits 0, the
    /// supervisor restarts so the now-resolvable `clio-agent-gact` is picked
    /// up and the frontend's `get_backend` re-poll sees Starting → Ready.
    ///
    /// Re-locates the launcher (it never moves, but this keeps the missing-
    /// launcher failure mode identical to first boot) and reaps any prior
    /// child first.
    pub fn restart(&self) {
        // Reap a stale child (e.g. a half-started launcher) before re-spawning.
        self.shutdown();
        let launcher = match locate_launcher() {
            Ok(p) => p,
            Err(e) => {
                self.set_error(format!(
                    "sidecar launcher missing after install: {e}. Run `pnpm fetch-sidecar` and rebuild."
                ));
                return;
            }
        };
        if let Ok(mut g) = self.inner.lock() {
            g.handle.status = BackendStatus::Starting;
        }
        self.start(launcher);
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

/// Reasons `spawn_and_probe` can fail. `NeedsInstall` is carved out from the
/// generic error so the supervisor can route the launcher's exit-2
/// ("clio-agent-gact not found") to the first-run auto-install flow instead
/// of the manual error card.
#[derive(Debug)]
enum SpawnError {
    /// The launcher exited with [`LAUNCHER_EXIT_NOT_FOUND`]: no clio install.
    NeedsInstall,
    /// Any other failure (port allocation, spawn failure, probe timeout while
    /// the launcher is still running, …).
    Other(String),
}

impl From<String> for SpawnError {
    fn from(s: String) -> Self {
        SpawnError::Other(s)
    }
}

fn spawn_and_probe(launcher: &Path) -> Result<(BackendHandle, Child), SpawnError> {
    let port = pick_free_port().map_err(|e| format!("port allocation failed: {e}"))?;
    let token = generate_token();
    let url = format!("http://127.0.0.1:{port}");

    boot_log_line(&format!("spawning launcher {launcher:?} on 127.0.0.1:{port}"));
    let mut child = Command::new(launcher)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .stdin(Stdio::null())
        // Capture the launcher's (and its clio child's) output so a boot
        // failure leaves a re-openable transcript. Reader threads below
        // tee each line into the persisted boot log.
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn launcher {launcher:?}: {e}"))?;

    // Tee child stdout/stderr to the boot log on background threads so a
    // full pipe buffer can't deadlock the probe below.
    if let Some(out) = child.stdout.take() {
        thread::spawn(move || tee_to_boot_log(BufReader::new(out)));
    }
    if let Some(err) = child.stderr.take() {
        thread::spawn(move || tee_to_boot_log(BufReader::new(err)));
    }

    match probe_capabilities(&url, &token) {
        Ok(()) => {
            boot_log_line("clio-agent answered /v1/capabilities — backend ready");
            Ok((
                BackendHandle {
                    url,
                    bearer_token: token,
                    status: BackendStatus::Ready,
                },
                child,
            ))
        }
        Err(probe_err) => {
            // The probe failed. Distinguish "the launcher already exited 2
            // because clio isn't installed" (→ NeedsInstall, one-swoop) from
            // any other failure (→ Error). The launcher mirrors clio's exit
            // code, so a still-running child means clio is up but unhealthy.
            match child.try_wait() {
                Ok(Some(status)) if status.code() == Some(LAUNCHER_EXIT_NOT_FOUND) => {
                    Err(SpawnError::NeedsInstall)
                }
                _ => {
                    // Best-effort reap so a half-started launcher isn't leaked.
                    let _ = child.kill();
                    let _ = child.wait();
                    Err(SpawnError::Other(probe_err))
                }
            }
        }
    }
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

/// The shell program + argument vector that runs the UPSTREAM clio-agent
/// installer for the current OS. This is the SAME script the manual error
/// card tells the user to copy-paste; the one-swoop flow just runs it for
/// them and streams the output.
///
/// Extracted as a pure function (no spawn, no I/O) so the exact command line
/// is unit-testable per-OS. `install_clio` is the thin spawn wrapper.
///
/// `force` drives the Repair / reinstall flow: it sets `CLIO_FORCE=1` so the
/// upstream installer rebuilds a broken venv/runtime from scratch instead of
/// short-circuiting when it sees an existing (but broken) install. A normal
/// first-run install passes `force = false`.
///
/// - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -Command
///   "$env:CLIO_REF='develop'; [$env:CLIO_FORCE='1';] irm <install.ps1 url> | iex"`
/// - macOS/Linux: `bash -c "CLIO_REF=develop [CLIO_FORCE=1] curl -fsSL <install.sh url> | bash"`
pub fn install_command(force: bool) -> (String, Vec<String>) {
    if cfg!(windows) {
        let force_prefix = if force { "$env:CLIO_FORCE='1'; " } else { "" };
        let script = format!(
            "$env:CLIO_REF='{CLIO_INSTALL_REF}'; {force_prefix}\
             irm https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex"
        );
        (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-Command".to_string(),
                script,
            ],
        )
    } else {
        let force_prefix = if force { "CLIO_FORCE=1 " } else { "" };
        let script = format!(
            "CLIO_REF={CLIO_INSTALL_REF} {force_prefix}\
             curl -fsSL https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh | bash"
        );
        ("bash".to_string(), vec!["-c".to_string(), script])
    }
}

/// Run the upstream clio-agent installer, streaming every stdout/stderr line
/// to the frontend as `clio:install-progress` events. On success runs
/// `on_success` (the lib.rs command passes a closure that re-kicks the
/// supervisor's spawn so the freshly-installed clio resolves) and THEN emits
/// `clio:install-done`; on a non-zero exit emits `clio:install-failed` with
/// `{code, tail}` (the last ~30 log lines). Blocking — the Tauri command
/// wrapper runs it on a worker thread.
///
/// `on_success` runs before the done event so that by the time the frontend
/// re-polls `get_backend`, the supervisor is already back in `Starting` and
/// will flip to `Ready` (not loop back to `NeedsInstall`).
pub fn install_clio<R, F>(app: AppHandle<R>, force: bool, on_success: F)
where
    R: tauri::Runtime,
    F: FnOnce(),
{
    // Fresh transcript for this install/repair attempt.
    reset_boot_log(if force { "repair" } else { "install" });
    let (program, args) = install_command(force);

    let spawn = Command::new(&program)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match spawn {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                EVT_INSTALL_FAILED,
                InstallFailed {
                    code: None,
                    tail: format!("failed to launch installer ({program}): {e}"),
                },
            );
            return;
        }
    };

    // Ring buffer of recent lines so we can ship a tail on failure. Reading
    // stdout and stderr on separate threads avoids a pipe-deadlock when one
    // stream fills its buffer while we block on the other.
    let recent = Arc::new(Mutex::new(Vec::<String>::new()));

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_thread = stdout.map(|out| {
        let app = app.clone();
        let recent = recent.clone();
        thread::spawn(move || stream_lines(BufReader::new(out), &app, &recent))
    });
    let stderr_thread = stderr.map(|err| {
        let app = app.clone();
        let recent = recent.clone();
        thread::spawn(move || stream_lines(BufReader::new(err), &app, &recent))
    });

    if let Some(t) = stdout_thread {
        let _ = t.join();
    }
    if let Some(t) = stderr_thread {
        let _ = t.join();
    }

    match child.wait() {
        Ok(status) if status.success() => {
            // Re-kick the supervisor BEFORE announcing done so the frontend's
            // re-poll of get_backend sees Starting→Ready, not NeedsInstall.
            on_success();
            let _ = app.emit(EVT_INSTALL_DONE, ());
        }
        Ok(status) => {
            let _ = app.emit(
                EVT_INSTALL_FAILED,
                InstallFailed {
                    code: status.code(),
                    tail: tail_of(&recent),
                },
            );
        }
        Err(e) => {
            let _ = app.emit(
                EVT_INSTALL_FAILED,
                InstallFailed {
                    code: None,
                    tail: format!("installer wait failed: {e}\n{}", tail_of(&recent)),
                },
            );
        }
    }
}

/// Read a child stream line-by-line and append each to the persisted boot
/// log. Used for the launcher's stdout/stderr during the spawn path (no
/// frontend events — that stream is the install flow's job).
fn tee_to_boot_log<B: BufRead>(reader: B) {
    for line in reader.lines() {
        let Ok(line) = line else { break };
        boot_log_line(&line);
    }
}

/// Read a child stream line-by-line, emitting each as a progress event and
/// recording it in the shared ring buffer for the failure tail.
fn stream_lines<R: tauri::Runtime, B: BufRead>(
    reader: B,
    app: &AppHandle<R>,
    recent: &Arc<Mutex<Vec<String>>>,
) {
    for line in reader.lines() {
        let Ok(line) = line else { break };
        // Persist to the on-disk boot log so "Open logs" works after an
        // install/repair failure, not just the streamed-to-UI tail.
        boot_log_line(&line);
        if let Ok(mut buf) = recent.lock() {
            buf.push(line.clone());
            // Keep only what a failure tail could need.
            if buf.len() > INSTALL_FAILURE_TAIL_LINES * 2 {
                let drop = buf.len() - INSTALL_FAILURE_TAIL_LINES;
                buf.drain(0..drop);
            }
        }
        let _ = app.emit(EVT_INSTALL_PROGRESS, InstallProgress { line });
    }
}

/// Join the last [`INSTALL_FAILURE_TAIL_LINES`] recorded lines into one
/// string for the `clio:install-failed` payload.
fn tail_of(recent: &Arc<Mutex<Vec<String>>>) -> String {
    let buf = match recent.lock() {
        Ok(b) => b,
        Err(p) => p.into_inner(),
    };
    let start = buf.len().saturating_sub(INSTALL_FAILURE_TAIL_LINES);
    buf[start..].join("\n")
}

#[derive(Clone, Serialize)]
struct InstallProgress {
    line: String,
}

#[derive(Clone, Serialize)]
struct InstallFailed {
    /// Process exit code, or `None` when the installer couldn't be launched
    /// / waited on at all.
    code: Option<i32>,
    /// The last ~30 lines of combined stdout/stderr.
    tail: String,
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

    /// The frontend discriminates on `status.kind`. These exact tag strings
    /// are the wire contract `tauri.ts`'s `BackendStatus` union switches on —
    /// they must not drift.
    #[test]
    fn backend_status_kind_tags_are_stable() {
        let cases = [
            (BackendStatus::Starting, r#"{"kind":"starting"}"#),
            (BackendStatus::Ready, r#"{"kind":"ready"}"#),
            (BackendStatus::NeedsInstall, r#"{"kind":"needs_install"}"#),
        ];
        for (status, want) in cases {
            let got = serde_json::to_string(&status).expect("serialize status");
            assert_eq!(got, want, "status tag drifted from frontend contract");
        }
        // Error carries its detail string under "detail".
        let err = serde_json::to_string(&BackendStatus::Error("boom".into())).expect("serialize");
        assert_eq!(err, r#"{"kind":"error","detail":"boom"}"#);
    }

    /// needs_install must round-trip so a snapshot serialized over the IPC
    /// boundary deserializes back to the same variant.
    #[test]
    fn needs_install_round_trips() {
        let h = BackendHandle {
            url: String::new(),
            bearer_token: String::new(),
            status: BackendStatus::NeedsInstall,
        };
        let j = serde_json::to_string(&h).expect("serialize");
        assert!(j.contains(r#""kind":"needs_install""#), "got {j}");
        let back: BackendHandle = serde_json::from_str(&j).expect("deserialize");
        assert!(matches!(back.status, BackendStatus::NeedsInstall));
    }

    /// The not-found exit code we route to NeedsInstall must equal the Go
    /// launcher's `exitNotFound` constant. (Asserted directly in the Rust
    /// build; a drift here means the launcher's contract changed.)
    #[test]
    fn not_found_exit_code_matches_launcher_contract() {
        assert_eq!(LAUNCHER_EXIT_NOT_FOUND, 2);
    }

    /// The install command is the upstream installer for the host OS. We
    /// assert the parts that matter: the right shell, the develop ref, and
    /// the upstream URL — the SAME one-liner the manual error card shows.
    #[test]
    fn install_command_targets_upstream_installer() {
        let (program, args) = install_command(false);
        let joined = args.join(" ");

        assert!(
            joined.contains("CLIO_REF"),
            "installer must pin the clio ref env var, got: {joined}"
        );
        assert!(
            joined.contains(CLIO_INSTALL_REF),
            "installer must check out the `{CLIO_INSTALL_REF}` ref, got: {joined}"
        );
        assert!(
            joined.contains("raw.githubusercontent.com/iowarp/clio-agent"),
            "installer must fetch from the upstream repo, got: {joined}"
        );

        if cfg!(windows) {
            assert_eq!(program, "powershell");
            assert!(args.contains(&"-NoProfile".to_string()));
            assert!(args.contains(&"-Command".to_string()));
            assert!(
                joined.contains("install.ps1") && joined.contains("iex"),
                "windows installer must pipe install.ps1 to iex, got: {joined}"
            );
        } else {
            assert_eq!(program, "bash");
            assert_eq!(args[0], "-c");
            assert!(
                joined.contains("install.sh") && joined.contains("curl") && joined.contains("bash"),
                "unix installer must curl install.sh into bash, got: {joined}"
            );
        }
    }

    /// A normal first-run install (force = false) must NOT set CLIO_FORCE,
    /// while a Repair (force = true) MUST — that env var is what makes the
    /// upstream installer rebuild a broken venv instead of short-circuiting.
    #[test]
    fn install_command_force_flag_toggles_clio_force() {
        let (_p, normal) = install_command(false);
        let normal = normal.join(" ");
        assert!(
            !normal.contains("CLIO_FORCE"),
            "first-run install must not force a reinstall, got: {normal}"
        );

        let (_p, repair) = install_command(true);
        let repair = repair.join(" ");
        assert!(
            repair.contains("CLIO_FORCE"),
            "repair must set CLIO_FORCE to rebuild a broken runtime, got: {repair}"
        );
        // Repair still targets the SAME upstream installer + ref as a normal
        // install — it only adds the force env, nothing else changes.
        assert!(
            repair.contains(CLIO_INSTALL_REF)
                && repair.contains("raw.githubusercontent.com/iowarp/clio-agent"),
            "repair must reuse the upstream installer, got: {repair}"
        );
        if cfg!(windows) {
            assert!(
                repair.contains("$env:CLIO_FORCE='1'"),
                "windows repair must set the force env via $env:, got: {repair}"
            );
        } else {
            assert!(
                repair.contains("CLIO_FORCE=1"),
                "unix repair must set CLIO_FORCE=1, got: {repair}"
            );
        }
    }

    /// The boot-log helpers are a silent no-op until `init_boot_log` wires a
    /// path (e.g. in unit tests that never construct an AppHandle). They must
    /// never panic in that state — boot must not depend on logging.
    #[test]
    fn boot_log_helpers_no_op_without_init() {
        // BOOT_LOG_PATH starts unset in a fresh test process; these must not
        // panic regardless of ordering with other tests.
        reset_boot_log("test");
        boot_log_line("a line with no sink should be dropped silently");
        // open_boot_log surfaces a friendly error string, never a panic.
        if boot_log_path().is_none() {
            let err = open_boot_log().expect_err("no path → Err, not Ok/panic");
            assert!(
                err.contains("not initialized"),
                "expected an uninitialized-path error, got: {err}"
            );
        }
    }

    /// When a path IS set, reset truncates with a header and append adds
    /// lines — the on-disk shape the "Open logs" button reveals. Uses a temp
    /// path and restores the global afterward so it doesn't leak into other
    /// tests in the same process.
    #[test]
    fn boot_log_writes_header_then_lines() {
        let dir = env::temp_dir().join(format!("clio-boot-log-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("clio-boot.log");

        let saved = BOOT_LOG_PATH.lock().unwrap().clone();
        *BOOT_LOG_PATH.lock().unwrap() = Some(path.clone());

        reset_boot_log("boot");
        boot_log_line("line one");
        boot_log_line("line two");

        let body = fs::read_to_string(&path).expect("boot log written");
        assert!(body.starts_with("=== clio boot log ==="), "got: {body}");
        assert!(body.contains("line one") && body.contains("line two"), "got: {body}");

        // reset again truncates the prior content.
        reset_boot_log("repair");
        let body2 = fs::read_to_string(&path).expect("boot log re-written");
        assert!(body2.starts_with("=== clio repair log ==="), "got: {body2}");
        assert!(!body2.contains("line one"), "reset must truncate, got: {body2}");

        // restore + cleanup.
        *BOOT_LOG_PATH.lock().unwrap() = saved;
        let _ = fs::remove_dir_all(&dir);
    }

    /// The progress + failure payloads serialize to the exact JSON shape the
    /// frontend event handlers destructure (`{line}` and `{code, tail}`).
    #[test]
    fn install_event_payloads_match_frontend_shape() {
        let prog = serde_json::to_string(&InstallProgress {
            line: "Installing clio-agent…".into(),
        })
        .expect("serialize progress");
        assert_eq!(prog, r#"{"line":"Installing clio-agent…"}"#);

        let failed = serde_json::to_string(&InstallFailed {
            code: Some(7),
            tail: "line a\nline b".into(),
        })
        .expect("serialize failed");
        assert_eq!(failed, r#"{"code":7,"tail":"line a\nline b"}"#);

        // A launch failure (no exit code) serializes code as null.
        let failed_null = serde_json::to_string(&InstallFailed {
            code: None,
            tail: "boom".into(),
        })
        .expect("serialize failed null");
        assert_eq!(failed_null, r#"{"code":null,"tail":"boom"}"#);
    }

    /// `tail_of` returns at most INSTALL_FAILURE_TAIL_LINES lines, taking the
    /// newest, joined by newlines.
    #[test]
    fn tail_of_keeps_only_the_newest_lines() {
        let recent = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let mut g = recent.lock().unwrap();
            for i in 0..(INSTALL_FAILURE_TAIL_LINES + 10) {
                g.push(format!("line {i}"));
            }
        }
        let tail = tail_of(&recent);
        let lines: Vec<&str> = tail.lines().collect();
        assert_eq!(lines.len(), INSTALL_FAILURE_TAIL_LINES);
        // The very last produced line must be present; the very first must not.
        assert_eq!(
            *lines.last().unwrap(),
            format!("line {}", INSTALL_FAILURE_TAIL_LINES + 9)
        );
        assert_eq!(*lines.first().unwrap(), "line 10");
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
                eprintln!("skip: spawn failed (no resolvable clio-agent-gact?): {e:?}");
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

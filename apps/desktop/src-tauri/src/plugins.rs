//! Plugins discovery.
//!
//! Mirrors the TUI's `~/.config/gact/plugins/` behaviour: the user
//! registers a binary path + default args in the frontend, and the
//! Tauri shell execs it on demand. Output is captured with a hard
//! timeout and a small size cap so a runaway plugin can't lock the
//! UI or pour megabytes through IPC.

use serde::{Deserialize, Serialize};
use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
pub struct ExecPluginRequest {
    /// Absolute path or PATH-resolvable command name. The frontend
    /// is responsible for showing the user what they're about to run
    /// — there's no sandboxing layer beyond the OS-level execution.
    pub path: String,
    /// Per-invocation argv tail. Combined with whatever the plugin
    /// definition already carries (the frontend merges before this
    /// hop).
    #[serde(default)]
    pub args: Vec<String>,
    /// Optional cwd. When unset, the command inherits Tauri's cwd.
    #[serde(default)]
    pub cwd: Option<String>,
    /// Hard wall-clock limit. Defaults to 10s if omitted; the UI
    /// can override per plugin (a watch script might want 1s, a
    /// scaffolder might want 30s).
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ExecPluginResult {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub timed_out: bool,
}

/// Cap on captured stdout/stderr bytes per call. 64 KiB is enough
/// for slash-command output snippets and keeps the IPC payload bounded.
const OUTPUT_CAP_BYTES: usize = 64 * 1024;

#[tauri::command]
pub fn exec_plugin(req: ExecPluginRequest) -> Result<ExecPluginResult, String> {
    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(10_000).min(60_000));
    let started = Instant::now();

    let mut cmd = Command::new(&req.path);
    cmd.args(&req.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = &req.cwd {
        cmd.current_dir(cwd);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn `{}`: {e}", req.path))?;

    // Drain stdout/stderr on background threads so a chatty plugin
    // can't fill the OS pipe buffer and deadlock the wait below.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdout_thread = stdout.map(|mut s| {
        thread::spawn(move || {
            let mut buf = Vec::with_capacity(4096);
            let _ = s.by_ref().take(OUTPUT_CAP_BYTES as u64).read_to_end(&mut buf);
            buf
        })
    });
    let stderr_thread = stderr.map(|mut s| {
        thread::spawn(move || {
            let mut buf = Vec::with_capacity(4096);
            let _ = s.by_ref().take(OUTPUT_CAP_BYTES as u64).read_to_end(&mut buf);
            buf
        })
    });

    // Poll for completion with the wall-clock budget. `try_wait` is
    // the non-blocking variant; if the budget expires, kill the child
    // and report `timed_out`.
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    timed_out = true;
                    break std::process::ExitStatus::default();
                }
                thread::sleep(Duration::from_millis(40));
            }
            Err(e) => return Err(format!("wait `{}`: {e}", req.path)),
        }
    };

    let stdout_bytes = stdout_thread
        .map(|t| t.join().unwrap_or_default())
        .unwrap_or_default();
    let stderr_bytes = stderr_thread
        .map(|t| t.join().unwrap_or_default())
        .unwrap_or_default();

    Ok(ExecPluginResult {
        status: status.code().unwrap_or(if timed_out { -1 } else { 0 }),
        stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
        stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
        duration_ms: started.elapsed().as_millis() as u64,
        timed_out,
    })
}

//! First-run install/repair runner feeding the boot lifecycle.
//!
//! Runs the upstream clio-agent installer, streaming progress to the
//! frontend as Tauri events; on success re-kicks the supervisor's
//! spawn→probe so boot resolves to `Ready` instead of `NeedsInstall`.

use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter};

use crate::supervisor_boot_log::{boot_log_line, reset_boot_log};
use crate::supervisor_install_command::install_command_versioned;
use crate::supervisor_install_events::{
    record_recent_line, tail_of, InstallFailed, InstallProgress, InstallRecentLines,
    EVT_INSTALL_DONE, EVT_INSTALL_FAILED, EVT_INSTALL_PROGRESS,
};

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
    install_clio_versioned(app, force, None, on_success);
}

/// Like {@link install_clio} but pins a specific clio-agent release ref (from
/// the update panel's Backend row). `target_version = None` installs the
/// default `develop` ref — identical to {@link install_clio}.
pub fn install_clio_versioned<R, F>(
    app: AppHandle<R>,
    force: bool,
    target_version: Option<String>,
    on_success: F,
) where
    R: tauri::Runtime,
    F: FnOnce(),
{
    // Fresh transcript for this install/repair/update attempt.
    reset_boot_log(if target_version.is_some() {
        "update"
    } else if force {
        "repair"
    } else {
        "install"
    });
    let (program, args) = install_command_versioned(force, target_version.as_deref());

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
            // re-poll of get_backend sees Starting->Ready, not NeedsInstall.
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

/// Read a child stream line-by-line, emitting each as a progress event and
/// recording it in the shared ring buffer for the failure tail.
fn stream_lines<R: tauri::Runtime, B: BufRead>(
    reader: B,
    app: &AppHandle<R>,
    recent: &InstallRecentLines,
) {
    for line in reader.lines() {
        let Ok(line) = line else { break };
        // Persist to the on-disk boot log so "Open logs" works after an
        // install/repair failure, not just the streamed-to-UI tail.
        boot_log_line(&line);
        record_recent_line(recent, line.clone());
        let _ = app.emit(EVT_INSTALL_PROGRESS, InstallProgress { line });
    }
}

//! First-run install/repair runner feeding the boot lifecycle.
//!
//! Runs the upstream clio-agent installer, streaming progress to the
//! frontend as Tauri events; on success re-kicks the supervisor's
//! spawn→probe so boot resolves to `Ready` instead of `NeedsInstall`.

use std::{
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
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
use crate::supervisor_update_verify::{bundled_update_verify_steps, run_verify_steps, VerifyStep};

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
    run_install_command(app, program, args, Vec::new(), on_success);
}

/// Upgrade the writable runtime carried by a bundled Windows installation.
/// Unlike the upstream bootstrap installer, this targets the exact Python
/// distribution the desktop supervisor launches.
pub fn update_bundled_clio<R, F>(
    app: AppHandle<R>,
    runtime_dir: &Path,
    target_version: &str,
    on_success: F,
) where
    R: tauri::Runtime,
    F: FnOnce(),
{
    reset_boot_log("update");
    let version = target_version
        .trim()
        .trim_start_matches('v')
        .replace('+', ".");
    if version.is_empty()
        || !version
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
    {
        let _ = app.emit(
            EVT_INSTALL_FAILED,
            InstallFailed {
                code: None,
                tail: "The requested CLIO version is invalid.".to_string(),
            },
        );
        return;
    }
    let executable = if cfg!(windows) { "uv.exe" } else { "uv" };
    let python = if cfg!(windows) {
        runtime_dir.join("python/python.exe")
    } else {
        runtime_dir.join("python/bin/python3")
    };
    let uv = bundled_uv_path(runtime_dir, executable);
    if !uv.is_file() || !python.is_file() {
        let _ = app.emit(
            EVT_INSTALL_FAILED,
            InstallFailed {
                code: None,
                tail: format!("The managed CLIO runtime is incomplete at {runtime_dir:?}."),
            },
        );
        return;
    }
    let program = uv.to_string_lossy().into_owned();
    let args = bundled_update_args(&python, &version);
    let verify = bundled_update_verify_steps(runtime_dir, &python, &version);
    run_install_command(app, program, args, verify, on_success);
}

fn bundled_update_args(python: &Path, version: &str) -> Vec<String> {
    vec![
        "pip".to_string(),
        "install".to_string(),
        "--python".to_string(),
        python.to_string_lossy().into_owned(),
        "--upgrade".to_string(),
        "--reinstall-package".to_string(),
        "clio-agent".to_string(),
        format!("clio-agent=={version}"),
        "clio-kit==2.10.6".to_string(),
        "globus-sdk>=3.0.0".to_string(),
        "dspy==3.3.0b1".to_string(),
        "fastmcp==4.0.0b5".to_string(),
        "fastmcp-slim==4.0.0b5".to_string(),
        "fastmcp-tasks==4.0.0b5".to_string(),
    ]
}

/// Locate the package manager shipped with the relocatable runtime.
///
/// Runtime builders place `uv` under `bin/` on every platform. Keep the
/// legacy root fallback so installations produced before that layout was
/// standardized remain updateable.
fn bundled_uv_path(runtime_dir: &Path, executable: &str) -> PathBuf {
    let packaged = runtime_dir.join("bin").join(executable);
    if packaged.is_file() {
        return packaged;
    }
    runtime_dir.join(executable)
}

fn run_install_command<R, F>(
    app: AppHandle<R>,
    program: String,
    args: Vec<String>,
    verify: Vec<VerifyStep>,
    on_success: F,
) where
    R: tauri::Runtime,
    F: FnOnce(),
{
    let mut command = Command::new(&program);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Output is piped into the progress stream; never flash a console window.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let spawn = command.spawn();

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
            if let Err(failure) = run_verify_steps(&verify) {
                let _ = app.emit(
                    EVT_INSTALL_FAILED,
                    InstallFailed {
                        code: failure.code,
                        tail: failure.tail,
                    },
                );
                return;
            }
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

#[cfg(test)]
mod tests {
    use super::{bundled_update_args, bundled_uv_path};
    use std::{fs, path::Path};

    #[test]
    fn bundled_uv_path_prefers_the_packaged_bin_directory() {
        let root =
            std::env::temp_dir().join(format!("clio-bundled-updater-bin-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("bin")).expect("create runtime bin");
        fs::write(root.join("bin/uv-test"), b"uv").expect("write packaged uv");

        assert_eq!(bundled_uv_path(&root, "uv-test"), root.join("bin/uv-test"));

        fs::remove_dir_all(root).expect("remove test runtime");
    }

    #[test]
    fn bundled_uv_path_keeps_the_legacy_root_fallback() {
        let root =
            std::env::temp_dir().join(format!("clio-bundled-updater-root-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create runtime root");
        fs::write(root.join("uv-test"), b"uv").expect("write legacy uv");

        assert_eq!(bundled_uv_path(&root, "uv-test"), root.join("uv-test"));

        fs::remove_dir_all(root).expect("remove test runtime");
    }

    #[test]
    fn bundled_update_force_reinstalls_clio_agent() {
        let args = bundled_update_args(Path::new("C:/runtime/python/python.exe"), "0.9.4.9");

        assert!(args
            .windows(2)
            .any(|pair| { pair == ["--reinstall-package".to_string(), "clio-agent".to_string()] }));
        assert!(args.contains(&"clio-agent==0.9.4.9".to_string()));
    }
}

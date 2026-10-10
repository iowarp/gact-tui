//! Install the backend's locked tool packages into managed storage, not the app payload.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::{
    io::{BufRead, BufReader},
    sync::Mutex,
    thread,
};

use crate::supervisor_boot_log::boot_log_line;

pub(crate) fn install_command(runtime: &Path, workspace: &Path, user: &Path) -> Command {
    let python = if cfg!(windows) {
        "python/python.exe"
    } else {
        "python/bin/python3.13"
    };
    let mut command = Command::new(runtime.join(python));
    command
        .args([
            "-I",
            "-B",
            "-X",
            "utf8",
            "-u",
            "-m",
            "clio_agent.runtime.document_install",
            "--workspace",
        ])
        .arg(workspace)
        .env("GACT_BUNDLED_RUNTIME_DIR", runtime)
        .stdin(Stdio::null());
    if std::env::var_os("CLIO_AGENT_HOME").is_none() && std::env::var_os("CLIO_USER_DIR").is_none()
    {
        let key = if user.ends_with("clio-user") {
            "CLIO_USER_DIR"
        } else {
            "CLIO_AGENT_HOME"
        };
        command.env(key, user);
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    command
}

pub(crate) fn prepare_packages(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<(), String> {
    run_install(install_command(runtime, workspace, user), &boot_log_line)
}

#[cfg(windows)]
pub(crate) fn prepare_packages_for_install(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<(), String> {
    run_install(
        explicit_install_command(runtime, workspace, user),
        &boot_log_line,
    )
}

#[cfg(windows)]
fn explicit_install_command(runtime: &Path, workspace: &Path, user: &Path) -> Command {
    let mut command = install_command(runtime, workspace, user);
    command.arg("--setup-protected-execution");
    command
}

fn run_install(mut command: Command, log: &(impl Fn(&str) + Sync)) -> Result<(), String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("start managed package installation: {error}"))?;
    let stdout = child.stdout.take().expect("piped installer stdout");
    let stderr = child.stderr.take().expect("piped installer stderr");
    let tail = Mutex::new(String::new());
    let status = thread::scope(|scope| {
        scope.spawn(|| {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                log(&line);
                // Retain installer-command progress as well as Desktop's log.
                println!("{line}");
            }
        });
        scope.spawn(|| {
            for line in BufReader::new(stderr).lines() {
                let Ok(line) = line else { break };
                log(&line);
                if let Ok(mut detail) = tail.lock() {
                    detail.push_str(&line);
                    detail.push('\n');
                    if detail.len() > 8000 {
                        *detail = detail
                            .chars()
                            .rev()
                            .take(4000)
                            .collect::<String>()
                            .chars()
                            .rev()
                            .collect();
                    }
                }
            }
        });
        child.wait()
    })
    .map_err(|error| format!("wait for managed package installation: {error}"))?;
    if !status.success() {
        let detail = tail.into_inner().unwrap_or_default();
        return Err(format!(
            "managed Python/Node/Office package installation failed ({status}): {detail}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn only_explicit_installation_requests_sandbox_creation() {
        let path = Path::new("fixture");
        let ordinary = install_command(path, path, path);
        let installation = explicit_install_command(path, path, path);
        assert!(!ordinary
            .get_args()
            .any(|arg| arg == "--setup-protected-execution"));
        assert!(installation
            .get_args()
            .any(|arg| arg == "--setup-protected-execution"));
    }

    #[test]
    fn installer_output_fixture() {
        if std::env::var("CLIO_INSTALL_OUTPUT_FIXTURE").as_deref() != Ok("1") {
            return;
        }
        println!("Preparing sandbox read/execute access: bundled_runtime...");
        eprintln!("permission preparation failed");
        std::process::exit(7);
    }

    #[test]
    fn streams_progress_and_retains_failure_output() {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "execution_install::tests::installer_output_fixture",
                "--nocapture",
            ])
            .env("CLIO_INSTALL_OUTPUT_FIXTURE", "1");
        let lines = Mutex::new(Vec::new());
        let error = run_install(command, &|line| {
            lines.lock().unwrap().push(line.to_string())
        })
        .unwrap_err();
        assert!(error.contains("permission preparation failed"));
        let lines = lines.into_inner().unwrap();
        assert!(lines.iter().any(|line| line.contains("bundled_runtime")));
        assert!(lines
            .iter()
            .any(|line| line.contains("permission preparation failed")));
    }

    #[test]
    fn installer_uses_bundled_python_and_managed_workspace() {
        let runtime = Path::new("runtime with spaces");
        let workspace = Path::new("managed workspace");
        let command = install_command(runtime, workspace, Path::new("user"));
        let python = if cfg!(windows) {
            "python/python.exe"
        } else {
            "python/bin/python3.13"
        };
        assert_eq!(command.get_program(), runtime.join(python));
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(
            args,
            [
                "-I",
                "-B",
                "-X",
                "utf8",
                "-u",
                "-m",
                "clio_agent.runtime.document_install",
                "--workspace",
                "managed workspace"
            ]
        );
        assert!(command
            .get_envs()
            .any(|(key, value)| key == "GACT_BUNDLED_RUNTIME_DIR"
                && value == Some(runtime.as_os_str())));
    }
}

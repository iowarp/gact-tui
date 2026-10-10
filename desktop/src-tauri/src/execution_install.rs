//! Install the backend's locked tool packages into managed storage, not the app payload.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::{
    io::{BufRead, BufReader},
    sync::Mutex,
    thread,
};

use crate::supervisor_boot_log::boot_log_line;

fn bundled_python(runtime: &Path) -> Result<PathBuf, String> {
    let manifest = std::fs::read(runtime.join("runtime.json"))
        .map_err(|error| format!("read bundled runtime manifest: {error}"))?;
    let manifest: serde_json::Value = serde_json::from_slice(&manifest)
        .map_err(|error| format!("parse bundled runtime manifest: {error}"))?;
    if manifest["schema"].as_u64() != Some(1) {
        return Err("unsupported bundled runtime manifest schema".into());
    }
    let python = manifest["exec"][0]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or("bundled runtime manifest has no interpreter")?;
    let relative = Path::new(python);
    if !relative
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err("bundled runtime interpreter must stay inside its runtime".into());
    }
    Ok(runtime.join(relative))
}

pub(crate) fn install_command(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<Command, String> {
    let mut command = Command::new(bundled_python(runtime)?);
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
    Ok(command)
}

pub(crate) fn prepare_packages(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<(), String> {
    run_install(startup_command(runtime, workspace, user)?, &boot_log_line)
}

fn startup_command(runtime: &Path, workspace: &Path, user: &Path) -> Result<Command, String> {
    let mut command = install_command(runtime, workspace, user)?;
    command.arg("--reuse-installed");
    Ok(command)
}

#[cfg(windows)]
pub(crate) fn prepare_packages_for_install(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<(), String> {
    run_install(
        explicit_install_command(runtime, workspace, user)?,
        &boot_log_line,
    )
}

#[cfg(windows)]
fn explicit_install_command(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<Command, String> {
    let mut command = install_command(runtime, workspace, user)?;
    command.arg("--setup-protected-execution");
    Ok(command)
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

    struct RuntimeFixture(PathBuf);

    impl RuntimeFixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("clio-install-command-{}-{id}", std::process::id()));
            std::fs::create_dir(&path).unwrap();
            let fixture = Self(path);
            fixture.manifest(r#"{"schema":1,"exec":["python/bin/python3.14","-I"]}"#);
            fixture
        }

        fn manifest(&self, content: &str) {
            std::fs::write(self.0.join("runtime.json"), content).unwrap();
        }
    }

    impl Drop for RuntimeFixture {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn validates_the_runtime_interpreter_before_launching() {
        let fixture = RuntimeFixture::new();
        for manifest in [
            r#"{"schema":2,"exec":["python/bin/python3.14"]}"#,
            r#"{"schema":1,"exec":[]}"#,
            r#"{"schema":1,"exec":[""]}"#,
            r#"{"schema":1,"exec":["../outside"]}"#,
            r#"{"schema":1,"exec":["/outside"]}"#,
            "invalid json",
        ] {
            fixture.manifest(manifest);
            assert!(bundled_python(&fixture.0).is_err(), "{manifest}");
        }
    }

    #[test]
    fn routine_startup_requests_reuse_without_creating_sandbox_accounts() {
        let fixture = RuntimeFixture::new();
        let path = fixture.0.as_path();
        let startup = startup_command(path, path, path).unwrap();
        assert!(startup.get_args().any(|arg| arg == "--reuse-installed"));
        assert!(!startup
            .get_args()
            .any(|arg| arg == "--setup-protected-execution"));
    }

    #[cfg(windows)]
    #[test]
    fn only_explicit_installation_requests_sandbox_creation() {
        let fixture = RuntimeFixture::new();
        let path = fixture.0.as_path();
        let ordinary = startup_command(path, path, path).unwrap();
        let installation = explicit_install_command(path, path, path).unwrap();
        assert!(!ordinary
            .get_args()
            .any(|arg| arg == "--setup-protected-execution"));
        assert!(ordinary.get_args().any(|arg| arg == "--reuse-installed"));
        assert!(!installation
            .get_args()
            .any(|arg| arg == "--reuse-installed"));
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
        let fixture = RuntimeFixture::new();
        let runtime = fixture.0.as_path();
        let workspace = Path::new("managed workspace");
        let command = install_command(runtime, workspace, Path::new("user")).unwrap();
        assert_eq!(command.get_program(), runtime.join("python/bin/python3.14"));
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

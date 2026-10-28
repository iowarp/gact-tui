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

use crate::package_stamp::{self, LaunchCheck};
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

/// What a launch did about the managed packages before starting the agent.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PackageLaunch {
    /// Checked (and installed or repaired if needed) before the agent started.
    Checked,
    /// Unchanged since the last verified check: check again after the agent is ready.
    CheckAfterStart,
    /// Changed or never verified: installing or checking now, alongside the agent.
    CheckingAlongside,
}

/// Verify Windows protection first, then prepare document packages alongside the agent.
/// An older runtime without a separate fence command retains the full blocking check.
pub(crate) fn prepare_packages(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<PackageLaunch, String> {
    #[cfg(windows)]
    {
        let mut help = install_command(runtime, workspace, user)?;
        help.arg("--help");
        let mut fence = install_command(runtime, workspace, user)?;
        fence.arg("--protected-execution-only");
        if !check_fence(help, fence, &boot_log_line)? {
            boot_log_line("Runtime predates independent protected execution; checking managed packages before start");
            run_check(runtime, workspace, user, true, &boot_log_line)?;
            return Ok(PackageLaunch::Checked);
        }
    }
    match package_stamp::launch_check(runtime, workspace, user) {
        LaunchCheck::Unchanged => {
            boot_log_line(
                "Managed packages unchanged since their last check (reason=launch_stamp_unchanged); \
                 checking them again after the agent starts",
            );
            Ok(PackageLaunch::CheckAfterStart)
        }
        LaunchCheck::Required(reason) => {
            boot_log_line(&format!(
                "Checking managed packages alongside the agent reason={reason}"
            ));
            check_packages_in_background(
                runtime.to_path_buf(),
                workspace.to_path_buf(),
                user.to_path_buf(),
                true,
            );
            Ok(PackageLaunch::CheckingAlongside)
        }
    }
}

/// A failed or unsupported fence is never replaced with an optimistic ready state.
#[cfg(any(windows, test))]
fn check_fence(
    probe: Command,
    check: Command,
    log: &(impl Fn(&str) + Sync),
) -> Result<bool, String> {
    if !supports_installer_argument(probe, "--protected-execution-only")? {
        return Ok(false);
    }
    run_install(check, log)?;
    Ok(true)
}

/// The full check for a launch that did not wait for it. It installs a first or
/// changed installation and repairs a damaged one (the Python step reinstalls
/// whatever no longer matches its receipt); every outcome is a typed boot-log line.
/// A failure forgets the stamp so the next launch checks again.
pub(crate) fn check_packages_in_background(
    runtime: PathBuf,
    workspace: PathBuf,
    user: PathBuf,
    probe: bool,
) {
    thread::spawn(move || {
        let started = std::time::Instant::now();
        let reused = std::sync::atomic::AtomicBool::new(false);
        let log = |line: &str| {
            if line.contains("Verified installation unchanged") {
                reused.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            boot_log_line(line);
        };
        match run_check(&runtime, &workspace, &user, probe, &log) {
            Ok(true) => {
                let reason = if reused.load(std::sync::atomic::Ordering::Relaxed) {
                    "managed_packages_unchanged"
                } else {
                    "managed_packages_installed"
                };
                boot_log_line(&format!(
                    "Managed packages checked reason={reason} {:.3}s",
                    started.elapsed().as_secs_f64()
                ));
            }
            Ok(false) => {}
            Err(error) => {
                boot_log_line(&format!(
                    "Managed package check failed reason=managed_packages_check_failed: {error}"
                ));
                if let Err(error) = package_stamp::forget(&user) {
                    boot_log_line(&format!("reason=launch_stamp_not_removed: {error}"));
                }
            }
        }
    });
}

/// Run `document_install --reuse-installed` (after a `--help` probe for runtimes that
/// predate reuse when `probe`), and record the launch stamp when it verified.
fn run_check(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
    probe: bool,
    log: &(impl Fn(&str) + Sync),
) -> Result<bool, String> {
    let startup = startup_command(runtime, workspace, user)?;
    #[cfg(windows)]
    let startup = owned_package_command(startup, &crate::supervisor_launcher::locate_launcher()?);
    let verified = if probe {
        let mut help = install_command(runtime, workspace, user)?;
        help.arg("--help");
        prepare_startup(help, startup, log)?
    } else {
        run_install(startup, log).map(|()| true)?
    };
    if verified {
        record_stamp(runtime, workspace, user);
    }
    Ok(verified)
}

#[cfg(windows)]
fn owned_package_command(command: Command, launcher: &Path) -> Command {
    let mut owned = Command::new(launcher);
    owned
        .arg("--managed-package-command")
        .arg(command.get_program())
        .args(command.get_args());
    for (key, value) in command.get_envs() {
        if let Some(value) = value {
            owned.env(key, value);
        } else {
            owned.env_remove(key);
        }
    }
    if let Some(directory) = command.get_current_dir() {
        owned.current_dir(directory);
    }
    owned.env("CLIO_DESKTOP_PARENT_PID", std::process::id().to_string());
    owned.stdin(Stdio::null()).creation_flags(0x0800_0000);
    owned
}

fn record_stamp(runtime: &Path, workspace: &Path, user: &Path) {
    if let Err(error) = package_stamp::record_verified(runtime, workspace, user) {
        // Not fatal: the next launch checks before starting, as it did before stamps.
        boot_log_line(&format!("reason=launch_stamp_not_recorded: {error}"));
    }
}

/// Run the startup check; `Ok(true)` when it verified the packages, `Ok(false)` when
/// the runtime predates package reuse and nothing was checked.
fn prepare_startup(
    probe: Command,
    startup: Command,
    log: &(impl Fn(&str) + Sync),
) -> Result<bool, String> {
    if !supports_installer_argument(probe, "--reuse-installed")? {
        log("This CLIO runtime predates package reuse. Keeping its installed packages; update CLIO from System version.");
        return Ok(false);
    }
    run_install(startup, log).map(|()| true)
}

fn supports_installer_argument(mut probe: Command, argument: &str) -> Result<bool, String> {
    let help = probe
        .output()
        .map_err(|error| format!("inspect managed package setup: {error}"))?;
    if !help.status.success() {
        return Err(format!(
            "inspect managed package setup failed ({}): {}",
            help.status,
            String::from_utf8_lossy(&help.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&help.stdout)
        .split_whitespace()
        .any(|arg| arg.trim_matches(|c: char| matches!(c, '[' | ']' | ',')) == argument))
}

fn startup_command(runtime: &Path, workspace: &Path, user: &Path) -> Result<Command, String> {
    let mut command = install_command(runtime, workspace, user)?;
    command.arg("--reuse-installed");
    Ok(command)
}

/// The installer's explicit package setup (no reuse of earlier checks).
pub(crate) fn prepare_packages_for_install(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<(), String> {
    run_install(
        explicit_install_command(runtime, workspace, user)?,
        &boot_log_line,
    )?;
    // The first launch after this install starts the agent without re-checking.
    record_stamp(runtime, workspace, user);
    Ok(())
}

fn explicit_install_command(
    runtime: &Path,
    workspace: &Path,
    user: &Path,
) -> Result<Command, String> {
    #[allow(unused_mut)]
    let mut command = install_command(runtime, workspace, user)?;
    // The one-time sandbox setup with administrator approval exists only on Windows.
    #[cfg(windows)]
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

    #[cfg(windows)]
    #[test]
    fn package_owner_preserves_command_and_environment_without_attaching_the_gui() {
        let mut python = Command::new("private/python.exe");
        python.args([
            "-B",
            "-m",
            "clio_agent.runtime.document_install",
            "--reuse-installed",
        ]);
        python
            .env("GACT_BUNDLED_RUNTIME_DIR", "private")
            .env_remove("UNUSED_INSTALLER_INPUT");
        python.current_dir("workspace");
        let owned = owned_package_command(python, Path::new("private/launcher.exe"));
        assert_eq!(owned.get_program(), "private/launcher.exe");
        assert_eq!(
            owned.get_args().collect::<Vec<_>>(),
            [
                "--managed-package-command",
                "private/python.exe",
                "-B",
                "-m",
                "clio_agent.runtime.document_install",
                "--reuse-installed"
            ]
        );
        assert_eq!(owned.get_current_dir(), Some(Path::new("workspace")));
        assert!(owned
            .get_envs()
            .any(|(key, value)| key == "CLIO_DESKTOP_PARENT_PID"
                && value == Some(std::ffi::OsStr::new(&std::process::id().to_string()))));
        assert!(owned
            .get_envs()
            .any(|(key, value)| key == "GACT_BUNDLED_RUNTIME_DIR"
                && value == Some(std::ffi::OsStr::new("private"))));
        assert!(owned
            .get_envs()
            .any(|(key, value)| key == "UNUSED_INSTALLER_INPUT" && value.is_none()));
    }

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

    #[test]
    fn startup_help_fixture() {
        match std::env::var("CLIO_SETUP_HELP_FIXTURE").as_deref() {
            Ok("legacy") => {
                println!("usage: document_install.py [-h] [--workspace WORKSPACE]");
                std::process::exit(0);
            }
            Ok("modern") => {
                println!("usage: document_install.py [--reuse-installed]");
                std::process::exit(0);
            }
            Ok("fence") => {
                println!("usage: document_install.py [--protected-execution-only]");
                std::process::exit(0);
            }
            Ok("failed") => {
                eprintln!("ImportError: package setup could not load");
                std::process::exit(2);
            }
            _ => {}
        }
    }

    fn help_fixture(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "execution_install::tests::startup_help_fixture",
                "--nocapture",
            ])
            .env("CLIO_SETUP_HELP_FIXTURE", mode);
        command
    }

    #[test]
    fn legacy_startup_keeps_existing_packages_without_running_unsupported_arguments() {
        let lines = Mutex::new(Vec::new());
        prepare_startup(
            help_fixture("legacy"),
            Command::new("must-not-run-old-installer"),
            &|line| lines.lock().unwrap().push(line.to_string()),
        )
        .unwrap();
        assert!(lines
            .into_inner()
            .unwrap()
            .iter()
            .any(|line| line.contains("Keeping its installed packages")));
    }

    #[test]
    fn modern_startup_runs_setup_and_preserves_its_failure() {
        let mut startup = Command::new(std::env::current_exe().unwrap());
        startup
            .args([
                "--exact",
                "execution_install::tests::installer_output_fixture",
                "--nocapture",
            ])
            .env("CLIO_INSTALL_OUTPUT_FIXTURE", "1");
        let error = prepare_startup(help_fixture("modern"), startup, &|_| {}).unwrap_err();
        assert!(error.contains("permission preparation failed"));
    }

    #[test]
    fn old_runtimes_require_the_full_check_instead_of_skipping_the_fence() {
        assert!(!check_fence(
            help_fixture("modern"),
            Command::new("must-not-run-unsupported-argument"),
            &|_| {},
        )
        .unwrap());
    }

    #[test]
    fn independent_fence_verification_preserves_a_real_setup_failure() {
        let mut check = Command::new(std::env::current_exe().unwrap());
        check
            .args([
                "--exact",
                "execution_install::tests::installer_output_fixture",
                "--nocapture",
            ])
            .env("CLIO_INSTALL_OUTPUT_FIXTURE", "1");
        let error = check_fence(help_fixture("fence"), check, &|_| {}).unwrap_err();
        assert!(error.contains("permission preparation failed"));
    }

    #[test]
    fn independent_fence_verification_requires_success_before_packages_may_defer() {
        assert!(check_fence(help_fixture("fence"), help_fixture("legacy"), &|_| {}).unwrap());
    }

    #[test]
    fn a_broken_help_probe_does_not_silently_skip_setup() {
        let error = prepare_startup(
            help_fixture("failed"),
            Command::new("must-not-run-installer"),
            &|_| {},
        )
        .unwrap_err();
        assert!(error.contains("ImportError: package setup could not load"));
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

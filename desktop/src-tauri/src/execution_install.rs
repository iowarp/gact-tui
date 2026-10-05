//! Install the backend's locked tool packages into managed storage, not the app payload.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};

pub(crate) fn install_command(runtime: &Path, workspace: &Path, user: &Path) -> Command {
    let python = if cfg!(windows) {
        "python/python.exe"
    } else {
        "python/bin/python3.13"
    };
    let mut command = Command::new(runtime.join(python));
    command
        .args(["-m", "clio_agent.runtime.document_install", "--workspace"])
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
    let output = install_command(runtime, workspace, user)
        .output()
        .map_err(|error| format!("start managed package installation: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        let bounded: String = detail
            .chars()
            .rev()
            .take(4000)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        return Err(format!(
            "managed Python/Node/Office package installation failed ({}): {bounded}",
            output.status
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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

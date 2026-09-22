//! Builds the launcher command used by the spawn stage.
//!
//! Constructs the `--host/--port/--token` invocation with piped
//! stdout/stderr so the spawn path can tee boot output into the log.

use std::{
    ffi::OsString,
    path::Path,
    process::{Command, Stdio},
};

use crate::sidecar_setup::{BUNDLED_RUNTIME_ENV, CLIO_USER_DIR_ENV};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub(crate) const LAUNCHER_HOST: &str = "127.0.0.1";
const ARC_FILE_CAPACITY_ENV: &str = "CLIO_ARC_CTE_FILE_CAPACITY";
const DESKTOP_MANAGED_ENV: &str = "CLIO_DESKTOP_MANAGED";
const DESKTOP_PARENT_PID_ENV: &str = "CLIO_DESKTOP_PARENT_PID";
// clio-core currently materializes the Windows file-tier backing file at the
// 1 GiB desktop arena size. Advertising a larger capacity makes the next boot's
// safety preflight reject that retained file as undersized, so a successful
// first run silently degrades to LocalFS after restart. Keep the managed
// desktop's declared capacity aligned with the file clio-core actually creates.
const DESKTOP_ARC_FILE_CAPACITY: &str = "1GB";

fn desktop_arc_file_capacity(configured: Option<OsString>) -> OsString {
    configured.unwrap_or_else(|| OsString::from(DESKTOP_ARC_FILE_CAPACITY))
}

pub(crate) fn launcher_spawn_command(
    launcher: &Path,
    port: u16,
    token: &str,
    working_dir: Option<&Path>,
    user_dir: Option<&Path>,
    bundled_runtime: Option<&Path>,
) -> Command {
    let mut command = Command::new(launcher);
    command
        .arg("--host")
        .arg(LAUNCHER_HOST)
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(token)
        .stdin(Stdio::null())
        // Capture the launcher's (and its clio child's) output so a boot
        // failure leaves a re-openable transcript. Reader threads in the
        // spawn path tee each line into the persisted boot log.
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = working_dir {
        command.current_dir(dir);
    }
    if let Some(dir) = user_dir {
        command.env(CLIO_USER_DIR_ENV, dir);
    }
    if let Some(dir) = bundled_runtime {
        command.env(BUNDLED_RUNTIME_ENV, dir);
    }
    // The server/operator default is intentionally large (50GB), but applying it
    // unchanged to a consumer desktop makes first provider setup fail whenever
    // that much free space is unavailable. Keep an explicit operator override;
    // otherwise reserve a bounded desktop-sized tier that still leaves room for
    // the installer and normal user data.
    command.env(
        ARC_FILE_CAPACITY_ENV,
        desktop_arc_file_capacity(std::env::var_os(ARC_FILE_CAPACITY_ENV)),
    );
    // Enables the bearer-authenticated graceful-shutdown route. Generic and
    // independently started GACT servers never expose that lifecycle control.
    command.env(DESKTOP_MANAGED_ENV, "1");
    // The Windows launcher holds an identity-pinned handle to this exact
    // desktop process. If the desktop is terminated before Tauri can run its
    // graceful shutdown callback, the launcher exits and its KILL_ON_JOB_CLOSE
    // Job Object reaps the backend tree instead of orphaning it.
    command.env(DESKTOP_PARENT_PID_ENV, std::process::id().to_string());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_spawn_command_targets_launcher() {
        let launcher = Path::new("/tmp/clio-agent-gact-launcher");
        let command = launcher_spawn_command(launcher, 17812, "token-123", None, None, None);

        assert_eq!(command.get_program(), launcher.as_os_str());
    }

    #[test]
    fn launcher_spawn_command_sets_connection_args() {
        let command =
            launcher_spawn_command(Path::new("launcher"), 17812, "token-123", None, None, None);
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();

        assert_eq!(
            args,
            vec![
                "--host".to_string(),
                LAUNCHER_HOST.to_string(),
                "--port".to_string(),
                "17812".to_string(),
                "--token".to_string(),
                "token-123".to_string(),
            ]
        );
    }

    #[test]
    fn launcher_spawn_command_uses_desktop_workspace() {
        let workspace = Path::new("desktop-data/workspace");
        let command = launcher_spawn_command(
            Path::new("launcher"),
            17812,
            "token-123",
            Some(workspace),
            None,
            None,
        );

        assert_eq!(command.get_current_dir(), Some(workspace));
    }

    #[test]
    fn launcher_spawn_command_isolates_desktop_user_state() {
        let user_dir = Path::new("desktop-data/clio-user");
        let command = launcher_spawn_command(
            Path::new("launcher"),
            17812,
            "token-123",
            None,
            Some(user_dir),
            None,
        );

        assert_eq!(
            command
                .get_envs()
                .find(|(key, _)| *key == CLIO_USER_DIR_ENV),
            Some((CLIO_USER_DIR_ENV.as_ref(), Some(user_dir.as_os_str())))
        );
    }

    #[test]
    fn launcher_spawn_command_selects_prepared_bundled_runtime() {
        let runtime = Path::new("desktop-data/bundled-runtime/gact-runtime");
        let command = launcher_spawn_command(
            Path::new("launcher"),
            17812,
            "token-123",
            None,
            None,
            Some(runtime),
        );

        assert_eq!(
            command
                .get_envs()
                .find(|(key, _)| *key == BUNDLED_RUNTIME_ENV),
            Some((BUNDLED_RUNTIME_ENV.as_ref(), Some(runtime.as_os_str())))
        );
    }

    #[test]
    fn launcher_spawn_command_identifies_its_desktop_parent() {
        let command =
            launcher_spawn_command(Path::new("launcher"), 17812, "token-123", None, None, None);

        let expected = std::process::id().to_string();
        assert_eq!(
            command
                .get_envs()
                .find(|(key, _)| *key == DESKTOP_PARENT_PID_ENV),
            Some((
                DESKTOP_PARENT_PID_ENV.as_ref(),
                Some(std::ffi::OsStr::new(&expected)),
            ))
        );
    }

    #[test]
    fn desktop_arc_capacity_is_bounded_but_honors_operator_override() {
        assert_eq!(
            desktop_arc_file_capacity(None),
            OsString::from(DESKTOP_ARC_FILE_CAPACITY)
        );
        assert_eq!(
            desktop_arc_file_capacity(Some(OsString::from("24GB"))),
            OsString::from("24GB")
        );
    }
}

//! Builds the launcher command used by the spawn stage.
//!
//! Constructs the `--host/--port/--token` invocation with piped
//! stdout/stderr so the spawn path can tee boot output into the log.

use std::{
    path::Path,
    process::{Command, Stdio},
};

use crate::sidecar_setup::CLIO_USER_DIR_ENV;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

pub(crate) const LAUNCHER_HOST: &str = "127.0.0.1";

pub(crate) fn launcher_spawn_command(
    launcher: &Path,
    port: u16,
    token: &str,
    working_dir: Option<&Path>,
    user_dir: Option<&Path>,
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
        let command = launcher_spawn_command(launcher, 17812, "token-123", None, None);

        assert_eq!(command.get_program(), launcher.as_os_str());
    }

    #[test]
    fn launcher_spawn_command_sets_connection_args() {
        let command = launcher_spawn_command(Path::new("launcher"), 17812, "token-123", None, None);
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
        );

        assert_eq!(
            command
                .get_envs()
                .find(|(key, _)| *key == CLIO_USER_DIR_ENV),
            Some((CLIO_USER_DIR_ENV.as_ref(), Some(user_dir.as_os_str())))
        );
    }
}

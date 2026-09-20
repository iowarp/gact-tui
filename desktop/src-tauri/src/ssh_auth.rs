//! Shared OpenSSH authentication policy for infrastructure commands and tunnels.

use std::process::Command;

pub(crate) const PASSWORD_AUTH: &str = "password";

pub(crate) fn append_auth_arguments(args: &mut Vec<String>, auth_method: Option<&str>) {
    args.extend([
        "-o".into(),
        "StrictHostKeyChecking=accept-new".into(),
        "-o".into(),
        "ConnectTimeout=8".into(),
    ]);
    if auth_method == Some(PASSWORD_AUTH) {
        args.extend([
            "-o".into(),
            "BatchMode=no".into(),
            "-o".into(),
            "NumberOfPasswordPrompts=1".into(),
            "-o".into(),
            "PreferredAuthentications=keyboard-interactive,password".into(),
        ]);
    } else {
        args.extend(["-o".into(), "BatchMode=yes".into()]);
    }
}

pub(crate) fn configure_askpass(
    command: &mut Command,
    auth_method: Option<&str>,
    credential_id: Option<&str>,
) -> Result<(), String> {
    if auth_method != Some(PASSWORD_AUTH) {
        return Ok(());
    }
    let credential_id = credential_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Save a password for this SSH host before connecting.".to_string())?;
    let executable = std::env::current_exe()
        .map_err(|error| format!("Could not locate CLIO's SSH password helper: {error}"))?;
    command
        .env("SSH_ASKPASS", executable)
        .env("SSH_ASKPASS_REQUIRE", "force")
        .env("CLIO_SSH_ASKPASS_CREDENTIAL", credential_id);
    if std::env::var_os("DISPLAY").is_none() {
        command.env("DISPLAY", "clio:0");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::append_auth_arguments;

    #[test]
    fn password_mode_enables_one_noninteractive_askpass_attempt() {
        let mut args = Vec::new();
        append_auth_arguments(&mut args, Some("password"));
        assert!(args.iter().any(|arg| arg == "BatchMode=no"));
        assert!(args.iter().any(|arg| arg == "NumberOfPasswordPrompts=1"));
        assert!(!args.iter().any(|arg| arg == "BatchMode=yes"));
    }

    #[test]
    fn key_and_agent_mode_never_wait_for_a_prompt() {
        let mut args = Vec::new();
        append_auth_arguments(&mut args, Some("key"));
        assert!(args.iter().any(|arg| arg == "BatchMode=yes"));
    }
}

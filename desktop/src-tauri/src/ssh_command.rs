//! Builds the `ssh -L` port-forward command for the tunnel manager.
//!
//! Centralizes the `ssh` argument vector (keepalives, fail-fast forward)
//! and the availability probe, keeping `ssh.rs` free of process details.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn background_ssh_command() -> Command {
    let mut command = Command::new("ssh");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

use crate::ssh_auth::append_auth_arguments;
use crate::ssh_types::TunnelRequest;

pub(crate) fn ssh_available() -> bool {
    let out = background_ssh_command().arg("-V").output();
    match out {
        Ok(o) => !o.stderr.is_empty() || !o.stdout.is_empty(),
        Err(_) => false,
    }
}

pub(crate) fn build_ssh_forward_command(req: &TunnelRequest, local_port: u16) -> Command {
    let local_arg = format!("{local_port}:127.0.0.1:{}", req.remote_port);
    let destination = if req.profile.trim().is_empty() {
        if req.user.trim().is_empty() {
            req.host.clone()
        } else {
            format!("{}@{}", req.user, req.host)
        }
    } else {
        req.profile.clone()
    };

    let mut cmd = background_ssh_command();
    let mut auth_args = Vec::new();
    append_auth_arguments(&mut auth_args, Some(req.auth_method.as_str()));
    cmd.arg("-N")
        .arg("-T")
        .args(auth_args)
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg("-L")
        .arg(&local_arg);

    if req.port != 22 {
        cmd.arg("-p").arg(req.port.to_string());
    }
    if !req.key_path.is_empty() {
        cmd.arg("-i").arg(&req.key_path);
    }
    cmd.arg(destination);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd
}

#[cfg(test)]
mod tests {
    use super::build_ssh_forward_command;
    use crate::ssh_types::TunnelRequest;

    #[test]
    fn builds_expected_forwarding_command() {
        let req = TunnelRequest {
            host: "example.org".into(),
            user: "alice".into(),
            remote_port: 8910,
            key_path: "/tmp/id_ed25519".into(),
            profile: String::new(),
            port: 22,
            local_port: None,
            auth_method: "key".into(),
            credential_id: String::new(),
        };

        let cmd = build_ssh_forward_command(&req, 4567);
        let program = cmd.get_program().to_string_lossy();
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();

        assert_eq!(program, "ssh");
        assert_eq!(
            args,
            vec![
                "-N",
                "-T",
                "-o",
                "StrictHostKeyChecking=accept-new",
                "-o",
                "ConnectTimeout=8",
                "-o",
                "BatchMode=yes",
                "-o",
                "ExitOnForwardFailure=yes",
                "-o",
                "ServerAliveInterval=30",
                "-o",
                "ServerAliveCountMax=3",
                "-L",
                "4567:127.0.0.1:8910",
                "-i",
                "/tmp/id_ed25519",
                "alice@example.org",
            ]
        );
    }

    #[test]
    fn omits_identity_argument_when_key_path_is_empty() {
        let req = TunnelRequest {
            host: "example.org".into(),
            user: "alice".into(),
            remote_port: 8910,
            key_path: String::new(),
            profile: String::new(),
            port: 22,
            local_port: None,
            auth_method: "key".into(),
            credential_id: String::new(),
        };

        let cmd = build_ssh_forward_command(&req, 4567);
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();

        assert!(!args.iter().any(|arg| arg == "-i"));
        assert_eq!(args.last().map(String::as_str), Some("alice@example.org"));
    }

    #[test]
    fn uses_profile_and_non_default_port_without_composing_a_user_host() {
        let req = TunnelRequest {
            host: "resolved.example.org".into(),
            user: "alice".into(),
            remote_port: 17800,
            key_path: String::new(),
            profile: "homelab".into(),
            port: 2222,
            local_port: Some(43123),
            auth_method: "key".into(),
            credential_id: String::new(),
        };

        let cmd = build_ssh_forward_command(&req, 43123);
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();

        assert!(args.windows(2).any(|pair| pair == ["-p", "2222"]));
        assert_eq!(args.last().map(String::as_str), Some("homelab"));
    }
}

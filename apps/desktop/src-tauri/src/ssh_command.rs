//! Builds the `ssh -L` port-forward command for the tunnel manager.
//!
//! Centralizes the `ssh` argument vector (keepalives, fail-fast forward)
//! and the availability probe, keeping `ssh.rs` free of process details.

use std::process::{Command, Stdio};

use crate::ssh_types::TunnelRequest;

pub(crate) fn ssh_available() -> bool {
    let out = Command::new("ssh").arg("-V").output();
    match out {
        Ok(o) => !o.stderr.is_empty() || !o.stdout.is_empty(),
        Err(_) => false,
    }
}

pub(crate) fn build_ssh_forward_command(req: &TunnelRequest, local_port: u16) -> Command {
    let local_arg = format!("{local_port}:127.0.0.1:{}", req.remote_port);
    let user_at_host = format!("{}@{}", req.user, req.host);

    let mut cmd = Command::new("ssh");
    cmd.arg("-N")
        .arg("-T")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg("-L")
        .arg(&local_arg);

    if !req.key_path.is_empty() {
        cmd.arg("-i").arg(&req.key_path);
    }
    cmd.arg(user_at_host);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
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
            passphrase: None,
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
            passphrase: None,
        };

        let cmd = build_ssh_forward_command(&req, 4567);
        let args: Vec<String> = cmd
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();

        assert!(!args.iter().any(|arg| arg == "-i"));
        assert_eq!(args.last().map(String::as_str), Some("alice@example.org"));
    }
}

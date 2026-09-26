//! Pure command construction for the OpenSSH transport: the `ssh` argument
//! vector, the framed remote-command wrappers, and input validation.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct SshTransportRoute {
    pub profile: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    #[serde(default)]
    pub jump_hosts: Vec<String>,
    #[serde(default)]
    pub identity_file: String,
    #[serde(default)]
    pub platform: String,
}

#[derive(Deserialize)]
pub struct TransportCommand {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub scope: String,
    pub timeout_seconds: f64,
    #[serde(default)]
    pub stdin: String,
    #[serde(default = "default_exit_codes")]
    pub allowed_exit_codes: Vec<i32>,
}

fn default_exit_codes() -> Vec<i32> {
    vec![0]
}

pub fn validate_route(route: &SshTransportRoute) -> Result<(), String> {
    if route.profile.trim().is_empty() && route.host.trim().is_empty() {
        return Err("SSH profile or host is required".to_string());
    }
    if route.jump_hosts.iter().any(|jump| jump.trim().is_empty()) {
        return Err("Jump-host entries cannot be empty".to_string());
    }
    Ok(())
}

/// Two routes reach the same account over the same path, so one live
/// session can serve both.
pub fn compatible_route(left: &SshTransportRoute, right: &SshTransportRoute) -> bool {
    left.host.eq_ignore_ascii_case(&right.host)
        && left.user == right.user
        && left.port == right.port
        && left.jump_hosts == right.jump_hosts
        && left.identity_file == right.identity_file
        && left.platform == right.platform
}

/// The `ssh` arguments for one transport session.
///
/// `-D 127.0.0.1:<socks_port>` starts OpenSSH's SOCKS listener on the same
/// connection, so any later port forward rides this one authenticated session
/// (through every `-J` jump) instead of needing a second login. With
/// `ExitOnForwardFailure`, a listener that cannot bind ends the session with
/// OpenSSH's own error rather than leaving a session that can never forward.
pub fn ssh_arguments(route: &SshTransportRoute, interactive: bool, socks_port: u16) -> Vec<String> {
    let mut args = vec![
        "-tt".to_string(),
        "-o".to_string(),
        "ServerAliveInterval=30".to_string(),
        "-o".to_string(),
        "ServerAliveCountMax=3".to_string(),
        "-o".to_string(),
        "ExitOnForwardFailure=yes".to_string(),
        "-D".to_string(),
        format!("127.0.0.1:{socks_port}"),
    ];
    if !interactive {
        args.extend(["-o".to_string(), "BatchMode=yes".to_string()]);
    }
    if route.port != 22 {
        args.extend(["-p".to_string(), route.port.to_string()]);
    }
    if !route.identity_file.trim().is_empty() {
        args.extend(["-i".to_string(), route.identity_file.clone()]);
    }
    if !route.jump_hosts.is_empty() {
        args.extend(["-J".to_string(), route.jump_hosts.join(",")]);
    }
    let destination = if !route.profile.trim().is_empty() {
        route.profile.clone()
    } else if !route.user.trim().is_empty() {
        format!("{}@{}", route.user, route.host)
    } else {
        route.host.clone()
    };
    args.push(destination);
    args
}

pub fn validate_command(command: &TransportCommand) -> Result<(), String> {
    if command.program.trim().is_empty() || command.program.contains('\0') {
        return Err("Command program is invalid".to_string());
    }
    if command.args.len() > 256 || command.args.iter().any(|arg| arg.contains('\0')) {
        return Err("Command arguments are invalid".to_string());
    }
    if !(0.1..=1800.0).contains(&command.timeout_seconds) {
        return Err("Command timeout is outside the supported range".to_string());
    }
    if command.scope != "target" {
        return Err("Desktop accepts only target-scoped CLIO operations".to_string());
    }
    Ok(())
}

fn posix_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub fn posix_command(command: &TransportCommand, begin: &str, end: &str) -> String {
    let invocation = std::iter::once(command.program.as_str())
        .chain(command.args.iter().map(String::as_str))
        .map(posix_quote)
        .collect::<Vec<_>>()
        .join(" ");
    let stdin = if command.stdin.is_empty() {
        String::new()
    } else {
        format!("printf %s {} | ", posix_quote(&command.stdin))
    };
    format!(
        "printf '\\n{begin}\\n'; {stdin}{invocation}; __clio_status=$?; printf '\\n{end}%s\\n' \"$__clio_status\"\n"
    )
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn powershell_command(command: &TransportCommand, begin: &str, end: &str) -> String {
    let invocation = std::iter::once(command.program.as_str())
        .chain(command.args.iter().map(String::as_str))
        .map(powershell_quote)
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "Write-Output '{begin}'; & {invocation}; $s=$LASTEXITCODE; Write-Output ('{end}' + $s)\r\n"
    )
}

pub fn safe_host(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | ':' | '-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route() -> SshTransportRoute {
        SshTransportRoute {
            profile: String::new(),
            host: "login.example.edu".to_string(),
            user: "alice".to_string(),
            port: 2202,
            jump_hosts: vec!["jump-a".to_string(), "jump-b".to_string()],
            identity_file: "/keys/id ed25519".to_string(),
            platform: "linux".to_string(),
        }
    }

    #[test]
    fn ssh_arguments_open_the_tunnel_on_the_session_through_jump_hosts() {
        assert_eq!(
            ssh_arguments(&route(), true, 50123),
            vec![
                "-tt",
                "-o",
                "ServerAliveInterval=30",
                "-o",
                "ServerAliveCountMax=3",
                "-o",
                "ExitOnForwardFailure=yes",
                "-D",
                "127.0.0.1:50123",
                "-p",
                "2202",
                "-i",
                "/keys/id ed25519",
                "-J",
                "jump-a,jump-b",
                "alice@login.example.edu",
            ]
        );
    }

    #[test]
    fn ssh_arguments_never_use_the_escape_command_line() {
        let arguments = ssh_arguments(&route(), true, 1).join(" ");
        assert!(!arguments.contains("EnableEscapeCommandline"));
        assert!(!arguments.contains("-L"));
        // The tunnel listener is loopback-only and precedes the destination.
        let mut saved = route();
        saved.profile = "ares-compute".to_string();
        saved.jump_hosts = vec!["ares".to_string()];
        let args = ssh_arguments(&saved, true, 40000);
        let socks = args.iter().position(|arg| arg == "-D").unwrap();
        assert_eq!(args[socks + 1], "127.0.0.1:40000");
        assert_eq!(args.last().unwrap(), "ares-compute");
        assert!(args.windows(2).any(|pair| pair == ["-J", "ares"]));
    }

    #[test]
    fn silent_recovery_disables_interactive_prompts() {
        let arguments = ssh_arguments(&route(), false, 1);
        assert!(arguments
            .windows(2)
            .any(|value| value == ["-o", "BatchMode=yes"]));
    }

    #[test]
    fn posix_wrapper_quotes_untrusted_arguments() {
        let command = TransportCommand {
            program: "docker".to_string(),
            args: vec!["inspect".to_string(), "a'; rm -rf /".to_string()],
            scope: "target".to_string(),
            timeout_seconds: 30.0,
            stdin: String::new(),
            allowed_exit_codes: vec![0, 1],
        };
        let rendered = posix_command(&command, "BEGIN", "END:");
        assert!(rendered.contains("'a'\\''; rm -rf /'"));
        assert!(rendered.contains("END:%s"));
    }

    #[test]
    fn compatible_routes_ignore_alias_but_not_jump_chain() {
        let mut first = route();
        first.profile = "utah".to_string();
        let mut second = first.clone();
        second.profile = "university".to_string();
        assert!(compatible_route(&first, &second));
        second.jump_hosts.reverse();
        assert!(!compatible_route(&first, &second));
    }

    #[test]
    fn powershell_wrapper_quotes_untrusted_arguments() {
        let command = TransportCommand {
            program: "docker".to_string(),
            args: vec![
                "inspect".to_string(),
                "a'; Remove-Item C:\\data".to_string(),
            ],
            scope: "target".to_string(),
            timeout_seconds: 30.0,
            stdin: String::new(),
            allowed_exit_codes: vec![0],
        };
        let rendered = powershell_command(&command, "BEGIN", "END:");
        assert!(rendered.contains("'a''; Remove-Item C:\\data'"));
        assert!(rendered.contains("Write-Output ('END:' + $s)"));
    }

    #[test]
    fn desktop_rejects_controller_scoped_commands() {
        let command = TransportCommand {
            program: "clio-relay".to_string(),
            args: Vec::new(),
            scope: "controller".to_string(),
            timeout_seconds: 30.0,
            stdin: String::new(),
            allowed_exit_codes: vec![0],
        };
        assert_eq!(
            validate_command(&command),
            Err("Desktop accepts only target-scoped CLIO operations".to_string())
        );
    }
}

/// Live check against a real jump-host route, run by hand:
/// `CLIO_LIVE_HOP_DEST=user@node CLIO_LIVE_HOP_JUMP=login CLIO_LIVE_HOP_KEY=path
///  cargo test live_hop -- --ignored --nocapture`.
/// Opens the exact OpenSSH command line the transport opens (PTY, `-D`, `-J`,
/// `-i`, the ready marker), then the same route with a key that does not
/// exist, which must end with OpenSSH's own reason as the one-line failure.
#[cfg(test)]
mod live {
    use super::*;
    use crate::ssh_transport_output::{clean_transport_log, last_meaningful_line};
    use crate::terminal_pty::spawn_command;
    use portable_pty::CommandBuilder;
    use std::io::Read;
    use std::time::{Duration, Instant};

    fn run(route: &SshTransportRoute) -> (bool, String) {
        let port = crate::ssh_transport_forward::free_loopback_port().unwrap();
        let mut command = CommandBuilder::new("ssh");
        for argument in ssh_arguments(route, false, port) {
            command.arg(argument);
        }
        command.arg("sh -lc \"stty -echo; printf '__CLIO_SSH_READY__\\n'; hostname; exit 0\"");
        let cwd = std::env::current_dir().unwrap();
        let mut spawned = spawn_command(&cwd, 100, 30, command).unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let mut reader = spawned.reader;
        std::thread::spawn(move || {
            let mut bytes = [0_u8; 4096];
            while let Ok(count) = reader.read(&mut bytes) {
                if count == 0 || sender.send(bytes[..count].to_vec()).is_err() {
                    break;
                }
            }
        });
        let mut output = String::new();
        let deadline = Instant::now() + Duration::from_secs(60);
        while Instant::now() < deadline {
            if let Ok(chunk) = receiver.recv_timeout(Duration::from_millis(200)) {
                output.push_str(&String::from_utf8_lossy(&chunk));
            }
            if let Ok(Some(_)) = spawned.child.try_wait() {
                while let Ok(chunk) = receiver.recv_timeout(Duration::from_millis(300)) {
                    output.push_str(&String::from_utf8_lossy(&chunk));
                }
                break;
            }
        }
        let _ = spawned.child.kill();
        (output.contains("__CLIO_SSH_READY__"), output)
    }

    #[test]
    #[ignore = "opens a real SSH connection; run by hand with CLIO_LIVE_HOP_*"]
    fn live_hop_through_jump_host() {
        let dest = std::env::var("CLIO_LIVE_HOP_DEST").expect("CLIO_LIVE_HOP_DEST");
        let (user, host) = dest.split_once('@').expect("user@host");
        let route = SshTransportRoute {
            profile: String::new(),
            host: host.to_string(),
            user: user.to_string(),
            port: 22,
            jump_hosts: vec![std::env::var("CLIO_LIVE_HOP_JUMP").expect("CLIO_LIVE_HOP_JUMP")],
            identity_file: std::env::var("CLIO_LIVE_HOP_KEY").expect("CLIO_LIVE_HOP_KEY"),
            platform: "linux".to_string(),
        };
        let (ready, output) = run(&route);
        println!("--- with key ---\n{}", clean_transport_log(&output));
        assert!(ready, "the route did not reach the remote shell");
        assert!(clean_transport_log(&output).contains(host));

        let unkeyed = SshTransportRoute {
            identity_file: "C:/nonexistent/clio-no-such-key".to_string(),
            ..route
        };
        let (ready, output) = run(&unkeyed);
        let reason = last_meaningful_line(&output);
        println!(
            "--- without the key ---\nreason: {reason:?}\n{}",
            clean_transport_log(&output)
        );
        assert!(!ready);
        assert!(reason.is_some());
    }
}

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

/// The remote shell every transport command runs in.
///
/// Loopback is added to `no_proxy`/`NO_PROXY` first: cluster nodes often set
/// `http_proxy` for the whole login environment, and then a health check of
/// `http://127.0.0.1:<port>` goes to the site proxy, which answers for a
/// server that is not running (a Slurm compute node's squid replied 503, which
/// CLIO's launcher counts as "already running"). A check of this node must
/// reach this node. The same environment reaches every command and the
/// servers it starts.
pub fn remote_shell_command(platform: &str, ready_marker: &str) -> String {
    if platform == "windows" {
        format!(
            "powershell -NoLogo -NoProfile -Command \"$env:NO_PROXY = '127.0.0.1,localhost,::1,' + $env:NO_PROXY; Write-Output '{ready_marker}'; while (($line = [Console]::In.ReadLine()) -ne $null) {{ Invoke-Expression $line }}\""
        )
    } else {
        // An exec'd "sh -s" sees the SSH PTY and starts interactively on macOS,
        // where readline changes the terminal discipline after our stty setup.
        // Give the interpreter pipe input so it stays noninteractive on every
        // POSIX shell, without relying on sourcing the platform's /dev/stdin.
        // cat leaves the SSH terminal's bounded canonical input unchanged.
        format!(
            r#"sh -lc "stty -echo; no_proxy=127.0.0.1,localhost,::1,\$no_proxy; NO_PROXY=127.0.0.1,localhost,::1,\$NO_PROXY; export no_proxy NO_PROXY; printf '{ready_marker}\\n'; cat | sh -s""#
        )
    }
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
    // The SSH PTY may keep canonical input enabled. Bound physical lines,
    // including escaped quotes, without changing the argument's bytes.
    let mut quoted = String::from("'");
    for (index, character) in value.chars().enumerate() {
        // POSIX only guarantees 255 bytes in a canonical line. A character or
        // escaped apostrophe costs at most four bytes; leave room for framing.
        if index > 0 && index % 32 == 0 {
            quoted.push_str("'\\\n'");
        }
        if character == '\'' {
            quoted.push_str("'\\''");
        } else {
            quoted.push(character);
        }
    }
    quoted.push('\'');
    quoted
}

/// Feed stdin in bounded writes: manifests must not become one oversized PTY line
/// or one oversized argv entry to an external printf implementation.
fn posix_stdin(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    let mut script = String::from("{\n");
    let mut start = 0;
    for (offset, _) in value.char_indices() {
        if offset - start >= 128 {
            script.push_str(&format!(
                "printf %s {}\n",
                posix_quote(&value[start..offset])
            ));
            start = offset;
        }
    }
    script.push_str(&format!(
        "printf %s {}\n}} | ",
        posix_quote(&value[start..])
    ));
    script
}

pub fn posix_command(command: &TransportCommand, begin: &str, end: &str) -> String {
    let invocation = std::iter::once(command.program.as_str())
        .chain(command.args.iter().map(String::as_str))
        .map(posix_quote)
        .collect::<Vec<_>>()
        .join(" \\\n");
    let stdin = posix_stdin(&command.stdin);
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
    fn the_remote_shell_never_sends_loopback_checks_to_a_site_proxy() {
        let posix = remote_shell_command("linux", "READY");
        assert!(posix.starts_with("sh -lc \""));
        assert!(posix.contains("no_proxy=127.0.0.1,localhost,::1,\\$no_proxy"));
        assert!(posix.contains("NO_PROXY=127.0.0.1,localhost,::1,\\$NO_PROXY"));
        assert!(posix.contains("export no_proxy NO_PROXY"));
        assert!(posix.find("NO_PROXY").unwrap() < posix.find("READY").unwrap());
        assert!(posix.contains(r#"printf 'READY\\n'"#));
        assert!(posix.ends_with(r#"; cat | sh -s""#));
        assert!(!posix.contains(". /dev/stdin"));
        assert!(!posix.contains("exec sh -s"));
        let windows = remote_shell_command("windows", "READY");
        assert!(windows.contains("$env:NO_PROXY = '127.0.0.1,localhost,::1,'"));
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
    fn posix_wrapper_bounds_large_utf8_arguments_and_stdin_lines() {
        let command = TransportCommand {
            program: "python3".into(),
            args: vec!["-c".into(), "# long controller source\n".repeat(1000)],
            scope: "target".into(),
            timeout_seconds: 30.0,
            stdin: "é𐍈'\"$()`\\\n".repeat(30_000),
            allowed_exit_codes: vec![0],
        };
        let rendered = posix_command(&command, "BEGIN", "END:");
        assert!(rendered.lines().all(|line| line.len() < 255));
        assert!(rendered.matches("printf %s ").count() > 100);
    }

    #[cfg(unix)]
    #[test]
    fn large_input_round_trips_through_a_real_canonical_pty() {
        use portable_pty::CommandBuilder;
        use sha2::{Digest, Sha256};
        use std::io::{Read, Write};
        use std::time::{Duration, Instant};

        // Keep canonical mode enabled, exactly as the production SSH shell does.
        // A single large line used to be silently truncated before sh could parse it.
        let payload = "é𐍈'\"$()`\\\n".repeat(30_000);
        let argument = "literal-'$()𐍈".repeat(1000);
        let mut hash = Sha256::new();
        hash.update(payload.as_bytes());
        hash.update(argument.as_bytes());
        let expected = hex::encode(hash.finalize());
        let command = TransportCommand {
            program: "python3".into(),
            args: vec!["-c".into(), "import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()+sys.argv[1].encode()).hexdigest())".into(), argument],
            scope: "target".into(),
            timeout_seconds: 30.0,
            stdin: payload,
            allowed_exit_codes: vec![0],
        };
        let mut shell = CommandBuilder::new("sh");
        shell.arg("-c");
        shell.arg(remote_shell_command("linux", "__READY__"));
        let mut spawned =
            crate::terminal_pty::spawn_command(&std::env::current_dir().unwrap(), 100, 30, shell)
                .unwrap();
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
        let deadline = Instant::now() + Duration::from_secs(30);
        let mut sent = false;
        while Instant::now() < deadline {
            if let Ok(chunk) = receiver.recv_timeout(Duration::from_millis(50)) {
                output.push_str(&String::from_utf8_lossy(&chunk));
            }
            if !sent && output.contains("__READY__") {
                if let Err(error) = spawned
                    .writer
                    .write_all(posix_command(&command, "BEGIN", "END:").as_bytes())
                {
                    let _ = spawned.child.kill();
                    let _ = spawned.child.wait();
                    panic!("real PTY input failed: {error}; shell output: {output}");
                }
                sent = true;
            }
            if output.contains("END:0") {
                break;
            }
        }
        let _ = spawned.child.kill();
        let _ = spawned.child.wait();
        assert!(sent, "real PTY shell never became ready");
        assert!(
            output.contains(&expected),
            "argument/stdin bytes did not survive the PTY; output tail: {}",
            output
                .chars()
                .rev()
                .take(4000)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        );
        assert!(
            output.contains("END:0"),
            "command did not complete successfully; output tail: {}",
            output
                .chars()
                .rev()
                .take(4000)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        );
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
            program: "controller-agent".to_string(),
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

    /// The remote shell the transport opens keeps loopback away from a site
    /// proxy: `CLIO_LIVE_HOP_JUMP=login cargo test live_remote_shell -- --ignored`.
    #[test]
    #[ignore = "opens a real SSH connection; run by hand with CLIO_LIVE_HOP_JUMP"]
    fn live_remote_shell_excludes_loopback_from_the_proxy() {
        use std::io::Write;
        let host = std::env::var("CLIO_LIVE_HOP_JUMP").expect("CLIO_LIVE_HOP_JUMP");
        let route = SshTransportRoute {
            profile: host,
            host: String::new(),
            user: String::new(),
            port: 22,
            jump_hosts: Vec::new(),
            identity_file: String::new(),
            platform: "linux".to_string(),
        };
        let port = crate::ssh_transport_forward::free_loopback_port().unwrap();
        let mut command = CommandBuilder::new("ssh");
        for argument in ssh_arguments(&route, false, port) {
            command.arg(argument);
        }
        command.arg(remote_shell_command("linux", "__CLIO_SSH_READY__"));
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
        let deadline = Instant::now() + Duration::from_secs(40);
        let mut sent = false;
        while Instant::now() < deadline {
            if let Ok(chunk) = receiver.recv_timeout(Duration::from_millis(200)) {
                output.push_str(&String::from_utf8_lossy(&chunk));
            }
            if !sent && output.contains("__CLIO_SSH_READY__") {
                spawned
                    .writer
                    .write_all(b"printf 'NP=[%s]\\n' \"$no_proxy\"; exit\n")
                    .unwrap();
                sent = true;
            }
            if output.contains("NP=[") && output.contains("]\r") {
                break;
            }
        }
        let _ = spawned.child.kill();
        let cleaned = clean_transport_log(&output);
        println!("{cleaned}");
        let line = cleaned
            .lines()
            .find_map(|line| line.split_once("NP=[").map(|(_, value)| value))
            .expect("no_proxy line");
        assert!(line.starts_with("127.0.0.1,localhost,::1,"), "{line}");
    }
}

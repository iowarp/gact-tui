//! Live pty tests for the embedded workspace terminal. These spawn a real
//! shell (or a real sleeping child) rather than mocking `portable_pty` — the
//! whole point is proving the ConPTY/native-pty bridge and the process
//! teardown actually work, the same reasoning `ssh_tests.rs` gives for
//! spawning a real `ssh` child instead of mocking it.

use super::*;
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// Whether a PID still refers to a live process — same technique
/// `supervisor_state.rs`'s test module uses (`tasklist` on Windows,
/// `kill(pid, 0)` on Unix).
fn pid_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        use std::process::Command;
        let out = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .expect("run tasklist");
        String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
    }
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
}

/// A `CommandBuilder` for a child that just sits there until killed, so
/// shutdown tests have something to reap instead of racing a fast-exiting
/// process.
fn sleeper_command() -> CommandBuilder {
    #[cfg(windows)]
    {
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/C", "ping -n 300 127.0.0.1 >NUL"]);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "sleep 300"]);
        cmd
    }
}

/// Writes an `echo <marker>` line into the pty of a REAL default shell
/// (`spawn_shell`, the same shell-candidate resolution `terminal_open`
/// uses) and reads the marker back out — proving `write` reaches the
/// child's stdin and the child's stdout comes back out the reader, through
/// a real ConPTY/native pty round trip. A one-shot child that never reads
/// stdin (like a bare `sleep`) cannot be used here: unlike a POSIX tty's
/// kernel line discipline, Windows' console only echoes input as whatever
/// is actively reading it (the shell's line editor) consumes it.
#[test]
fn pty_open_write_read_roundtrip() {
    let cwd = std::env::temp_dir();
    let spawned = spawn_shell(&cwd, 80, 24, None).expect("spawn default shell");
    let SpawnedPty {
        mut writer,
        reader,
        mut child,
        ..
    } = spawned;

    let marker = "CLIO_PTY_ROUNDTRIP_MARKER";
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        let mut collected = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    collected.extend_from_slice(&buf[..n]);
                    if String::from_utf8_lossy(&collected).contains(marker) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = tx.send(String::from_utf8_lossy(&collected).into_owned());
    });

    writer
        .write_all(format!("echo {marker}\r\n").as_bytes())
        .expect("write command line");
    writer.flush().expect("flush command line");

    let observed = rx.recv_timeout(Duration::from_secs(10)).unwrap_or_default();
    let _ = child.kill();
    let _ = child.wait();

    assert!(
        observed.contains(marker),
        "expected the pty to echo back the written marker, got: {observed:?}"
    );
}

#[test]
fn resize_updates_size() {
    let registry = TerminalRegistry::new();
    let cwd = std::env::temp_dir();
    let spawned = spawn_command(&cwd, 80, 24, sleeper_command()).expect("spawn pty");
    let (id, _stop) = registry.register(spawned.writer, spawned.master, spawned.child);

    registry.resize(id, 120, 40).expect("resize");

    let (cols, rows) = registry.size(id).expect("read size back");
    assert_eq!((cols, rows), (120, 40));

    registry.close(id);
}

#[test]
fn registry_shutdown_kills_children() {
    let registry = TerminalRegistry::new();
    let cwd = std::env::temp_dir();
    let spawned = spawn_command(&cwd, 80, 24, sleeper_command()).expect("spawn pty");
    let (id, _stop) = registry.register(spawned.writer, spawned.master, spawned.child);
    let pid = registry.pid(id).expect("spawned child has a pid");
    assert!(pid_alive(pid), "child should be alive right after spawn");

    registry.shutdown_all();

    let deadline = Instant::now() + Duration::from_secs(10);
    let mut gone = false;
    while Instant::now() < deadline {
        if !pid_alive(pid) {
            gone = true;
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    assert!(gone, "pid {pid} still alive after shutdown_all");
}

/// Rejects the same class of `cwd` `open_workspace_terminal` would reject —
/// the embedded terminal's `terminal_open` command validates `cwd` through
/// this exact same helper (`workspace_terminal::resolve_workspace_dir`)
/// before ever touching `portable_pty`, so a path outside what the desktop
/// already knows about (today: "canonicalizes to an existing directory")
/// can never reach a pty spawn.
#[test]
fn rejects_cwd_outside_workspace() {
    let bogus = std::env::temp_dir().join("clio-terminal-does-not-exist-3f9c1a");
    let result = crate::workspace_terminal::resolve_workspace_dir(bogus.to_str().unwrap());
    assert!(result.is_err(), "a nonexistent cwd must be rejected");
}

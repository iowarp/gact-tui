//! Live pty tests for the embedded workspace terminal. These spawn a real
//! shell (or a real sleeping/forking child) rather than mocking
//! `portable_pty` — the whole point is proving the ConPTY/native-pty bridge
//! and the process teardown actually work, the same reasoning
//! `ssh_tests.rs` gives for spawning a real `ssh` child instead of mocking
//! it.

use super::*;
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// Whether a PID still refers to a live process — same technique
/// `supervisor_state.rs`'s test module uses (`tasklist` on Windows,
/// `kill(pid, 0)` on Unix). Cross-platform (unlike the production
/// `pid_alive` in this module, which is Unix-only), and shadows it inside
/// this test module.
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
/// resize/shutdown tests have something to reap instead of racing a
/// fast-exiting process.
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

/// A `CommandBuilder` whose child spawns a genuine, CONSOLE-ATTACHED
/// grandchild that sleeps for 30s — a normal child process (not a detached
/// one, which would sidestep the ConPTY-attached-process-tree teardown
/// this test exists to prove), so it is reachable by walking the OS
/// process tree from the outer tracked pid (see [`discover_child_pid`]).
/// Unix: `sleep 30 &` inside a subshell forces a real `fork`, so `sleep`
/// is a genuine child of `sh` even if the shell would otherwise exec-
/// replace itself for a single trailing command. Windows: `ping` invoked
/// directly from a `-Command` script is a normal (non-detached) child of
/// `powershell.exe`.
fn grandchild_command() -> CommandBuilder {
    #[cfg(windows)]
    {
        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.args(["-NoLogo", "-NoProfile", "-Command", "ping -n 30 127.0.0.1"]);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "sleep 30 & wait"]);
        cmd
    }
}

/// Finds a direct child of `parent_pid` by walking the OS process table —
/// `pgrep -P` on Unix, a CIM/WMI parent-pid filter on Windows (the same
/// class of query `supervisor_shutdown.rs` uses its own snapshot-walking
/// for, done here via an external command instead since this is test-only
/// code with no need to share that production machinery).
fn discover_child_pid(parent_pid: u32) -> Option<u32> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("powershell.exe")
            .args([
                "-NoLogo",
                "-NoProfile",
                "-Command",
                &format!(
                    "(Get-CimInstance Win32_Process -Filter \"ParentProcessId={parent_pid}\").ProcessId"
                ),
            ])
            .output()
            .ok()?;
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| line.trim().parse().ok())
    }
    #[cfg(unix)]
    {
        let output = std::process::Command::new("pgrep")
            .args(["-P", &parent_pid.to_string()])
            .output()
            .ok()?;
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| line.trim().parse().ok())
    }
}

/// A `CommandBuilder` for a child that prints something and exits
/// immediately — used to prove exit detection does not depend on the pty
/// pipe closing (which, on Windows ConPTY, it never does on its own).
fn immediate_exit_command() -> CommandBuilder {
    #[cfg(windows)]
    {
        let mut cmd = CommandBuilder::new("cmd.exe");
        cmd.args(["/C", "echo hi"]);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", "echo hi"]);
        cmd
    }
}

/// A pty's line discipline echoes bytes written to it back out on the read
/// side by itself (this is how a real terminal shows you what you typed) —
/// true independent of whatever child is attached, on both ConPTY and a
/// native Unix pty. That makes it a deterministic way to prove `write` (and
/// the read/emit loop) actually round-trip through a REAL pty without
/// depending on a specific shell's prompt or startup banner.
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
    registry
        .register(
            "resize-test".to_string(),
            spawned.writer,
            spawned.master,
            spawned.child,
        )
        .expect("register");

    registry.resize("resize-test", 120, 40).expect("resize");

    let (cols, rows) = registry.size("resize-test").expect("read size back");
    assert_eq!((cols, rows), (120, 40));

    registry.close("resize-test");
}

#[test]
fn registry_shutdown_kills_children_and_their_descendants() {
    let registry = TerminalRegistry::new();
    let cwd = std::env::temp_dir();

    let spawned = spawn_command(&cwd, 80, 24, grandchild_command()).expect("spawn pty");
    registry
        .register(
            "shutdown-test".to_string(),
            spawned.writer,
            spawned.master,
            spawned.child,
        )
        .expect("register");
    let pid = registry.pid("shutdown-test").expect("spawned child has a pid");
    assert!(pid_alive(pid), "outer child should be alive right after spawn");

    // Wait for the grandchild to appear in the process table.
    let discover_deadline = Instant::now() + Duration::from_secs(10);
    let mut grandchild_pid = None;
    while Instant::now() < discover_deadline {
        if let Some(found) = discover_child_pid(pid) {
            grandchild_pid = Some(found);
            break;
        }
        thread::sleep(Duration::from_millis(200));
    }
    let grandchild_pid = grandchild_pid.expect("grandchild never appeared in the process table");
    assert!(
        pid_alive(grandchild_pid),
        "grandchild pid {grandchild_pid} should be alive before shutdown"
    );

    registry.shutdown_all();

    let reap_deadline = Instant::now() + Duration::from_secs(10);
    let mut outer_gone = false;
    let mut grandchild_gone = false;
    while Instant::now() < reap_deadline && !(outer_gone && grandchild_gone) {
        outer_gone = !pid_alive(pid);
        grandchild_gone = !pid_alive(grandchild_pid);
        if !(outer_gone && grandchild_gone) {
            thread::sleep(Duration::from_millis(100));
        }
    }

    assert!(outer_gone, "outer pid {pid} still alive after shutdown_all");
    assert!(
        grandchild_gone,
        "grandchild pid {grandchild_pid} still alive after shutdown_all"
    );
}

/// The core fix for #2: exit detection must come from `child.wait()` (the
/// real process), never from the pty pipe closing. On Windows, ConPTY keeps
/// its output pipe open until the master is explicitly closed, so a reader
/// relying on EOF would hang forever even for a child that exited
/// instantly — this test never even creates a reader for `spawned.reader`
/// (drops it unread) to prove `wait_for_exit` alone, driven purely by
/// `child.wait()`, still detects the exit within a few seconds.
#[test]
fn waiter_detects_a_shell_that_exits_on_its_own_within_a_few_seconds() {
    let cwd = std::env::temp_dir();
    let spawned = spawn_command(&cwd, 80, 24, immediate_exit_command()).expect("spawn pty");
    let SpawnedPty {
        master,
        writer,
        reader,
        child,
    } = spawned;
    drop(reader); // deliberately never read — see doc comment above.

    let registry = TerminalRegistry::new();
    let handle = registry
        .register("exit-test".to_string(), writer, master, child)
        .expect("register");

    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let code = wait_for_exit(&handle);
        let _ = tx.send(code);
    });

    let code = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("wait_for_exit must detect the shell exiting within a few seconds");
    assert_eq!(code, Some(0));
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

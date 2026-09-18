//! Shutdown: the final stage of the sidecar lifecycle.
//!
//! Reaps the launcher and its sidecar descendants as a process tree
//! (SIGTERM-then-SIGKILL grace, a live re-walk + `TerminateProcess` on
//! Windows) so spawned clio-agent processes don't leak when the app exits or
//! restarts.

use std::{
    collections::{HashMap, HashSet, VecDeque},
    process::Child,
    thread,
    time::{Duration, Instant},
};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE},
    },
};

use crate::supervisor_types::BackendHandle;

/// Grace period between SIGTERM (or graceful kill on Windows) and SIGKILL.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
/// A graceful GACT shutdown drains current work and emits progress through its
/// normal logs. Only a server that stops making progress for this whole window
/// reaches the process-tree fallback.
const GRACEFUL_SHUTDOWN_STALL: Duration = Duration::from_secs(30);

/// A single process observed in a process-tree snapshot: just enough
/// parent/child linkage plus the executable name to walk descendants and
/// spare `clio_run.exe`.
///
/// Platform-independent and pure so [`owned_descendants`] is testable with a
/// synthetic snapshot on any target, without touching a real process tree.
/// Only the Windows kill path constructs these outside tests today — see
/// `menu.rs` for the same `cfg_attr` idiom used for the same reason.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ProcessEntry {
    pub name: String,
    pub parent_pid: u32,
    pub pid: u32,
}

/// Walk `snapshot` breadth-first from `roots`, collecting every reachable
/// descendant PID except `clio_run.exe` and anything beneath it.
///
/// `clio_run.exe` is the host-global clio-core runtime daemon: it can appear
/// beneath our launcher in the process tree even though independent CLIO
/// clients also own it, so it (and its subtree) is always spared here —
/// callers decide separately whether it should die via last-client release.
///
/// Pure: takes the snapshot as data rather than capturing it itself, so
/// tests can feed a synthetic tree instead of a real one.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn owned_descendants(snapshot: &[ProcessEntry], roots: &[u32]) -> Vec<u32> {
    let mut by_parent: HashMap<u32, Vec<&ProcessEntry>> = HashMap::new();
    for process in snapshot {
        by_parent
            .entry(process.parent_pid)
            .or_default()
            .push(process);
    }
    let mut queue: VecDeque<u32> = roots.iter().copied().collect();
    let mut visited: HashSet<u32> = roots.iter().copied().collect();
    let mut descendants = Vec::new();
    while let Some(parent) = queue.pop_front() {
        for process in by_parent.get(&parent).into_iter().flatten() {
            if process.name.eq_ignore_ascii_case("clio_run.exe") || !visited.insert(process.pid) {
                continue;
            }
            descendants.push(process.pid);
            queue.push_back(process.pid);
        }
    }
    descendants
}

/// Ask an owned GACT server to unwind gracefully before forcing its process
/// tree down.
///
/// A normal interpreter exit runs the shared clio-core last-client cleanup;
/// force-killing the agent skips that hook and leaks the detached daemon.
///
/// Takes the endpoint pieces directly (not a [`BackendHandle`]) so it is
/// testable against a local stub listener without constructing one.
fn request_graceful_shutdown(base_url: &str, bearer_token: &str) -> bool {
    if base_url.is_empty() || bearer_token.is_empty() {
        return false;
    }
    let endpoint = format!("{}/v1/desktop/shutdown", base_url.trim_end_matches('/'));
    let authorization = format!("Bearer {bearer_token}");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(2))
        .timeout_read(Duration::from_secs(2))
        .build();
    match agent
        .post(&endpoint)
        .set("Authorization", &authorization)
        .call()
    {
        Ok(response) => matches!(response.status(), 200 | 202),
        Err(_) => false,
    }
}

/// Best-effort reap of the launcher and any sidecar descendants.
///
/// The launcher can spawn the real `clio-agent-gact` process underneath it.
/// Reaping just the direct child leaks that grandchild on some platforms, so
/// shutdown targets the process tree/group before waiting for the launcher.
pub(crate) fn reap_owned_child_tree(mut child: Child, handle: &BackendHandle) {
    reap_child_tree_with_shutdown(&mut child, Some(handle));
}

fn reap_child_tree_with_shutdown(child: &mut Child, handle: Option<&BackendHandle>) {
    let graceful_requested =
        handle.is_some_and(|h| request_graceful_shutdown(&h.url, &h.bearer_token));

    if graceful_requested {
        let deadline = Instant::now() + GRACEFUL_SHUTDOWN_STALL;
        loop {
            let launcher_exited = matches!(child.try_wait(), Ok(Some(_)));
            if launcher_exited {
                // R1: re-walk the tree fresh from the launcher's PID instead
                // of trusting a snapshot taken before this wait — the open
                // `Child` handle keeps that PID unreusable for the lifetime
                // of this function, and orphaned grandchildren still carry
                // it as `parent_pid` even after the launcher itself exits,
                // so this stays correct with zero stale-PID risk.
                #[cfg(windows)]
                {
                    if windows_owned_descendants_now(child.id()).is_empty() {
                        return;
                    }
                }
                // R2: the old code returned here without ever signaling the
                // process group, so a graceful shutdown that let the
                // launcher exit on its own could leak detached stdio MCP
                // children left behind in that group. Always signal it — a
                // no-op once it's already empty — before returning.
                #[cfg(unix)]
                {
                    terminate_process_group(child.id(), libc::SIGTERM);
                    return;
                }
                #[cfg(not(any(windows, unix)))]
                return;
            }
            if Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    // Windows: force only this desktop's launcher/backend descendants, via a
    // fresh live re-walk (see the R1 note above — never the pre-drain
    // snapshot). The host-global clio_run daemon can appear beneath the
    // backend in the process tree even though independent CLIO clients also
    // own it; `owned_descendants` already spares its subtree so this cannot
    // corrupt those clients. Preserve it and let the backend's runtime-client
    // release decide whether the shared daemon is last-one-out.
    #[cfg(windows)]
    {
        let mut targets = windows_owned_descendants_now(child.id());
        targets.sort_unstable();
        targets.dedup();
        for pid in targets.into_iter().rev() {
            windows_terminate(pid);
        }
        let _ = child.kill();
    }
    // Unix: spawn_and_probe places the launcher and its descendants into a
    // dedicated process group. Kill that group so workers cannot outlive the
    // Tauri shell.
    #[cfg(unix)]
    terminate_process_group(child.id(), libc::SIGTERM);

    #[cfg(not(any(windows, unix)))]
    let _ = child.kill();

    let deadline = Instant::now() + SHUTDOWN_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                #[cfg(unix)]
                terminate_process_group(child.id(), libc::SIGKILL);
                break;
            }
            Ok(None) if Instant::now() >= deadline => {
                #[cfg(unix)]
                terminate_process_group(child.id(), libc::SIGKILL);
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
}

#[cfg(windows)]
fn windows_process_snapshot() -> Vec<ProcessEntry> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Vec::new();
    }
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..unsafe { std::mem::zeroed() }
    };
    let mut processes = Vec::new();
    let mut more = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while more {
        let name_len = entry
            .szExeFile
            .iter()
            .position(|character| *character == 0)
            .unwrap_or(entry.szExeFile.len());
        processes.push(ProcessEntry {
            name: String::from_utf16_lossy(&entry.szExeFile[..name_len]),
            parent_pid: entry.th32ParentProcessID,
            pid: entry.th32ProcessID,
        });
        more = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe {
        CloseHandle(snapshot);
    }
    processes
}

/// Fresh, live descendants of `launcher_pid` — see the R1 note in
/// [`reap_child_tree_with_shutdown`] for why this is always re-walked rather
/// than reusing any earlier snapshot.
#[cfg(windows)]
fn windows_owned_descendants_now(launcher_pid: u32) -> Vec<u32> {
    owned_descendants(&windows_process_snapshot(), &[launcher_pid])
}

#[cfg(windows)]
fn windows_terminate(pid: u32) {
    let process = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
    if process.is_null() {
        return;
    }
    unsafe {
        TerminateProcess(process, 1);
        CloseHandle(process);
    }
}

#[cfg(unix)]
fn terminate_process_group(pid: u32, signal: libc::c_int) {
    let pgid = pid as libc::pid_t;
    // Negative pid targets the process group whose id equals `pid`.
    unsafe {
        let _ = libc::kill(-pgid, signal);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn entry(pid: u32, parent_pid: u32, name: &str) -> ProcessEntry {
        ProcessEntry {
            name: name.to_string(),
            parent_pid,
            pid,
        }
    }

    #[test]
    fn owned_descendants_skips_clio_run_and_visits_grandchildren() {
        let snapshot = vec![
            // clio_run.exe hangs off the launcher (pid 100) — it and its own
            // child must be spared entirely.
            entry(200, 100, "clio_run.exe"),
            entry(300, 200, "clio_run_child.exe"),
            // An ordinary sidecar descendant, two levels deep, must be
            // reached and included — proves the walk actually visits
            // grandchildren rather than stopping at direct children.
            entry(201, 100, "worker.exe"),
            entry(301, 201, "worker-child.exe"),
        ];

        let mut descendants = owned_descendants(&snapshot, &[100]);
        descendants.sort_unstable();

        assert_eq!(
            descendants,
            vec![201, 301],
            "clio_run.exe and everything beneath it must be spared, the ordinary \
             branch must be walked down to its grandchild"
        );
    }

    #[test]
    fn owned_descendants_ignores_pid_not_in_tree() {
        let snapshot = vec![
            entry(201, 100, "worker.exe"),
            // Its parent_pid (555) is not among the roots and is never
            // itself reached from them, so this must not appear as owned —
            // guards against treating an unrelated process tree as ours.
            entry(999, 555, "unrelated.exe"),
        ];

        let descendants = owned_descendants(&snapshot, &[100]);

        assert_eq!(descendants, vec![201]);
        assert!(
            !descendants.contains(&999),
            "a PID whose parent isn't reachable from our roots must not be treated as owned"
        );
    }

    #[test]
    fn owned_descendants_empty_snapshot_yields_no_descendants() {
        assert!(owned_descendants(&[], &[100]).is_empty());
    }

    /// Spawn a one-shot local HTTP stub that replies with `status_line` to
    /// its single connection, and return the base URL to reach it at.
    fn serve_once(status_line: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local stub listener");
        let addr = listener.local_addr().expect("local stub addr");
        thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 1024];
                // Drain (some of) the request so the client's write doesn't
                // block; we don't need to parse it for this stub.
                let _ = stream.read(&mut buf);
                let response = format!("{status_line}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });
        format!("http://{addr}")
    }

    #[test]
    fn graceful_shutdown_returns_true_on_202() {
        let base_url = serve_once("HTTP/1.1 202 Accepted");
        assert!(request_graceful_shutdown(&base_url, "test-token"));
    }

    #[test]
    fn graceful_shutdown_returns_true_on_200() {
        let base_url = serve_once("HTTP/1.1 200 OK");
        assert!(request_graceful_shutdown(&base_url, "test-token"));
    }

    #[test]
    fn graceful_shutdown_false_on_401() {
        let base_url = serve_once("HTTP/1.1 401 Unauthorized");
        assert!(!request_graceful_shutdown(&base_url, "test-token"));
    }

    #[test]
    fn graceful_shutdown_false_without_credentials() {
        // No network attempt at all when either piece is missing — this
        // must not hang or panic trying to reach an empty URL.
        assert!(!request_graceful_shutdown("", "test-token"));
        assert!(!request_graceful_shutdown("http://127.0.0.1:1", ""));
    }
}

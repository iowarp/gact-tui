//! Shutdown: the final stage of the sidecar lifecycle.
//!
//! Reaps the launcher and its sidecar descendants as a process tree
//! (SIGTERM-then-SIGKILL grace, `taskkill /T` on Windows) so spawned
//! clio-agent processes don't leak when the app exits or restarts.

use std::{
    process::Child,
    thread,
    time::{Duration, Instant},
};

#[cfg(windows)]
use std::collections::{HashMap, HashSet, VecDeque};

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

fn request_graceful_shutdown(handle: &BackendHandle) -> bool {
    if handle.url.is_empty() || handle.bearer_token.is_empty() {
        return false;
    }
    let endpoint = format!("{}/v1/desktop/shutdown", handle.url.trim_end_matches('/'));
    let authorization = format!("Bearer {}", handle.bearer_token);
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
/// Ask an owned GACT server to unwind before forcing its process tree down.
///
/// A normal interpreter exit runs the shared clio-core last-client cleanup;
/// force-killing the agent skips that hook and leaks the detached daemon.
pub(crate) fn reap_owned_child_tree(mut child: Child, handle: &BackendHandle) {
    reap_child_tree_with_shutdown(&mut child, Some(handle));
}

fn reap_child_tree_with_shutdown(child: &mut Child, handle: Option<&BackendHandle>) {
    #[cfg(windows)]
    let initial_descendants = windows_owned_descendants(&[child.id()]);

    if handle.is_some_and(request_graceful_shutdown) {
        let deadline = Instant::now() + GRACEFUL_SHUTDOWN_STALL;
        loop {
            let launcher_exited = matches!(child.try_wait(), Ok(Some(_)));
            #[cfg(windows)]
            if launcher_exited && windows_none_alive(&initial_descendants) {
                return;
            }
            #[cfg(not(windows))]
            if launcher_exited {
                return;
            }
            if Instant::now() >= deadline {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    // Windows: force only this desktop's launcher/backend descendants. The
    // host-global clio_run daemon can appear beneath the backend in the process
    // tree even though independent CLIO clients also own it. `taskkill /T`
    // therefore corrupts those clients. Preserve the clio_run subtree and let
    // the backend's runtime-client release decide whether the shared daemon is
    // last-one-out.
    #[cfg(windows)]
    {
        let mut roots = Vec::with_capacity(initial_descendants.len() + 1);
        roots.push(child.id());
        roots.extend(initial_descendants.iter().copied());
        let mut targets = initial_descendants;
        targets.extend(windows_owned_descendants(&roots));
        let live = windows_live_pids();
        targets.retain(|pid| live.contains(pid));
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
#[derive(Clone)]
struct WindowsProcess {
    name: String,
    parent_pid: u32,
    pid: u32,
}

#[cfg(windows)]
fn windows_process_snapshot() -> Vec<WindowsProcess> {
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
        processes.push(WindowsProcess {
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

#[cfg(windows)]
fn windows_live_pids() -> HashSet<u32> {
    windows_process_snapshot()
        .into_iter()
        .map(|process| process.pid)
        .collect()
}

#[cfg(windows)]
fn windows_none_alive(pids: &[u32]) -> bool {
    let live = windows_live_pids();
    pids.iter().all(|pid| !live.contains(pid))
}

#[cfg(windows)]
fn windows_owned_descendants(roots: &[u32]) -> Vec<u32> {
    let processes = windows_process_snapshot();
    let mut by_parent: HashMap<u32, Vec<&WindowsProcess>> = HashMap::new();
    for process in &processes {
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

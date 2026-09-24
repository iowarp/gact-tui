//! Shutdown: the final stage of the sidecar lifecycle.
//!
//! Reaps the launcher and its sidecar descendants as a process tree
//! (SIGTERM-then-SIGKILL grace, with a poll for the process GROUP to empty
//! out on Unix; a pinned-handle + live-re-walk union + `TerminateProcess` on
//! Windows) so spawned clio-agent processes don't leak when the app exits or
//! restarts.
//!
//! The PID-reuse defense here (pinning a held `OpenProcess` handle per
//! descendant, gating every kill on its creation time) is Windows-only.
//! Unix signals the whole process GROUP by id (`kill(-pgid, ...)`), which
//! has no equivalent per-PID identity-confusion hazard: a reused PID that
//! joined a DIFFERENT process group cannot receive a signal aimed at ours.

use std::{
    collections::{HashMap, HashSet, VecDeque},
    process::Child,
    thread,
    time::{Duration, Instant},
};

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE, STILL_ACTIVE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        Threading::{
            GetExitCodeProcess, GetProcessTimes, OpenProcess, TerminateProcess,
            PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
        },
    },
};

use crate::supervisor_types::BackendHandle;

/// Grace period between SIGTERM (or graceful kill on Windows) and SIGKILL.
const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);
/// A graceful GACT shutdown drains current work and emits progress through its
/// normal logs. Only a server that stops making progress for this whole window
/// reaches the process-tree fallback.
const GRACEFUL_SHUTDOWN_STALL: Duration = Duration::from_secs(30);
/// How long the Unix path polls for the process GROUP to empty out after
/// SIGTERM before escalating to SIGKILL. Longer than `SHUTDOWN_GRACE` (which
/// only waits for the launcher itself) because a worker trapping SIGTERM to
/// flush state needs a real chance to exit on its own.
#[cfg(unix)]
const UNIX_GROUP_EMPTY_TIMEOUT: Duration = Duration::from_secs(5);

/// SYNCHRONIZE (0x00100000): a standard Windows access right reused across
/// object types. windows-sys only exposes a generated constant for it under
/// `Storage::FileSystem` even though it is valid on a process handle too
/// (MSDN "Standard Access Rights") — defined locally rather than pulling in
/// an unrelated crate feature for one constant. `pub(crate)` so
/// `installer_runtime_stop` (the installer's own process-under-root sweep,
/// #I1) can wait on the handles it opens without redefining this constant a
/// second time.
#[cfg(windows)]
pub(crate) const SYNCHRONIZE: u32 = 0x0010_0000;

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
/// tests can feed a synthetic tree instead of a real one. A snapshot only
/// reflects processes alive AT THE MOMENT IT WAS TAKEN — a descendant whose
/// intermediate parent has since exited is unreachable from any LATER
/// snapshot, however "descendant" is defined structurally here. Callers that
/// need to survive a dying intermediate must walk a snapshot taken before it
/// exited (see the pre-drain snapshot + pinning in
/// `reap_child_tree_with_shutdown`).
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

/// A shutdown-time kill candidate together with the identity data needed to
/// decide whether it is safe to kill: its own creation time, gated against
/// the launcher's, so a PID that a `parent_pid` field merely appears to
/// match — because it was reused, or because Windows never invalidates a
/// dead process's stale `parent_pid` record — is never treated as ours.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct KillCandidate {
    pub pid: u32,
    pub created_at: u64,
}

/// Pure decision: which candidate PIDs are safe to kill.
///
/// `pinned` are descendants discovered by walking the PRE-DRAIN snapshot
/// (taken before the graceful wait, while everything — including any
/// intermediate that later exits — was still alive) and pinned with a held
/// `OpenProcess` handle for the whole wait; that handle blocks PID reuse for
/// exactly the PIDs we care about, which is the only way to still target a
/// grandchild whose intermediate parent has since exited. `live_walk` are
/// descendants found by re-walking a FRESH snapshot at kill time, which
/// catches anything spawned after the pre-drain snapshot but carries no
/// pin — a reused PID could slip in here.
///
/// Every candidate, pinned or not, is gated the same way: its own creation
/// time must be no earlier than `launcher_created_at`, since nothing in our
/// tree can have been created before the launcher itself started. This is
/// what catches BOTH a reused live-walk PID and a pre-existing orphan whose
/// stale `parent_pid` field happens to collide with the launcher's
/// (possibly also reused) PID — the latter can appear in `pinned` too, since
/// the pre-drain walk uses the same `parent_pid` matching.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn kill_candidates(
    pinned: &[KillCandidate],
    live_walk: &[KillCandidate],
    launcher_created_at: u64,
) -> Vec<u32> {
    let mut targets: Vec<u32> = Vec::new();
    for candidate in pinned.iter().chain(live_walk.iter()) {
        if candidate.created_at >= launcher_created_at && !targets.contains(&candidate.pid) {
            targets.push(candidate.pid);
        }
    }
    targets
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
    // Windows: capture the launcher's own creation time and pin the
    // PRE-DRAIN descendant topology — BEFORE the graceful wait, while
    // everything is still alive — for the whole rest of this call. See the
    // `kill_candidates` doc comment for why both pieces exist.
    //
    // Read off the ALREADY-HELD `Child` handle (never a fresh
    // OpenProcess-by-PID): `child` is the exact process object we spawned,
    // so there is no PID-reuse gap to guard against here, unlike every
    // other creation-time read in this module. `None` means the read
    // failed (see the Windows kill block below for how that degrades the
    // gate rather than silently disabling it).
    #[cfg(windows)]
    let launcher_created_at = windows_handle_created_at(child.as_raw_handle() as HANDLE);
    #[cfg(windows)]
    let pinned: Vec<PinnedProcess> = owned_descendants(&windows_process_snapshot(), &[child.id()])
        .into_iter()
        .filter_map(|pid| {
            windows_pin_process(
                pid,
                PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
            )
        })
        .collect();

    let graceful_requested =
        handle.is_some_and(|h| request_graceful_shutdown(&h.url, &h.bearer_token));

    if graceful_requested {
        let deadline = Instant::now() + GRACEFUL_SHUTDOWN_STALL;
        loop {
            let launcher_exited = matches!(child.try_wait(), Ok(Some(_)));
            if launcher_exited {
                // R1: identity-checked via the pinned handles + a fresh
                // live re-walk rather than trusting the pre-drain snapshot
                // alone — see `windows_everything_gone`.
                #[cfg(windows)]
                {
                    if windows_everything_gone(&pinned, child.id()) {
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

    // Windows: union the pinned pre-drain descendants (still alive, still
    // identity-verified by the held handle) with a fresh live re-walk (for
    // anything spawned since the pre-drain snapshot), then gate every kill
    // on creation time — see `kill_candidates`. `owned_descendants` already
    // spares the clio_run.exe subtree, so this cannot corrupt independent
    // CLIO clients sharing that host-global daemon.
    #[cfg(windows)]
    {
        let pinned_candidates: Vec<KillCandidate> = pinned
            .iter()
            .filter(|p| windows_handle_is_alive(p.handle))
            .map(|p| KillCandidate {
                pid: p.pid,
                created_at: p.created_at,
            })
            .collect();

        // `launcher_created_at` gates every candidate below — see
        // `kill_candidates`. When it could not be read, the live walk is
        // skipped entirely: a live-walk PID carries no identity pin of its
        // own, so without the creation-time gate there is nothing left to
        // tell a real descendant from a reused PID (silently defaulting the
        // gate to "always pass" would be exactly the silent-fallback bug
        // this module exists to avoid). The pinned set stays safe to kill
        // either way — each entry is terminated through the exact handle
        // captured at pre-drain pin time, never re-resolved by PID.
        let (targets, live_pinned): (Vec<u32>, Vec<PinnedProcess>) = match launcher_created_at {
            Some(created_at) => {
                // Opened ONCE per live-walk PID with TERMINATE +
                // QUERY_LIMITED_INFORMATION and held through the kill below,
                // so the creation-time read and the terminate act on the
                // SAME handle — never a second OpenProcess-by-PID, which
                // would reopen a fresh (and possibly PID-reused) process in
                // the gap between the read and the kill.
                let live_pinned: Vec<PinnedProcess> = windows_owned_descendants_now(child.id())
                    .into_iter()
                    .filter_map(|pid| {
                        windows_pin_process(
                            pid,
                            PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION,
                        )
                    })
                    .collect();
                let live_candidates: Vec<KillCandidate> = live_pinned
                    .iter()
                    .map(|p| KillCandidate {
                        pid: p.pid,
                        created_at: p.created_at,
                    })
                    .collect();
                let mut targets = kill_candidates(&pinned_candidates, &live_candidates, created_at);
                targets.sort_unstable();
                (targets, live_pinned)
            }
            None => {
                eprintln!(
                    "[supervisor_shutdown] could not read the launcher's own creation time; \
                     the creation-time gate is unavailable this shutdown — killing only the \
                     pre-drain pinned descendants (identity-verified via their held handles), \
                     the fresh live-walk set is skipped"
                );
                let mut targets: Vec<u32> = pinned_candidates.iter().map(|c| c.pid).collect();
                targets.sort_unstable();
                (targets, Vec::new())
            }
        };

        // Reverse-numeric order is a cheap best-effort bias toward killing
        // deeper descendants first (PIDs tend to increase with spawn order,
        // NOT a guaranteed topological/tree order — Windows recycles PIDs,
        // so this can be wrong). It only reduces, never eliminates,
        // transient "parent already gone" noise; every target is killed
        // regardless of order, so correctness never depends on it.
        for pid in targets.into_iter().rev() {
            // Terminate through the ALREADY-HELD handle — either the one
            // pinned at the top of this function or the one opened for the
            // live walk above — guaranteed to be the exact process object
            // identified, never a fresh OpenProcess-by-PID race against a
            // PID reused in the meantime.
            let handle = pinned
                .iter()
                .find(|p| p.pid == pid)
                .map(|p| p.handle)
                .or_else(|| live_pinned.iter().find(|p| p.pid == pid).map(|p| p.handle));
            match handle {
                Some(h) => unsafe {
                    TerminateProcess(h, 1);
                },
                None => windows_terminate(pid),
            }
        }
        let _ = child.kill();
        // `pinned` and `live_pinned`'s handles close here as they drop at
        // end of scope.
    }
    // Unix: spawn_and_probe places the launcher and its descendants into a
    // dedicated process group. SIGTERM the whole group, then poll for it to
    // actually empty out — `kill(-pgid, 0)` reports ESRCH once every member
    // has exited — for up to UNIX_GROUP_EMPTY_TIMEOUT before escalating to
    // SIGKILL. A worker trapping SIGTERM to flush state needs a real chance
    // to exit on its own; killing only the launcher's own PID would leave
    // the rest of the group behind.
    //
    // `child` (the launcher itself) must be reaped with `try_wait` as part
    // of this poll: an un-reaped launcher stays a zombie, and a zombie is
    // still a live process-group member as far as `kill(-pgid, 0)` is
    // concerned (it only reports ESRCH once EVERY member, zombies
    // included, is gone). Without this, a launcher that exits cleanly right
    // after SIGTERM would sit as a zombie for the rest of the poll, the
    // loop would never observe the group as empty, and every shutdown would
    // burn the full UNIX_GROUP_EMPTY_TIMEOUT and escalate to SIGKILL
    // regardless of whether the group actually needed it.
    #[cfg(unix)]
    {
        terminate_process_group(child.id(), libc::SIGTERM);
        let deadline = Instant::now() + UNIX_GROUP_EMPTY_TIMEOUT;
        loop {
            let _ = child.try_wait();
            if Instant::now() >= deadline || unix_process_group_is_empty(child.id()) {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let _ = child.try_wait();
        if !unix_process_group_is_empty(child.id()) {
            terminate_process_group(child.id(), libc::SIGKILL);
        }
    }

    #[cfg(not(any(windows, unix)))]
    let _ = child.kill();

    let deadline = Instant::now() + SHUTDOWN_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
}

/// A fresh snapshot of every process on the system (name + parent/own PID).
///
/// `pub(crate)`: shared with `installer_runtime_stop`, which walks this same
/// snapshot to find CLIO-managed processes living under the install root
/// before the installer swaps the runtime directory (#I1) — a second,
/// independent `CreateToolhelp32Snapshot` call would just re-walk the exact
/// same table this shutdown path already knows how to read.
#[cfg(windows)]
pub(crate) fn windows_process_snapshot() -> Vec<ProcessEntry> {
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

/// Fresh, live descendants of `launcher_pid` from a snapshot taken right
/// now. Cannot, by construction, reach a descendant whose intermediate
/// parent has already exited — see the `pinned` pre-drain walk in
/// `reap_child_tree_with_shutdown` for that case.
#[cfg(windows)]
fn windows_owned_descendants_now(launcher_pid: u32) -> Vec<u32> {
    owned_descendants(&windows_process_snapshot(), &[launcher_pid])
}

/// A held `OpenProcess` handle for a descendant discovered in the pre-drain
/// snapshot, plus its creation time captured at pin time (a process's
/// creation time never changes, so one read up front is enough). Holding
/// the handle for the struct's whole lifetime blocks Windows from reusing
/// this PID for an unrelated process while we still care about it.
#[cfg(windows)]
struct PinnedProcess {
    handle: HANDLE,
    pid: u32,
    created_at: u64,
}

#[cfg(windows)]
impl Drop for PinnedProcess {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.handle);
        }
    }
}

/// Open and pin `pid` for the caller's lifetime with the given access mask,
/// capturing its creation time. Returns `None` if the process is already
/// gone or access is denied — best-effort, matching the rest of this
/// module.
///
/// Callers pass exactly the access bits they need: the pre-drain walk holds
/// `SYNCHRONIZE` too (for a possible future wait), the live walk at kill
/// time only needs `TERMINATE | QUERY_LIMITED_INFORMATION` since it reads
/// the creation time and terminates through this same handle and nothing
/// else — see the Windows kill block in `reap_child_tree_with_shutdown`.
#[cfg(windows)]
fn windows_pin_process(pid: u32, access: u32) -> Option<PinnedProcess> {
    let handle = unsafe { OpenProcess(access, 0, pid) };
    if handle.is_null() {
        return None;
    }
    match windows_handle_created_at(handle) {
        Some(created_at) => Some(PinnedProcess {
            handle,
            pid,
            created_at,
        }),
        None => {
            unsafe {
                CloseHandle(handle);
            }
            None
        }
    }
}

#[cfg(windows)]
fn windows_handle_created_at(handle: HANDLE) -> Option<u64> {
    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit = creation;
    let mut kernel = creation;
    let mut user = creation;
    let ok = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
    if ok == 0 {
        return None;
    }
    Some(((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64)
}

/// Whether a pinned handle's process is still running, via
/// `GetExitCodeProcess` rather than re-snapshotting — precise and does not
/// need `SYNCHRONIZE`/`WaitForSingleObject`.
#[cfg(windows)]
fn windows_handle_is_alive(handle: HANDLE) -> bool {
    let mut exit_code: u32 = 0;
    let ok = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
    ok != 0 && exit_code == STILL_ACTIVE as u32
}

/// Everything we would need to kill is already gone: every pinned
/// descendant has exited AND a fresh live re-walk from `launcher_pid` finds
/// nothing new. Checked from the held handles directly (not a snapshot), so
/// it is precise for the set we pinned; the live re-walk exists only to
/// catch something spawned after the pre-drain snapshot.
#[cfg(windows)]
fn windows_everything_gone(pinned: &[PinnedProcess], launcher_pid: u32) -> bool {
    if pinned.iter().any(|p| windows_handle_is_alive(p.handle)) {
        return false;
    }
    windows_owned_descendants_now(launcher_pid).is_empty()
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

/// Whether the process group `pid` leads has no members left. `kill(pid, 0)`
/// sends no signal but still validates existence: ESRCH means nothing in
/// that group answers any more.
#[cfg(unix)]
fn unix_process_group_is_empty(pid: u32) -> bool {
    let pgid = pid as libc::pid_t;
    let result = unsafe { libc::kill(-pgid, 0) };
    result == -1 && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
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

    fn candidate(pid: u32, created_at: u64) -> KillCandidate {
        KillCandidate { pid, created_at }
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
    fn owned_descendants_spares_clio_run_when_it_is_a_grandchild() {
        // clio_run.exe is NOT a direct child of the launcher here — it hangs
        // off an ordinary intermediate (worker.exe) two levels down. It and
        // its own subtree must still be spared; the intermediate itself must
        // still be included.
        let snapshot = vec![
            entry(201, 100, "worker.exe"),
            entry(400, 201, "clio_run.exe"),
            entry(401, 400, "clio_run_child.exe"),
        ];

        let mut descendants = owned_descendants(&snapshot, &[100]);
        descendants.sort_unstable();

        assert_eq!(
            descendants,
            vec![201],
            "clio_run.exe and its subtree must be spared even several levels deep"
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

    #[test]
    fn kill_candidates_includes_pinned_orphaned_grandchild() {
        // 500 is what USED to be a direct child of the launcher (already
        // exited by kill time — not represented here, since `pinned` only
        // ever holds what the pre-drain walk found and we still hold a
        // handle for); 600 is ITS child, discovered via that same pre-drain
        // walk and still alive. A live-at-kill-time-only walk could never
        // find 600 (500 is gone), but the pinned pre-drain set still has it.
        let pinned = vec![candidate(500, 200), candidate(600, 210)];
        let live_walk: Vec<KillCandidate> = vec![];

        let mut targets = kill_candidates(&pinned, &live_walk, 100);
        targets.sort_unstable();

        assert_eq!(
            targets,
            vec![500, 600],
            "a pinned orphaned grandchild must still be targeted even though its \
             intermediate parent already exited"
        );
    }

    #[test]
    fn kill_candidates_excludes_a_stale_parent_pid_collision() {
        let pinned: Vec<KillCandidate> = vec![];
        let live_walk = vec![
            // Created BEFORE the launcher (100): a pre-existing orphan whose
            // stale parent_pid field happens to collide with the launcher's
            // (possibly reused) PID. Not actually ours.
            candidate(700, 50),
            // Created after the launcher: a legitimate descendant.
            candidate(701, 150),
        ];

        let targets = kill_candidates(&pinned, &live_walk, 100);

        assert_eq!(
            targets,
            vec![701],
            "a candidate created before the launcher must be spared — its parent_pid \
             match is a stale-PID collision, not a real descendant"
        );
    }

    #[test]
    fn kill_candidates_dedups_a_pid_present_in_both_sets() {
        let pinned = vec![candidate(500, 200)];
        let live_walk = vec![candidate(500, 200)];

        let targets = kill_candidates(&pinned, &live_walk, 100);

        assert_eq!(targets, vec![500]);
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
                let response =
                    format!("{status_line}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
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

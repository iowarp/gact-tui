//! Shared supervisor state threaded through the lifecycle.
//!
//! The `Arc<Mutex<_>>` holding the current backend handle/status and the
//! spawned child; reaps the prior child's process tree on replacement (racing
//! boots must not orphan the displaced launcher+clio tree) and recovers from
//! lock poisoning so one worker panic can't take the desktop down.

use std::{
    process::Child,
    sync::{Arc, Mutex, MutexGuard},
};

use crate::supervisor_boot_log::boot_log_line;
use crate::supervisor_shutdown::reap_child_tree;
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Lock a `Mutex` while recovering from poisoning.
///
/// If a thread panics while holding the lock the mutex becomes poisoned and a
/// plain `.lock().unwrap()` would re-panic in EVERY later caller — one panic
/// would take the whole desktop down. The state guarded by these mutexes is a
/// small handle/child record that stays structurally valid across a panic, so
/// recovering the inner guard (`into_inner`) is correct and keeps the app
/// alive.
pub(crate) fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Clone)]
pub struct SupervisorState {
    inner: Arc<Mutex<SupervisorInner>>,
}

struct SupervisorInner {
    handle: BackendHandle,
    child: Option<Child>,
}

impl SupervisorState {
    pub fn new_starting() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SupervisorInner {
                handle: BackendHandle {
                    url: String::new(),
                    bearer_token: String::new(),
                    status: BackendStatus::Starting,
                },
                child: None,
            })),
        }
    }

    pub fn snapshot(&self) -> BackendHandle {
        lock_recover(&self.inner).handle.clone()
    }

    pub fn set_error(&self, msg: String) {
        self.set_status(BackendStatus::Error(msg));
    }

    pub fn set_status(&self, status: BackendStatus) {
        lock_recover(&self.inner).handle.status = status;
    }

    pub fn set_handle(&self, handle: BackendHandle) {
        lock_recover(&self.inner).handle = handle;
    }

    /// Record the booted backend handle and its child, reaping any child the
    /// new one displaces.
    ///
    /// Racing boots (a `restart()` from an install/repair/update completion
    /// while an earlier boot is still inside `spawn_and_probe`) both land
    /// here; dropping the displaced `Child` would NOT kill it — the old
    /// launcher+clio tree would run unsupervised until app exit. The reap
    /// happens after the lock is released so `get_backend` polls aren't
    /// blocked for the kill's grace period.
    pub fn set_handle_and_child(&self, handle: BackendHandle, child: Child) {
        let displaced = {
            let mut guard = lock_recover(&self.inner);
            guard.handle = handle;
            guard.child.replace(child)
        };
        if let Some(stale) = displaced {
            boot_log_line(&format!(
                "warning: reaping displaced sidecar child (pid {}); reason=superseded_boot — \
                 a newer boot registered its child while this one was still recorded",
                stale.id()
            ));
            reap_child_tree(stale);
        }
    }

    pub fn shutdown(&self) {
        let mut guard = lock_recover(&self.inner);
        if let Some(child) = guard.child.take() {
            reap_child_tree(child);
        }
    }
}

impl Default for SupervisorState {
    fn default() -> Self {
        Self::new_starting()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_state_starts_with_empty_starting_handle() {
        let state = SupervisorState::new_starting();
        let handle = state.snapshot();
        assert!(handle.url.is_empty());
        assert!(handle.bearer_token.is_empty());
        assert!(matches!(handle.status, BackendStatus::Starting));
    }

    #[test]
    fn status_and_handle_updates_are_reflected_in_snapshot() {
        let state = SupervisorState::new_starting();
        state.set_error("boom".into());
        assert!(matches!(
            state.snapshot().status,
            BackendStatus::Error(ref detail) if detail == "boom"
        ));

        state.set_handle(BackendHandle {
            url: "http://127.0.0.1:17800".into(),
            bearer_token: "token".into(),
            status: BackendStatus::Ready,
        });
        let handle = state.snapshot();
        assert_eq!(handle.url, "http://127.0.0.1:17800");
        assert_eq!(handle.bearer_token, "token");
        assert!(matches!(handle.status, BackendStatus::Ready));
    }

    /// Spawn a quiet long-running child the test can use as a stand-in for
    /// the launcher process.
    fn spawn_sleeper() -> Child {
        use std::process::{Command, Stdio};
        #[cfg(windows)]
        let mut cmd = {
            let mut c = Command::new("cmd");
            c.args(["/C", "ping -n 300 127.0.0.1 >NUL"]);
            c
        };
        #[cfg(unix)]
        let mut cmd = {
            let mut c = Command::new("sleep");
            c.arg("300");
            c
        };
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn sleeper child")
    }

    /// Whether a PID still refers to a live process.
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

    /// Issue #228: replacing the recorded child (racing boots — a `restart()`
    /// from install/repair/update completing while an earlier boot is still
    /// inside `spawn_and_probe`) must REAP the child being displaced, not
    /// silently drop the `Child` handle (dropping does not kill the process
    /// — the old launcher+clio tree would run unsupervised until app exit).
    #[test]
    fn replacing_the_child_reaps_the_previous_one() {
        use std::time::{Duration, Instant};

        let handle = BackendHandle {
            url: "http://127.0.0.1:17800".into(),
            bearer_token: "tok".into(),
            status: BackendStatus::Ready,
        };

        let state = SupervisorState::new_starting();
        let first = spawn_sleeper();
        let first_pid = first.id();
        state.set_handle_and_child(handle.clone(), first);
        assert!(pid_alive(first_pid), "sanity: first child should be alive");

        let second = spawn_sleeper();
        let second_pid = second.id();
        state.set_handle_and_child(handle, second);

        // The displaced child must die. Allow generous time: the unix reap
        // path grants a 3 s SIGTERM grace before the direct SIGKILL.
        let deadline = Instant::now() + Duration::from_secs(10);
        while pid_alive(first_pid) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        let first_alive = pid_alive(first_pid);
        // The replacement child must stay recorded and alive.
        let second_alive = pid_alive(second_pid);

        // Clean up the survivor through the normal shutdown path before
        // asserting, so a failure doesn't leak sleepers on the test box.
        state.shutdown();

        assert!(
            !first_alive,
            "old child (pid {first_pid}) still running after replacement — leaked process tree"
        );
        assert!(
            second_alive,
            "new child (pid {second_pid}) must not be reaped by its own registration"
        );
    }

    /// A thread panicking while holding the state lock poisons the mutex.
    /// `lock_recover` must still hand back the (structurally intact) inner
    /// state so later commands keep working instead of cascading panics that
    /// would take the whole desktop down.
    #[test]
    fn state_survives_a_poisoning_panic() {
        let state = SupervisorState::new_starting();
        state.set_handle(BackendHandle {
            url: "http://127.0.0.1:17800".into(),
            bearer_token: "tok".into(),
            status: BackendStatus::Ready,
        });

        // Poison the mutex: panic inside a thread while holding the lock.
        let poisoner = state.clone();
        let _ = std::thread::spawn(move || {
            let _guard = lock_recover(&poisoner.inner);
            panic!("simulated panic while holding the state lock");
        })
        .join();

        // The mutex is now poisoned, but reads/writes still recover.
        let handle = state.snapshot();
        assert_eq!(handle.url, "http://127.0.0.1:17800");
        assert!(matches!(handle.status, BackendStatus::Ready));

        state.set_error("after-poison".into());
        assert!(matches!(
            state.snapshot().status,
            BackendStatus::Error(ref d) if d == "after-poison"
        ));
    }
}

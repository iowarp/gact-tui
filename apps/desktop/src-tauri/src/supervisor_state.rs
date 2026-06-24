//! Shared supervisor state threaded through the lifecycle.
//!
//! The `Arc<Mutex<_>>` holding the current backend handle/status and the
//! spawned child; reaps the prior child on replacement and recovers from
//! lock poisoning so one worker panic can't take the desktop down.

use std::{
    process::Child,
    sync::{Arc, Mutex, MutexGuard},
};

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

    pub fn set_handle_and_child(&self, handle: BackendHandle, child: Child) {
        let mut guard = lock_recover(&self.inner);
        guard.handle = handle;
        guard.child = Some(child);
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

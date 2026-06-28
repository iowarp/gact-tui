use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// Tracks live SSE reader threads so they can be stopped on session
/// switch (`gact_sse_close`) or app shutdown (`stop_all`).
pub struct SseRegistry {
    next: AtomicU64,
    streams: Mutex<HashMap<u64, Arc<AtomicBool>>>,
}

impl SseRegistry {
    pub fn new() -> Self {
        Self {
            next: AtomicU64::new(1),
            streams: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn register(&self) -> (u64, Arc<AtomicBool>) {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut g) = self.streams.lock() {
            g.insert(id, stop.clone());
        }
        (id, stop)
    }

    pub(crate) fn stop(&self, id: u64) {
        if let Ok(mut g) = self.streams.lock() {
            if let Some(s) = g.remove(&id) {
                s.store(true, Ordering::Relaxed);
            }
        }
    }

    /// Drop the registry entry once a thread finishes on its own.
    pub(crate) fn forget(&self, id: u64) {
        if let Ok(mut g) = self.streams.lock() {
            g.remove(&id);
        }
    }

    /// Signal every live stream to stop — called on shutdown.
    pub fn stop_all(&self) {
        if let Ok(mut g) = self.streams.lock() {
            for (_, s) in g.drain() {
                s.store(true, Ordering::Relaxed);
            }
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.streams.lock().map(|g| g.len()).unwrap_or_default()
    }
}

impl Default for SseRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::SseRegistry;
    use std::sync::atomic::Ordering;

    #[test]
    fn stop_marks_and_removes_one_stream() {
        let registry = SseRegistry::new();
        let (first_id, first_stop) = registry.register();
        let (_second_id, second_stop) = registry.register();

        registry.stop(first_id);

        assert!(first_stop.load(Ordering::Relaxed));
        assert!(!second_stop.load(Ordering::Relaxed));
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn forget_removes_without_marking_stop() {
        let registry = SseRegistry::new();
        let (id, stop) = registry.register();

        registry.forget(id);

        assert!(!stop.load(Ordering::Relaxed));
        assert_eq!(registry.len(), 0);
    }

    #[test]
    fn stop_all_marks_and_drains_every_stream() {
        let registry = SseRegistry::new();
        let (_first_id, first_stop) = registry.register();
        let (_second_id, second_stop) = registry.register();

        registry.stop_all();

        assert!(first_stop.load(Ordering::Relaxed));
        assert!(second_stop.load(Ordering::Relaxed));
        assert_eq!(registry.len(), 0);
    }
}

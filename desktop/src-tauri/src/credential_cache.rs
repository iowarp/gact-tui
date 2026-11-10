//! Per-process memory of operating-system credential reads.
//!
//! Every read of a macOS keychain item that this exact build is not yet trusted for
//! raises a fresh "allow access" prompt; Windows Credential Manager and Linux Secret
//! Service pay an IPC round trip (and possibly an unlock prompt) per read. Each slot
//! is therefore read from the OS at most once per process. The outcome is remembered,
//! including "absent" and a failed or denied read, so nothing re-prompts in a loop.
//! Writes go through to the OS and update the memory; deletes record the slot as absent.
//! Only an explicit user store or delete forgets a remembered failure and lets the
//! OS ask again. Values live only in process memory and are never logged.

use crate::credential_chunks::SecretSlots;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, MutexGuard};

type Outcome = Result<Option<String>, String>;

/// Remembered read outcomes keyed by credential service and slot account.
#[derive(Default)]
pub struct SlotCache(Mutex<HashMap<(String, String), Outcome>>);

static PROCESS_CACHE: LazyLock<SlotCache> = LazyLock::new(SlotCache::default);

impl SlotCache {
    /// The one cache shared by every credential command in this process.
    pub fn process() -> &'static SlotCache {
        &PROCESS_CACHE
    }

    fn entries(&self) -> MutexGuard<'_, HashMap<(String, String), Outcome>> {
        // A panic while holding the lock cannot leave a half-written entry behind.
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn lookup(&self, service: &str, account: &str) -> Option<Outcome> {
        self.entries()
            .get(&(service.to_string(), account.to_string()))
            .cloned()
    }

    fn remember(&self, service: &str, account: &str, outcome: Outcome) {
        self.entries()
            .insert((service.to_string(), account.to_string()), outcome);
    }

    fn forget(&self, service: &str, account: &str) {
        self.entries()
            .remove(&(service.to_string(), account.to_string()));
    }

    /// Forget remembered read failures for one credential and its chunk slots, so an
    /// explicit user store or delete asks the operating system again.
    pub fn forget_failures(&self, service: &str, account: &str) {
        let chunk_prefix = format!("{account}#");
        self.entries().retain(|(cached_service, cached_account), outcome| {
            outcome.is_ok()
                || cached_service != service
                || (cached_account != account && !cached_account.starts_with(&chunk_prefix))
        });
    }
}

/// A credential store whose reads are answered from the process cache after the first.
pub struct CachedSlots<'a, S> {
    service: &'static str,
    inner: S,
    cache: &'a SlotCache,
}

impl<'a, S: SecretSlots> CachedSlots<'a, S> {
    pub fn new(service: &'static str, inner: S, cache: &'a SlotCache) -> Self {
        Self {
            service,
            inner,
            cache,
        }
    }
}

impl<S: SecretSlots> SecretSlots for CachedSlots<'_, S> {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        if let Some(outcome) = self.cache.lookup(self.service, account) {
            return outcome;
        }
        let outcome = self.inner.get(account);
        self.cache.remember(self.service, account, outcome.clone());
        outcome
    }

    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        match self.inner.set(account, secret) {
            Ok(()) => {
                self.cache
                    .remember(self.service, account, Ok(Some(secret.to_string())));
                Ok(())
            }
            Err(error) => {
                // The store may or may not hold the new value; read it again next time.
                self.cache.forget(self.service, account);
                Err(error)
            }
        }
    }

    fn remove(&self, account: &str) -> Result<(), String> {
        match self.inner.remove(account) {
            Ok(()) => {
                self.cache.remember(self.service, account, Ok(None));
                Ok(())
            }
            Err(error) => {
                self.cache.forget(self.service, account);
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credential_chunks;
    use std::cell::{Cell, RefCell};

    /// In-memory store that counts how often the "operating system" is asked.
    #[derive(Default)]
    struct CountingSlots {
        values: RefCell<HashMap<String, String>>,
        reads: Cell<usize>,
        deny_reads: Cell<bool>,
    }

    impl SecretSlots for &CountingSlots {
        fn get(&self, account: &str) -> Result<Option<String>, String> {
            self.reads.set(self.reads.get() + 1);
            if self.deny_reads.get() {
                return Err("access denied".to_string());
            }
            Ok(self.values.borrow().get(account).cloned())
        }
        fn set(&self, account: &str, secret: &str) -> Result<(), String> {
            self.values
                .borrow_mut()
                .insert(account.to_string(), secret.to_string());
            Ok(())
        }
        fn remove(&self, account: &str) -> Result<(), String> {
            self.values.borrow_mut().remove(account);
            Ok(())
        }
    }

    const SERVICE: &str = "test.service";

    #[test]
    fn a_stored_credential_is_read_from_the_os_once() {
        let os = CountingSlots::default();
        os.values
            .borrow_mut()
            .insert("acct".to_string(), "key".to_string());
        let cache = SlotCache::default();
        for _ in 0..4 {
            let slots = CachedSlots::new(SERVICE, &os, &cache);
            assert_eq!(
                credential_chunks::load(&slots, "acct").unwrap().as_deref(),
                Some("key")
            );
        }
        assert_eq!(os.reads.get(), 1);
    }

    #[test]
    fn a_chunked_credential_reads_each_slot_once() {
        let os = CountingSlots::default();
        let cache = SlotCache::default();
        let secret = "x".repeat(3000);
        credential_chunks::save(&CachedSlots::new(SERVICE, &os, &cache), "acct", &secret)
            .unwrap();
        let fresh = SlotCache::default();
        let reads_before = os.reads.get();
        for _ in 0..3 {
            let slots = CachedSlots::new(SERVICE, &os, &fresh);
            assert_eq!(credential_chunks::load(&slots, "acct").unwrap(), Some(secret.clone()));
        }
        assert_eq!(os.reads.get() - reads_before, 4);
    }

    #[test]
    fn writes_go_through_and_update_the_cache() {
        let os = CountingSlots::default();
        let cache = SlotCache::default();
        let slots = CachedSlots::new(SERVICE, &os, &cache);
        credential_chunks::save(&slots, "acct", "first").unwrap();
        credential_chunks::save(&slots, "acct", "second").unwrap();
        let reads = os.reads.get();
        assert_eq!(
            credential_chunks::load(&slots, "acct").unwrap().as_deref(),
            Some("second")
        );
        assert_eq!(os.values.borrow().get("acct").map(String::as_str), Some("second"));
        assert_eq!(os.reads.get(), reads);
    }

    #[test]
    fn delete_records_the_credential_as_absent() {
        let os = CountingSlots::default();
        let cache = SlotCache::default();
        let slots = CachedSlots::new(SERVICE, &os, &cache);
        credential_chunks::save(&slots, "acct", &"y".repeat(2500)).unwrap();
        credential_chunks::delete(&slots, "acct").unwrap();
        let reads = os.reads.get();
        assert_eq!(credential_chunks::load(&slots, "acct").unwrap(), None);
        assert!(os.values.borrow().is_empty());
        assert_eq!(os.reads.get(), reads);
    }

    #[test]
    fn a_denied_read_is_remembered_instead_of_asking_again() {
        let os = CountingSlots::default();
        os.deny_reads.set(true);
        let cache = SlotCache::default();
        for _ in 0..4 {
            let slots = CachedSlots::new(SERVICE, &os, &cache);
            assert_eq!(
                credential_chunks::load(&slots, "acct"),
                Err("access denied".to_string())
            );
        }
        assert_eq!(os.reads.get(), 1);
    }

    #[test]
    fn an_explicit_store_forgets_the_remembered_denial() {
        let os = CountingSlots::default();
        os.deny_reads.set(true);
        let cache = SlotCache::default();
        let slots = CachedSlots::new(SERVICE, &os, &cache);
        assert!(credential_chunks::load(&slots, "acct").is_err());
        os.deny_reads.set(false);
        cache.forget_failures(SERVICE, "acct");
        credential_chunks::save(&slots, "acct", "fresh").unwrap();
        assert_eq!(
            credential_chunks::load(&slots, "acct").unwrap().as_deref(),
            Some("fresh")
        );
        assert_eq!(os.reads.get(), 2);
    }

    #[test]
    fn forgetting_failures_keeps_other_services_and_successes() {
        let cache = SlotCache::default();
        cache.remember(SERVICE, "acct", Err("denied".into()));
        cache.remember(SERVICE, "acct#0123#0", Err("denied".into()));
        cache.remember(SERVICE, "other", Err("denied".into()));
        cache.remember("other.service", "acct", Err("denied".into()));
        cache.remember(SERVICE, "acct#ok", Ok(Some("chunk".into())));
        cache.forget_failures(SERVICE, "acct");
        assert!(cache.lookup(SERVICE, "acct").is_none());
        assert!(cache.lookup(SERVICE, "acct#0123#0").is_none());
        assert!(cache.lookup(SERVICE, "other").is_some());
        assert!(cache.lookup("other.service", "acct").is_some());
        assert!(cache.lookup(SERVICE, "acct#ok").is_some());
    }
}

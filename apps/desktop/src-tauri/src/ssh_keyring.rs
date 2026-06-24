//! OS-keychain storage for SSH tunnel passphrases.
//!
//! Persists per-`user@host` secrets so reconnects don't re-prompt;
//! retrieval is best-effort and silently absent when no entry exists.

use crate::ssh_types::{TunnelError, TunnelErrorCode};

const KEYRING_SERVICE: &str = "ai.iowarp.clio.desktop.ssh";

pub(crate) fn store_passphrase(user: &str, host: &str, secret: &str) -> Result<(), TunnelError> {
    let account = format!("{user}@{host}");
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| TunnelError {
        code: TunnelErrorCode::KeychainWriteFailed,
        message: format!("keyring init: {e}"),
    })?;
    entry.set_password(secret).map_err(|e| TunnelError {
        code: TunnelErrorCode::KeychainWriteFailed,
        message: format!("keyring write: {e}"),
    })?;
    Ok(())
}

/// Best-effort retrieval — silently returns None if no entry exists or
/// the OS denies access. Wave 4 ssh-agent integration may replace this.
#[allow(dead_code)]
pub fn load_passphrase(user: &str, host: &str) -> Option<String> {
    let account = format!("{user}@{host}");
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).ok()?;
    entry.get_password().ok()
}

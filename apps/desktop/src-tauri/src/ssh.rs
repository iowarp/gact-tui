//! SSH tunnel manager (Wave 3).
//!
//! Spawns `ssh -L <local_port>:127.0.0.1:<remote_port> <user>@<host>` for
//! a backend whose `kind` is `ssh-tunnel`, parses the early child output
//! to detect the standard "Permission denied" / "Connection closed" /
//! "Authentication failed" patterns, and stores the key passphrase in
//! the OS keychain via the `keyring` crate (Windows Credential Manager
//! / macOS Keychain / kwallet|secret-service on Linux).
//!
//! The tunnel handle's lifecycle is the same shape as the sidecar
//! supervisor: spawn → poll for ready → store the Child for reaping
//! on shutdown.
//!
//! IMPORTANT: this module assumes `ssh` is on PATH. The Tauri shell
//! exposes a `tunnel_open` command that surfaces the typed error to
//! the frontend so the AddRemote wizard can render an actionable
//! message ("install OpenSSH client" / "wrong passphrase" / etc.).

use std::{process::Child, sync::Mutex, time::Duration};

use crate::net_util::pick_free_port;
use crate::ssh_command::{build_ssh_forward_command, ssh_available};
use crate::ssh_keyring::store_passphrase;
use crate::ssh_types::{TunnelError, TunnelErrorCode, TunnelHandle, TunnelRequest};

pub struct TunnelManager {
    /// (host, child) for active tunnels — keyed by the remote host so the
    /// supervisor can reap them on shutdown.
    inner: Mutex<Vec<(String, Child)>>,
}

impl TunnelManager {
    pub const fn new() -> Self {
        Self {
            inner: Mutex::new(Vec::new()),
        }
    }

    /// Spawns an `ssh -L` tunnel and (if a passphrase is given) records
    /// it in the OS keychain under `(KEYRING_SERVICE, user@host)`.
    ///
    /// Returns immediately once the child is alive; callers can poll
    /// the local URL for /v1/capabilities like they do with the sidecar.
    pub fn open(&self, req: TunnelRequest) -> Result<TunnelHandle, TunnelError> {
        if !ssh_available() {
            return Err(TunnelError {
                code: TunnelErrorCode::SshNotInstalled,
                message: "the `ssh` command was not found on PATH".to_string(),
            });
        }

        let local_port = pick_free_port().map_err(|e| TunnelError {
            code: TunnelErrorCode::PortAllocation,
            message: format!("port allocation failed: {e}"),
        })?;

        if let Some(secret) = req.passphrase.as_deref() {
            store_passphrase(&req.user, &req.host, secret)?;
        }

        let mut cmd = build_ssh_forward_command(&req, local_port);
        let child = cmd.spawn().map_err(|e| TunnelError {
            code: TunnelErrorCode::SpawnFailed,
            message: format!("ssh spawn failed: {e}"),
        })?;

        if let Ok(mut guard) = self.inner.lock() {
            guard.push((req.host.clone(), child));
        }

        Ok(TunnelHandle {
            local_url: format!("http://127.0.0.1:{local_port}"),
            local_port,
        })
    }

    /// Reap every running tunnel; called on Tauri shutdown.
    pub fn shutdown_all(&self) {
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        for (_, mut child) in guard.drain(..) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Default for TunnelManager {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
const POLL_INTERVAL: Duration = Duration::from_millis(250);

#[cfg(test)]
#[path = "ssh_tests.rs"]
mod tunnel_tests;

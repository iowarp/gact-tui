//! SSH tunnel manager (Wave 3).
//!
//! Spawns `ssh -L <local_port>:127.0.0.1:<remote_port> <user>@<host>` for
//! a backend whose `kind` is `ssh-tunnel`, then hands the child to the
//! reaper. The child's stdin is `/dev/null` and its stdout/stderr are
//! inherited, so this module does NOT parse the child's output — there
//! is no "Permission denied" / "Authentication failed" detection here.
//! A failure surfaces the same way it would at a terminal: the `ssh`
//! process exits and the forwarded local port never starts serving.
//!
//! Authentication is delegated entirely to `ssh` itself: an unencrypted
//! key (`-i <key_path>`) or an agent-provided identity (ssh-agent). This
//! process supplies no passphrase — an encrypted key with no agent loaded
//! cannot be unlocked here and the tunnel will fail to come up. Wiring an
//! `SSH_ASKPASS` helper for that case is tracked as follow-up work.
//!
//! The tunnel handle's lifecycle is the same shape as the sidecar
//! supervisor: spawn → poll for ready → store the Child for reaping
//! on shutdown.
//!
//! IMPORTANT: this module assumes `ssh` is on PATH. The Tauri shell
//! exposes a `tunnel_open` command that surfaces the typed error to
//! the frontend so the AddRemote wizard can render an actionable
//! message (e.g. "install OpenSSH client").

use std::{process::Child, sync::Mutex};

use crate::net_util::pick_free_port;
use crate::ssh_command::{build_ssh_forward_command, ssh_available};
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

    /// Spawns an `ssh -L` tunnel. Authentication is left to `ssh`
    /// (agent identity or unencrypted `-i` key); no passphrase is
    /// supplied by this process.
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

#[cfg(test)]
#[path = "ssh_tests.rs"]
mod tunnel_tests;

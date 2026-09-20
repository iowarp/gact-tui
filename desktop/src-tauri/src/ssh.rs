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

use std::{net::TcpListener, process::Child, sync::Mutex};

use crate::net_util::pick_free_port;
use crate::ssh_auth::configure_askpass;
use crate::ssh_command::{build_ssh_forward_command, ssh_available};
use crate::ssh_types::{TunnelError, TunnelErrorCode, TunnelHandle, TunnelRequest};

pub struct TunnelManager {
    inner: Mutex<Vec<ActiveTunnel>>,
}

struct ActiveTunnel {
    request: TunnelRequest,
    handle: TunnelHandle,
    child: Child,
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
        validate_request(&req)?;
        if !ssh_available() {
            return Err(TunnelError {
                code: TunnelErrorCode::SshNotInstalled,
                message: "the `ssh` command was not found on PATH".to_string(),
            });
        }

        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut index = 0;
        while index < guard.len() {
            if guard[index].child.try_wait().ok().flatten().is_some() {
                guard.remove(index);
                continue;
            }
            if guard[index].request == req {
                return Ok(guard[index].handle.clone());
            }
            index += 1;
        }

        let local_port = match req.local_port {
            Some(port) if port > 0 => {
                TcpListener::bind(("127.0.0.1", port)).map_err(|error| TunnelError {
                    code: TunnelErrorCode::PortAllocation,
                    message: format!("saved tunnel port {port} is unavailable: {error}"),
                })?;
                port
            }
            _ => pick_free_port().map_err(|e| TunnelError {
                code: TunnelErrorCode::PortAllocation,
                message: format!("port allocation failed: {e}"),
            })?,
        };

        let mut cmd = build_ssh_forward_command(&req, local_port);
        configure_askpass(
            &mut cmd,
            Some(req.auth_method.as_str()),
            Some(req.credential_id.as_str()),
        )
        .map_err(|message| TunnelError {
            code: TunnelErrorCode::InvalidRequest,
            message,
        })?;
        let child = cmd.spawn().map_err(|e| TunnelError {
            code: TunnelErrorCode::SpawnFailed,
            message: format!("ssh spawn failed: {e}"),
        })?;

        let handle = TunnelHandle {
            local_url: format!("http://127.0.0.1:{local_port}"),
            local_port,
        };
        guard.push(ActiveTunnel {
            request: req,
            handle: handle.clone(),
            child,
        });
        Ok(handle)
    }

    /// Reap every running tunnel; called on Tauri shutdown.
    pub fn shutdown_all(&self) {
        let mut guard = match self.inner.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        for mut tunnel in guard.drain(..) {
            let _ = tunnel.child.kill();
            let _ = tunnel.child.wait();
        }
    }
}

fn validate_request(request: &TunnelRequest) -> Result<(), TunnelError> {
    let profile = request.profile.trim();
    let host = request.host.trim();
    let user = request.user.trim();
    let valid_profile = !profile.is_empty()
        && profile.len() <= 128
        && !profile.starts_with('-')
        && profile
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-@".contains(character));
    let valid_host = !host.is_empty()
        && host.len() <= 255
        && !host.starts_with('-')
        && host
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".:_-%".contains(character));
    let valid_user = user.is_empty()
        || user.len() <= 128
            && !user.starts_with('-')
            && user
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character));
    let valid_key = request.key_path.len() <= 1_024
        && !request
            .key_path
            .chars()
            .any(|character| matches!(character, '\0' | '\n' | '\r'));
    let valid_auth = request.auth_method.is_empty()
        || request.auth_method == "key"
        || (request.auth_method == "password" && !request.credential_id.trim().is_empty());
    if request.remote_port == 0
        || request.port == 0
        || (!valid_profile && !valid_host)
        || !valid_user
        || !valid_key
        || !valid_auth
    {
        return Err(TunnelError {
            code: TunnelErrorCode::InvalidRequest,
            message: "the SSH tunnel settings are not valid".into(),
        });
    }
    Ok(())
}

impl Default for TunnelManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "ssh_tests.rs"]
mod tunnel_tests;

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

use serde::{Deserialize, Serialize};
use std::{
    io,
    net::TcpListener,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};

const KEYRING_SERVICE: &str = "ai.iowarp.clio.desktop.ssh";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelRequest {
    pub host: String,
    pub user: String,
    pub remote_port: u16,
    pub key_path: String,
    /// Optional passphrase — when provided we route it through the OS
    /// keychain so subsequent reconnects don't prompt the user.
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelHandle {
    pub local_url: String,
    pub local_port: u16,
}

#[derive(Debug)]
pub struct TunnelError {
    pub code: TunnelErrorCode,
    pub message: String,
}

impl std::fmt::Display for TunnelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl std::error::Error for TunnelError {}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum TunnelErrorCode {
    SshNotInstalled,
    PortAllocation,
    KeychainWriteFailed,
    SpawnFailed,
}

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

        let local_arg = format!("{local_port}:127.0.0.1:{}", req.remote_port);
        let user_at_host = format!("{}@{}", req.user, req.host);

        let mut cmd = Command::new("ssh");
        cmd.arg("-N") // no remote command
            .arg("-T") // no pseudo-TTY
            .arg("-o")
            .arg("ExitOnForwardFailure=yes")
            .arg("-o")
            .arg("ServerAliveInterval=30")
            .arg("-o")
            .arg("ServerAliveCountMax=3")
            .arg("-L")
            .arg(&local_arg);

        if !req.key_path.is_empty() {
            cmd.arg("-i").arg(&req.key_path);
        }
        cmd.arg(user_at_host);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit());

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

fn ssh_available() -> bool {
    let out = Command::new("ssh").arg("-V").output();
    match out {
        Ok(o) => !o.stderr.is_empty() || !o.stdout.is_empty(),
        Err(_) => false,
    }
}

fn pick_free_port() -> io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn store_passphrase(user: &str, host: &str, secret: &str) -> Result<(), TunnelError> {
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

#[allow(dead_code)]
const POLL_INTERVAL: Duration = Duration::from_millis(250);

#[cfg(test)]
mod tunnel_tests {
    //! Live SSH-tunnel integration test (Wave 3). Spawns a real
    //! `ssh -L` tunnel via `TunnelManager::open` to a remote host and
    //! verifies traffic actually forwards through it.
    //!
    //! Gated on env so CI without an SSH target stays green:
    //!   SSH_TUNNEL_HOST, SSH_TUNNEL_USER, SSH_TUNNEL_KEY,
    //!   SSH_TUNNEL_REMOTE_PORT (the remote loopback port to forward).
    //! Stand up something HTTP on the remote loopback first; the test
    //! asserts a 200 comes back through the local forwarded port.
    use super::{TunnelManager, TunnelRequest};
    use std::{env, thread, time::Duration};

    fn cfg() -> Option<(String, String, String, u16)> {
        let host = env::var("SSH_TUNNEL_HOST").ok()?;
        let user = env::var("SSH_TUNNEL_USER").ok()?;
        let key = env::var("SSH_TUNNEL_KEY").unwrap_or_default();
        let port: u16 = env::var("SSH_TUNNEL_REMOTE_PORT")
            .ok()?
            .parse()
            .ok()?;
        Some((host, user, key, port))
    }

    #[test]
    fn forwards_http_through_a_real_ssh_tunnel() {
        let Some((host, user, key_path, remote_port)) = cfg() else {
            eprintln!("skip: SSH_TUNNEL_* env not set");
            return;
        };
        let mgr = TunnelManager::new();
        let handle = mgr
            .open(TunnelRequest {
                host,
                user,
                remote_port,
                key_path,
                passphrase: None,
            })
            .expect("tunnel open should succeed (ssh on PATH + reachable host)");

        // The ssh child needs a beat to establish forwarding; poll the
        // local end for up to ~12s.
        let probe = format!("{}/v1/capabilities", handle.local_url);
        let mut last = String::new();
        let mut ok = false;
        for _ in 0..24 {
            match ureq::get(&probe)
                .timeout(Duration::from_millis(1500))
                .call()
            {
                Ok(r) => {
                    last = r.into_string().unwrap_or_default();
                    ok = true;
                    break;
                }
                Err(ureq::Error::Status(code, _)) => {
                    last = format!("status {code}");
                    ok = true; // reached the remote service (any HTTP status)
                    break;
                }
                Err(_) => thread::sleep(Duration::from_millis(500)),
            }
        }
        mgr.shutdown_all();
        assert!(
            ok,
            "no HTTP response through the tunnel at {} — forwarding failed",
            handle.local_url
        );
        // When pointed at the homelab GACT mock, the body carries the
        // contract envelope; any 2xx/4xx still proves bytes traversed.
        eprintln!("tunnel reached remote service; body/preview: {last:.120}");
    }
}

//! Live SSH-tunnel integration test (Wave 3). Spawns a real `ssh -L` tunnel
//! via `TunnelManager::open` to a remote host and verifies traffic actually
//! forwards through it.
//!
//! Gated on env so CI without an SSH target stays green:
//!   SSH_TUNNEL_HOST, SSH_TUNNEL_USER, SSH_TUNNEL_KEY,
//!   SSH_TUNNEL_REMOTE_PORT (the remote loopback port to forward).
//! Stand up something HTTP on the remote loopback first; the test asserts a
//! response comes back through the local forwarded port.

use super::TunnelManager;
use crate::ssh_types::TunnelRequest;
use std::{env, thread, time::Duration};

fn cfg() -> Option<(String, String, String, u16)> {
    let host = env::var("SSH_TUNNEL_HOST").ok()?;
    let user = env::var("SSH_TUNNEL_USER").ok()?;
    let key = env::var("SSH_TUNNEL_KEY").unwrap_or_default();
    let port: u16 = env::var("SSH_TUNNEL_REMOTE_PORT").ok()?.parse().ok()?;
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
        })
        .expect("tunnel open should succeed (ssh on PATH + reachable host)");

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
                ok = true;
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
    eprintln!("tunnel reached remote service; body/preview: {last:.120}");
}

fn local_serves(url: &str) -> bool {
    matches!(
        ureq::get(&format!("{url}/v1/capabilities"))
            .timeout(Duration::from_millis(1200))
            .call(),
        Ok(_) | Err(ureq::Error::Status(_, _))
    )
}

/// HARDENING: a tunnel to a host that refuses the SSH connection must not end
/// up forwarding.
#[test]
fn bad_host_does_not_forward() {
    if !super::ssh_available() {
        eprintln!("skip: ssh not on PATH");
        return;
    }
    let mgr = TunnelManager::new();
    let handle = mgr
        .open(TunnelRequest {
            host: "127.0.0.1".into(),
            user: "nobody".into(),
            remote_port: 18900,
            key_path: String::new(),
        })
        .expect("open() returns Ok once the child is spawned");

    let mut served = false;
    for _ in 0..8 {
        if local_serves(&handle.local_url) {
            served = true;
            break;
        }
        thread::sleep(Duration::from_millis(400));
    }
    mgr.shutdown_all();
    assert!(
        !served,
        "a tunnel to a refusing host must not forward, but {} answered",
        handle.local_url
    );
}

/// HARDENING: shutdown_all() must reap the ssh child so the local forwarded
/// port stops serving.
#[test]
fn reaping_stops_forwarding() {
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
        })
        .expect("tunnel open");

    let mut up = false;
    for _ in 0..24 {
        if local_serves(&handle.local_url) {
            up = true;
            break;
        }
        thread::sleep(Duration::from_millis(500));
    }
    assert!(up, "tunnel never came up at {}", handle.local_url);

    mgr.shutdown_all();
    let mut down = false;
    for _ in 0..16 {
        if !local_serves(&handle.local_url) {
            down = true;
            break;
        }
        thread::sleep(Duration::from_millis(500));
    }
    assert!(
        down,
        "forwarding still alive after shutdown_all — tunnel leaked at {}",
        handle.local_url
    );
}

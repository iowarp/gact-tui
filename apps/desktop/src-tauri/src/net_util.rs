//! Tiny shared network helper: pick an OS-assigned free loopback TCP port.
//! Used by both the sidecar spawner (supervisor_spawn) and the SSH tunnel
//! (ssh) so the port-allocation logic has a single source of truth.

use std::io;
use std::net::TcpListener;

/// Bind an ephemeral loopback port, read the assigned number back, then
/// release it so the caller can hand it to a child process. Inherently racy
/// (the port can be taken between drop and reuse), which is acceptable for the
/// spawn-then-probe flow these callers use.
pub(crate) fn pick_free_port() -> io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

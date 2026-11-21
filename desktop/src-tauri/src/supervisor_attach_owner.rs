//! Whether the server listening on the attach port belongs to this desktop's user.
//!
//! The desktop attaches to a CLIO already running on the conventional loopback
//! port. Every account on the computer can listen on loopback, so before the
//! desktop uses a server it did not spawn, and before it hands that server a
//! token, it checks who owns the listening socket. On Linux the kernel lists the
//! owner of every TCP socket in `/proc/net/tcp` and `/proc/net/tcp6`. macOS and
//! Windows have no such table here; there the desktop relies on the server's
//! owner-only credential record alone.

/// `Ok` when every loopback listener on `port` belongs to this process's user.
///
/// The error is the plain-language reason shown to the user.
#[cfg(target_os = "linux")]
pub(crate) fn listener_belongs_to_this_user(port: u16) -> Result<(), String> {
    // SAFETY: geteuid has no preconditions and cannot fail.
    let uid = unsafe { libc::geteuid() };
    let mut owners = Vec::new();
    for table in ["/proc/net/tcp", "/proc/net/tcp6"] {
        if let Ok(text) = std::fs::read_to_string(table) {
            owners.extend(listening_owners(&text, port));
        }
    }
    if owners.is_empty() {
        return Err(format!(
            "this desktop could not find who owns the server listening on port {port}"
        ));
    }
    match owners.iter().find(|owner| **owner != uid) {
        Some(other) => Err(format!(
            "the server listening on port {port} belongs to another account on this computer \
             (uid {other})"
        )),
        None => Ok(()),
    }
}

#[cfg(not(target_os = "linux"))]
pub(crate) fn listener_belongs_to_this_user(_port: u16) -> Result<(), String> {
    Ok(())
}

/// The owner uid of every listening socket on `port` in one `/proc/net/tcp{,6}` table.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub(crate) fn listening_owners(table: &str, port: u16) -> Vec<u32> {
    const LISTEN: &str = "0A";
    table
        .lines()
        .skip(1)
        .filter_map(|line| {
            let fields: Vec<&str> = line.split_whitespace().collect();
            let local = fields.get(1)?;
            let state = fields.get(3)?;
            let uid = fields.get(7)?;
            let local_port = u16::from_str_radix(local.rsplit_once(':')?.1, 16).ok()?;
            (*state == LISTEN && local_port == port).then(|| uid.parse().ok())?
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TABLE: &str = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n\
   0: 0100007F:4590 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 11 1 0 100 0 0 10 0\n\
   1: 0100007F:4590 0100007F:A000 01 00000000:00000000 00:00000000 00000000  2000        0 12 1 0 20 4 30 10 -1\n\
   2: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  2000        0 13 1 0 100 0 0 10 0\n";

    #[test]
    fn reads_only_listening_sockets_on_the_port() {
        // 0x4590 is 17808; the established connection on it is not a listener.
        assert_eq!(listening_owners(TABLE, 17808), vec![1000]);
        assert_eq!(listening_owners(TABLE, 8080), vec![2000]);
        assert!(listening_owners(TABLE, 17800).is_empty());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn a_listener_this_process_opened_is_this_users() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        assert_eq!(listener_belongs_to_this_user(port), Ok(()));
        drop(listener);
        assert!(listener_belongs_to_this_user(port).is_err());
    }
}

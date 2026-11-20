//! Where a transport session's SOCKS listener lives, and who may use its forwards.
//!
//! Each session starts OpenSSH's SOCKS server (`-D`) so that later port forwards
//! ride the one authenticated connection. OpenSSH's SOCKS server has no
//! authentication of its own, and every account on the computer can reach a
//! loopback port, so on Linux and macOS it listens on a Unix socket inside a
//! directory only this user can enter (mode 0700). Windows OpenSSH keeps the
//! loopback port.
//!
//! The forwards themselves are loopback ports the WebView and the desktop
//! connect to. On Linux, [`accepted_from_this_user`] drops a connection whose
//! socket belongs to another account.

use std::io::{self, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpStream};
#[cfg(unix)]
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::time::Duration;

/// The `-D` listener of one session.
pub enum SocksEndpoint {
    /// A loopback TCP port (Windows).
    #[cfg_attr(unix, allow(dead_code))]
    Tcp(u16),
    /// A Unix socket inside a private directory (Linux and macOS).
    #[cfg(unix)]
    Unix { directory: PathBuf, socket: PathBuf },
}

impl SocksEndpoint {
    /// A new, unused endpoint for a session about to start.
    pub fn new() -> Result<Self, String> {
        #[cfg(unix)]
        {
            let directory = private_directory()?;
            let socket = directory.join("s");
            Ok(Self::Unix { directory, socket })
        }
        #[cfg(not(unix))]
        {
            crate::ssh_transport_forward::free_loopback_port().map(Self::Tcp)
        }
    }

    /// The value for OpenSSH's `-D` option.
    pub fn ssh_argument(&self) -> String {
        match self {
            Self::Tcp(port) => format!("127.0.0.1:{port}"),
            #[cfg(unix)]
            Self::Unix { socket, .. } => socket.display().to_string(),
        }
    }

    /// Connect to the SOCKS listener.
    pub fn connect(&self, timeout: Duration) -> io::Result<TunnelStream> {
        match self {
            Self::Tcp(port) => {
                TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], *port)), timeout)
                    .map(TunnelStream::Tcp)
            }
            #[cfg(unix)]
            Self::Unix { socket, .. } => UnixStream::connect(socket).map(TunnelStream::Unix),
        }
    }

    /// Remove the socket and its directory once the session has ended.
    pub fn remove(&self) {
        #[cfg(unix)]
        if let Self::Unix { directory, socket } = self {
            let _ = std::fs::remove_file(socket);
            let _ = std::fs::remove_dir(directory);
        }
    }
}

/// A short directory only this user can enter. Unix socket paths are limited to
/// about 104 bytes (macOS) or 108 (Linux), so it sits directly under the runtime
/// directory or `/tmp`, not under the app's data folders.
#[cfg(unix)]
fn private_directory() -> Result<PathBuf, String> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};

    let base = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute() && path.as_os_str().len() <= 48)
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    // SAFETY: geteuid has no preconditions and cannot fail.
    let uid = unsafe { libc::geteuid() };
    for _ in 0..8 {
        let directory = base.join(format!("clio-ssh-{:012x}", rand::random::<u64>() >> 16));
        match std::fs::DirBuilder::new().mode(0o700).create(&directory) {
            Ok(()) => {
                // A directory we just created; confirm it is ours and private before use.
                let meta = std::fs::symlink_metadata(&directory)
                    .map_err(|error| format!("check the SSH tunnel folder: {error}"))?;
                if !meta.is_dir() || meta.uid() != uid || meta.permissions().mode() & 0o077 != 0 {
                    return Err("the SSH tunnel folder is not private".to_string());
                }
                return Ok(directory);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("create the SSH tunnel folder: {error}")),
        }
    }
    Err("could not create a private SSH tunnel folder".to_string())
}

/// A connection to the SOCKS listener.
pub enum TunnelStream {
    Tcp(TcpStream),
    #[cfg(unix)]
    Unix(UnixStream),
}

impl TunnelStream {
    pub fn try_clone(&self) -> io::Result<Self> {
        match self {
            Self::Tcp(stream) => stream.try_clone().map(Self::Tcp),
            #[cfg(unix)]
            Self::Unix(stream) => stream.try_clone().map(Self::Unix),
        }
    }

    pub fn shutdown(&self, how: Shutdown) -> io::Result<()> {
        match self {
            Self::Tcp(stream) => stream.shutdown(how),
            #[cfg(unix)]
            Self::Unix(stream) => stream.shutdown(how),
        }
    }

    pub fn set_read_timeout(&self, timeout: Option<Duration>) -> io::Result<()> {
        match self {
            Self::Tcp(stream) => stream.set_read_timeout(timeout),
            #[cfg(unix)]
            Self::Unix(stream) => stream.set_read_timeout(timeout),
        }
    }
}

impl Read for TunnelStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Tcp(stream) => stream.read(buf),
            #[cfg(unix)]
            Self::Unix(stream) => stream.read(buf),
        }
    }
}

impl Write for TunnelStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::Tcp(stream) => stream.write(buf),
            #[cfg(unix)]
            Self::Unix(stream) => stream.write(buf),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Tcp(stream) => stream.flush(),
            #[cfg(unix)]
            Self::Unix(stream) => stream.flush(),
        }
    }
}

/// Whether an accepted loopback connection was opened by this desktop's user.
///
/// On Linux the kernel lists the owner of every TCP socket in `/proc/net/tcp`
/// and `/proc/net/tcp6`; the client's end of this connection must be ours. A
/// connection that cannot be found is refused. Elsewhere there is no such table
/// to read, and every loopback connection is accepted.
#[cfg(target_os = "linux")]
pub fn accepted_from_this_user(stream: &TcpStream) -> bool {
    let (Ok(peer), Ok(local)) = (stream.peer_addr(), stream.local_addr()) else {
        return false;
    };
    // SAFETY: geteuid has no preconditions and cannot fail.
    let uid = unsafe { libc::geteuid() };
    ["/proc/net/tcp", "/proc/net/tcp6"]
        .iter()
        .filter_map(|table| std::fs::read_to_string(table).ok())
        .find_map(|text| socket_owner(&text, peer, local))
        == Some(uid)
}

#[cfg(not(target_os = "linux"))]
pub fn accepted_from_this_user(_stream: &TcpStream) -> bool {
    true
}

/// The owner uid of the socket `local` → `remote` in one `/proc/net/tcp{,6}` table.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn socket_owner(table: &str, local: SocketAddr, remote: SocketAddr) -> Option<u32> {
    table.lines().skip(1).find_map(|line| {
        let fields: Vec<&str> = line.split_whitespace().collect();
        let row_local = parse_address(fields.get(1)?)?;
        let row_remote = parse_address(fields.get(2)?)?;
        (same_address(row_local, local) && same_address(row_remote, remote))
            .then(|| fields.get(7)?.parse().ok())?
    })
}

fn same_address(left: SocketAddr, right: SocketAddr) -> bool {
    let canonical = |address: SocketAddr| match address {
        SocketAddr::V6(v6) => v6
            .ip()
            .to_ipv4_mapped()
            .map_or(SocketAddr::V6(v6), |v4| SocketAddr::from((v4, v6.port()))),
        other => other,
    };
    canonical(left) == canonical(right)
}

/// Decode a `/proc/net/tcp{,6}` address such as `0100007F:1F90`.
fn parse_address(text: &str) -> Option<SocketAddr> {
    let (host, port) = text.split_once(':')?;
    let port = u16::from_str_radix(port, 16).ok()?;
    let bytes = (0..host.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(host.get(i..i + 2)?, 16).ok())
        .collect::<Option<Vec<u8>>>()?;
    // The kernel prints each 32-bit word of the address in host byte order.
    let words: Vec<[u8; 4]> = bytes
        .chunks(4)
        .map(|chunk| u32::from_ne_bytes(chunk.try_into().unwrap()).to_be_bytes())
        .collect();
    match words.as_slice() {
        [a] => Some(SocketAddr::from((*a, port))),
        [a, b, c, d] => {
            let mut octets = [0_u8; 16];
            for (i, word) in [a, b, c, d].iter().enumerate() {
                octets[i * 4..i * 4 + 4].copy_from_slice(*word);
            }
            Some(SocketAddr::from((octets, port)))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn decodes_proc_addresses() {
        assert_eq!(
            parse_address("0100007F:1F90"),
            Some(SocketAddr::from(([127, 0, 0, 1], 8080)))
        );
        assert_eq!(
            parse_address("00000000000000000000000001000000:0050"),
            Some("[::1]:80".parse().unwrap())
        );
    }

    #[test]
    fn finds_the_owner_of_one_end_of_a_connection() {
        let table =
            "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid\n\
   0: 0100007F:4590 0100007F:A000 01 00000000:00000000 00:00000000 00000000  1000 0 1\n\
   1: 0100007F:A000 0100007F:4590 01 00000000:00000000 00:00000000 00000000  2000 0 2\n";
        let server: SocketAddr = "127.0.0.1:17808".parse().unwrap();
        let client: SocketAddr = "127.0.0.1:40960".parse().unwrap();
        assert_eq!(socket_owner(table, client, server), Some(2000));
        assert_eq!(socket_owner(table, server, client), Some(1000));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn a_connection_this_process_opened_is_this_users() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (accepted, _) = listener.accept().unwrap();
        assert!(accepted_from_this_user(&accepted));
        drop(client);
    }

    #[cfg(unix)]
    #[test]
    fn the_unix_endpoint_is_private_short_and_removed() {
        use std::os::unix::fs::PermissionsExt;

        let endpoint = SocksEndpoint::new().unwrap();
        let SocksEndpoint::Unix { directory, socket } = &endpoint else {
            panic!("expected a Unix endpoint");
        };
        let mode = std::fs::metadata(directory).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o700);
        assert!(socket.as_os_str().len() < 100, "{}", socket.display());
        assert_eq!(endpoint.ssh_argument(), socket.display().to_string());
        let directory = directory.clone();
        endpoint.remove();
        assert!(!directory.exists());
    }
}

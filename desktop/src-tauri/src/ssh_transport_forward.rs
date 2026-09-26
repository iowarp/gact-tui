//! Loopback port forwards carried by the one authenticated OpenSSH session.
//!
//! Every transport session is started with `-D 127.0.0.1:<port>` (OpenSSH's
//! built-in SOCKS5 server, see `ssh_transport_command::ssh_arguments`). A
//! forward is then a loopback listener here that relays each accepted
//! connection through that SOCKS server with a `CONNECT <host>:<port>`; OpenSSH
//! turns the CONNECT into a `direct-tcpip` channel on the session that is
//! already authenticated, so the far end is resolved on the destination host —
//! after every `-J` jump — and no second login (password, Duo) is needed.
//!
//! This replaces the `~C` escape-command-line approach, which cannot work on
//! Windows: Windows OpenSSH reads the `ssh>` command line from the console, not
//! from the pipe the desktop writes to, so the requested `-L` never arrived.

use std::io::{self, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// A live loopback listener relaying to one remote `host:port`.
pub struct LocalForward {
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    stop: Arc<AtomicBool>,
}

impl LocalForward {
    /// Stop accepting new connections. Relays already running end with the
    /// SSH session that carries them.
    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        // Wake the blocking accept so the listener thread sees the flag.
        let _ = TcpStream::connect_timeout(
            &SocketAddr::from(([127, 0, 0, 1], self.local_port)),
            Duration::from_millis(200),
        );
    }

    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.local_port)
    }
}

/// Reserve a free loopback port for OpenSSH's `-D` listener.
pub fn free_loopback_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("allocate the SSH tunnel port: {error}"))
}

/// Open a SOCKS5 `CONNECT host:port` through OpenSSH's dynamic forward.
pub fn socks5_connect(socks_port: u16, host: &str, port: u16) -> io::Result<TcpStream> {
    let mut stream = TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], socks_port)),
        HANDSHAKE_TIMEOUT,
    )?;
    stream.set_read_timeout(Some(HANDSHAKE_TIMEOUT))?;
    stream.set_nodelay(true)?;
    stream.write_all(&socks5_greeting())?;
    let mut choice = [0_u8; 2];
    stream.read_exact(&mut choice)?;
    if choice != [5, 0] {
        return Err(io::Error::other(
            "the SSH tunnel refused the SOCKS greeting",
        ));
    }
    stream.write_all(&socks5_connect_request(host, port)?)?;
    let mut head = [0_u8; 4];
    stream.read_exact(&mut head)?;
    if head[0] != 5 || head[1] != 0 {
        return Err(io::Error::other(format!(
            "the SSH tunnel could not reach {host}:{port} (SOCKS reply {})",
            head[1]
        )));
    }
    let address_len = match head[3] {
        1 => 4,
        4 => 16,
        3 => {
            let mut len = [0_u8; 1];
            stream.read_exact(&mut len)?;
            usize::from(len[0])
        }
        _ => {
            return Err(io::Error::other(
                "the SSH tunnel sent an invalid SOCKS reply",
            ))
        }
    };
    let mut bound = vec![0_u8; address_len + 2];
    stream.read_exact(&mut bound)?;
    stream.set_read_timeout(None)?;
    Ok(stream)
}

fn socks5_greeting() -> [u8; 3] {
    // Version 5, one method, "no authentication": the listener is loopback-only.
    [5, 1, 0]
}

/// `CONNECT` to a domain name, so OpenSSH resolves it on the remote side.
pub fn socks5_connect_request(host: &str, port: u16) -> io::Result<Vec<u8>> {
    let name = host.as_bytes();
    let len = u8::try_from(name.len())
        .ok()
        .filter(|len| *len > 0)
        .ok_or_else(|| io::Error::other("invalid forward host"))?;
    let mut request = vec![5, 1, 0, 3, len];
    request.extend_from_slice(name);
    request.extend_from_slice(&port.to_be_bytes());
    Ok(request)
}

/// Listen on a loopback port (the preferred one when it is free) and relay
/// every connection to `remote_host:remote_port` through the session's SOCKS
/// listener.
pub fn start_forward(
    socks_port: u16,
    remote_host: &str,
    remote_port: u16,
    preferred_local_port: Option<u16>,
) -> Result<LocalForward, String> {
    let listener = preferred_local_port
        .filter(|port| *port != 0)
        .and_then(|port| TcpListener::bind(("127.0.0.1", port)).ok())
        .map(Ok)
        .unwrap_or_else(|| TcpListener::bind(("127.0.0.1", 0)))
        .map_err(|error| format!("open a local tunnel port: {error}"))?;
    let local_port = listener
        .local_addr()
        .map_err(|error| format!("read the local tunnel port: {error}"))?
        .port();
    let stop = Arc::new(AtomicBool::new(false));
    let accept_stop = stop.clone();
    let host = remote_host.to_string();
    thread::spawn(move || {
        for incoming in listener.incoming() {
            if accept_stop.load(Ordering::SeqCst) {
                break;
            }
            let Ok(client) = incoming else { continue };
            let host = host.clone();
            thread::spawn(move || relay(client, socks_port, &host, remote_port));
        }
    });
    Ok(LocalForward {
        local_port,
        remote_host: remote_host.to_string(),
        remote_port,
        stop,
    })
}

fn relay(client: TcpStream, socks_port: u16, host: &str, port: u16) {
    let Ok(upstream) = socks5_connect(socks_port, host, port) else {
        let _ = client.shutdown(Shutdown::Both);
        return;
    };
    let _ = client.set_nodelay(true);
    let (Ok(mut client_read), Ok(mut upstream_write)) = (client.try_clone(), upstream.try_clone())
    else {
        return;
    };
    let mut upstream_read = upstream;
    let mut client_write = client;
    let outbound = thread::spawn(move || {
        let _ = io::copy(&mut client_read, &mut upstream_write);
        let _ = upstream_write.shutdown(Shutdown::Write);
    });
    let _ = io::copy(&mut upstream_read, &mut client_write);
    let _ = client_write.shutdown(Shutdown::Both);
    let _ = outbound.join();
}

/// Prove the tunnel end to end: through the local listener, the SOCKS relay,
/// the SSH channel, to the remote service, which must answer HTTP.
pub fn verify_http(local_port: u16) -> Result<(), String> {
    let mut stream = TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], local_port)),
        HANDSHAKE_TIMEOUT,
    )
    .map_err(|error| format!("connect to the local tunnel: {error}"))?;
    stream
        .set_read_timeout(Some(HANDSHAKE_TIMEOUT))
        .map_err(|error| format!("configure the tunnel check: {error}"))?;
    stream
        .write_all(b"GET / HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| format!("send the tunnel check: {error}"))?;
    let mut head = [0_u8; 5];
    let mut read = 0;
    while read < head.len() {
        match stream.read(&mut head[read..]) {
            Ok(0) => break,
            Ok(count) => read += count,
            Err(error) => return Err(format!("read the tunnel check: {error}")),
        }
    }
    if &head[..read] == b"HTTP/" {
        Ok(())
    } else {
        Err("nothing answered on the remote port through the tunnel".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal SOCKS5 server that records the CONNECT target and then
    /// splices to a local "remote service" — stands in for OpenSSH `-D`.
    fn fake_socks(target_port: u16) -> (u16, std::sync::mpsc::Receiver<(String, u16)>) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let (sender, receiver) = std::sync::mpsc::channel();
        thread::spawn(move || {
            for incoming in listener.incoming() {
                let mut client = incoming.unwrap();
                let sender = sender.clone();
                thread::spawn(move || {
                    let mut greeting = [0_u8; 3];
                    client.read_exact(&mut greeting).unwrap();
                    client.write_all(&[5, 0]).unwrap();
                    let mut head = [0_u8; 5];
                    client.read_exact(&mut head).unwrap();
                    let mut name = vec![0_u8; usize::from(head[4])];
                    client.read_exact(&mut name).unwrap();
                    let mut port = [0_u8; 2];
                    client.read_exact(&mut port).unwrap();
                    sender
                        .send((String::from_utf8(name).unwrap(), u16::from_be_bytes(port)))
                        .unwrap();
                    client.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).unwrap();
                    let upstream = TcpStream::connect(("127.0.0.1", target_port)).unwrap();
                    let mut up_read = upstream.try_clone().unwrap();
                    let mut up_write = upstream;
                    let mut client_read = client.try_clone().unwrap();
                    thread::spawn(move || {
                        let _ = io::copy(&mut client_read, &mut up_write);
                    });
                    let _ = io::copy(&mut up_read, &mut client);
                });
            }
        });
        (port, receiver)
    }

    fn fake_http_service() -> u16 {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            for incoming in listener.incoming() {
                let mut stream = incoming.unwrap();
                let mut buffer = [0_u8; 512];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(b"HTTP/1.0 200 OK\r\nContent-Length: 2\r\n\r\nok");
            }
        });
        port
    }

    #[test]
    fn connect_request_names_the_remote_host_for_remote_resolution() {
        assert_eq!(
            socks5_connect_request("127.0.0.1", 17800).unwrap(),
            [&[5, 1, 0, 3, 9][..], b"127.0.0.1", &[0x45, 0x88]].concat()
        );
        assert!(socks5_connect_request("", 1).is_err());
    }

    #[test]
    fn forward_relays_through_socks_to_the_remote_loopback_and_verifies() {
        let service = fake_http_service();
        let (socks, targets) = fake_socks(service);
        let forward = start_forward(socks, "127.0.0.1", 17800, None).unwrap();
        verify_http(forward.local_port).unwrap();
        assert_eq!(targets.recv().unwrap(), ("127.0.0.1".to_string(), 17800));
        assert_eq!(
            forward.url(),
            format!("http://127.0.0.1:{}", forward.local_port)
        );
        forward.stop();
    }

    #[test]
    fn forward_reuses_a_free_preferred_port() {
        let service = fake_http_service();
        let (socks, _targets) = fake_socks(service);
        let preferred = free_loopback_port().unwrap();
        let forward = start_forward(socks, "127.0.0.1", 17800, Some(preferred)).unwrap();
        assert_eq!(forward.local_port, preferred);
        forward.stop();
    }

    #[test]
    fn verification_fails_when_the_tunnel_has_no_service_behind_it() {
        // A SOCKS listener that accepts and immediately hangs up, as OpenSSH
        // does when the remote port refuses the channel.
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let socks = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            for incoming in listener.incoming() {
                drop(incoming);
            }
        });
        let forward = start_forward(socks, "127.0.0.1", 17800, None).unwrap();
        assert!(verify_http(forward.local_port).is_err());
        forward.stop();
    }
}

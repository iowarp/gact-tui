//! The desktop's place in an attached server's client count.
//!
//! A CLIO server started by a Python script stops when its last attached client
//! leaves (clio-agent `gact/attached_clients.py`). The desktop that attaches to
//! such a server registers as one of its clients, with its own process id, so the
//! server keeps running after the script ends; it releases the registration when
//! it quits. If the desktop dies instead, the server notices the process is gone
//! and drops it. A server the desktop spawned itself is the desktop's to stop, so
//! only an attached server is registered with.
//!
//! An older server without the count answers 404: the desktop attaches as before
//! and the boot log says the server does not count its clients.

use std::time::Duration;

use crate::supervisor_boot_log::boot_log_line;

const CLIENTS_PATH: &str = "/v1/server/clients";
const LEASE_TIMEOUT: Duration = Duration::from_secs(5);

/// One registration with an attached server's client count.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClientLease {
    pub url: String,
    pub bearer_token: String,
    pub client_id: String,
}

fn authorized(request: ureq::Request, bearer_token: &str) -> ureq::Request {
    if bearer_token.is_empty() {
        request
    } else {
        request.set("Authorization", &format!("Bearer {bearer_token}"))
    }
}

/// Register this desktop with the server at `url`; `None` when it does not count
/// clients (404) or could not be reached (logged, never fatal to attaching).
pub fn register(url: &str, bearer_token: &str) -> Option<ClientLease> {
    let body = serde_json::json!({
        "kind": "desktop",
        "pid": std::process::id(),
        "label": "CLIO Desktop",
    })
    .to_string();
    let request = ureq::post(&format!("{url}{CLIENTS_PATH}"))
        .timeout(LEASE_TIMEOUT)
        .set("Content-Type", "application/json");
    match authorized(request, bearer_token).send_string(&body) {
        Ok(response) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&response.into_string().ok()?).ok()?;
            let client_id = parsed.get("client_id")?.as_str()?.to_string();
            let attached = parsed.get("attached").and_then(|v| v.as_i64()).unwrap_or(0);
            boot_log_line(&format!(
                "registered with the attached backend as client {client_id} ({attached} attached)"
            ));
            Some(ClientLease {
                url: url.to_string(),
                bearer_token: bearer_token.to_string(),
                client_id,
            })
        }
        Err(ureq::Error::Status(404, _)) => {
            boot_log_line(
                "the attached backend does not count its clients; attached without a lease",
            );
            None
        }
        Err(error) => {
            boot_log_line(&format!(
                "warning: could not register with the attached backend ({error}); \
                 a server a script started may stop when that script ends"
            ));
            None
        }
    }
}

/// Release `lease`; returns how many clients remain attached, when the server said.
pub fn release(lease: &ClientLease) -> Option<i64> {
    let request = ureq::delete(&format!("{}{CLIENTS_PATH}/{}", lease.url, lease.client_id))
        .timeout(LEASE_TIMEOUT);
    match authorized(request, &lease.bearer_token).call() {
        Ok(response) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&response.into_string().ok()?).ok()?;
            let remaining = parsed.get("attached").and_then(|v| v.as_i64());
            boot_log_line(&format!(
                "released client {} from the attached backend ({} attached)",
                lease.client_id,
                remaining.map_or("unknown".to_string(), |n| n.to_string())
            ));
            remaining
        }
        Err(error) => {
            // The server may already be gone; its own pruning covers a lost release.
            boot_log_line(&format!(
                "warning: could not release client {} ({error}); the backend drops it \
                 when this process exits",
                lease.client_id
            ));
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::thread;

    /// Answer one request with `status` and `body`; return the request line, headers and body.
    fn serve_once(status: &str, body: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let url = format!("http://{}", listener.local_addr().expect("addr"));
        let status = status.to_string();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut reader = BufReader::new(stream.try_clone().expect("clone"));
            let mut request = String::new();
            let mut length = 0usize;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).expect("read");
                if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    length = value.trim().parse().unwrap_or(0);
                }
                request.push_str(&line);
                if line == "\r\n" || line.is_empty() {
                    break;
                }
            }
            let mut payload = vec![0u8; length];
            reader.read_exact(&mut payload).expect("body");
            request.push_str(&String::from_utf8_lossy(&payload));
            let reply = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(reply.as_bytes()).expect("write");
            request
        });
        (url, handle)
    }

    #[test]
    fn an_attached_server_counts_the_desktop_with_its_pid() {
        let (url, server) = serve_once("201 Created", r#"{"client_id":"client_7","attached":2}"#);
        let lease = register(&url, "tok").expect("a lease");
        let request = server.join().expect("server");
        assert_eq!(lease.client_id, "client_7");
        assert!(request.starts_with("POST /v1/server/clients "));
        assert!(
            request.contains("Authorization: Bearer tok")
                || request.contains("authorization: Bearer tok")
        );
        assert!(request.contains(r#""kind":"desktop""#));
        assert!(request.contains(&format!(r#""pid":{}"#, std::process::id())));
    }

    #[test]
    fn a_server_without_the_count_attaches_without_a_lease() {
        let (url, server) = serve_once("404 Not Found", r#"{"detail":"Not Found"}"#);
        assert_eq!(register(&url, ""), None);
        server.join().expect("server");
    }

    #[test]
    fn quitting_releases_the_lease() {
        let (url, server) = serve_once("200 OK", r#"{"attached":0,"stopping":true}"#);
        let lease = ClientLease {
            url,
            bearer_token: String::new(),
            client_id: "client_7".into(),
        };
        assert_eq!(release(&lease), Some(0));
        assert!(server
            .join()
            .expect("server")
            .starts_with("DELETE /v1/server/clients/client_7 "));
    }
}

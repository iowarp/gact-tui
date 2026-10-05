//! Private, one-shot browser returns on the user's computer, including remote CLIO sessions.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct Pending {
    listener: Mutex<Option<TcpListener>>,
    cancelled: AtomicBool,
    redirect: String,
}

#[derive(Default)]
pub struct StorageOAuth(Mutex<HashMap<String, Arc<Pending>>>);

#[derive(Serialize)]
pub struct BrowserReturn {
    id: String,
    redirect_uri: String,
}

#[tauri::command]
pub fn storage_oauth_listen(
    provider: String,
    registry: tauri::State<'_, StorageOAuth>,
) -> Result<BrowserReturn, String> {
    if provider != "google_drive" && provider != "globus" {
        return Err("Unsupported sign-in provider".into());
    }
    let listener = TcpListener::bind(if provider == "globus" {
        "127.0.0.1:48173"
    } else {
        "127.0.0.1:0"
    })
    .map_err(|_| "Could not receive browser sign-in; close an existing sign-in and try again")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "Could not prepare browser sign-in")?;
    let port = listener
        .local_addr()
        .map_err(|_| "Could not prepare browser sign-in")?
        .port();
    let host = if provider == "globus" {
        "localhost"
    } else {
        "127.0.0.1"
    };
    let redirect = format!("http://{host}:{port}/clio-storage-return");
    let id = hex::encode(rand::random::<[u8; 32]>());
    let mut pending = registry.0.lock().map_err(|_| "Sign-in state unavailable")?;
    if pending.len() >= 8 {
        return Err("Finish or cancel an existing sign-in".into());
    }
    pending.insert(
        id.clone(),
        Arc::new(Pending {
            listener: Mutex::new(Some(listener)),
            cancelled: AtomicBool::new(false),
            redirect: redirect.clone(),
        }),
    );
    Ok(BrowserReturn {
        id,
        redirect_uri: redirect,
    })
}

fn callback(redirect: &str, request: &str, expected_state: &str) -> Option<String> {
    let line = request.lines().next()?;
    let mut pieces = line.split_whitespace();
    if pieces.next()? != "GET" {
        return None;
    }
    let path = pieces.next()?;
    if !path.starts_with("/clio-storage-return?") {
        return None;
    }
    let address = format!(
        "{}{}",
        redirect.trim_end_matches("/clio-storage-return"),
        path
    );
    let url = tauri::Url::parse(&address).ok()?;
    let states: Vec<_> = url
        .query_pairs()
        .filter(|(key, _)| key == "state")
        .collect();
    if states.len() != 1 || states[0].1 != expected_state {
        return None;
    }
    if !url
        .query_pairs()
        .any(|(key, _)| key == "code" || key == "error")
    {
        return None;
    }
    Some(address)
}

fn receive(pending: Arc<Pending>, expected_state: String) -> Result<String, String> {
    let listener = pending
        .listener
        .lock()
        .map_err(|_| "Sign-in state unavailable")?
        .take()
        .ok_or("This browser return has already been received")?;
    let deadline = Instant::now() + Duration::from_secs(600);
    while Instant::now() < deadline && !pending.cancelled.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                let mut request = Vec::new();
                let mut block = [0u8; 1024];
                while request.len() < 16384
                    && !request.windows(4).any(|part| part == b"\r\n\r\n")
                    && Instant::now() < deadline
                    && !pending.cancelled.load(Ordering::Relaxed)
                {
                    match stream.read(&mut block) {
                        Ok(0) | Err(_) => break,
                        Ok(count) => request.extend_from_slice(&block[..count]),
                    }
                }
                let result = std::str::from_utf8(&request)
                    .ok()
                    .and_then(|text| callback(&pending.redirect, text, &expected_state));
                let (status, body) = if result.is_some() {
                    (
                        "200 OK",
                        "You can return to CLIO. This window can be closed.",
                    )
                } else {
                    (
                        "400 Bad Request",
                        "This sign-in return is not valid. Return to CLIO and try again.",
                    )
                };
                let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                let _ = stream.write_all(response.as_bytes());
                if let Some(address) = result {
                    return Ok(address);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(_) => return Err("Could not receive browser sign-in".into()),
        }
    }
    Err("Sign-in cancelled or expired. Try again.".into())
}

#[tauri::command]
pub async fn storage_oauth_receive(
    id: String,
    expected_state: String,
    registry: tauri::State<'_, StorageOAuth>,
) -> Result<String, String> {
    if expected_state.len() < 16 || expected_state.len() > 512 {
        return Err("Invalid sign-in state".into());
    }
    let pending = registry
        .0
        .lock()
        .map_err(|_| "Sign-in state unavailable")?
        .get(&id)
        .cloned()
        .ok_or("Sign-in expired")?;
    let result = tauri::async_runtime::spawn_blocking(move || receive(pending, expected_state))
        .await
        .map_err(|_| "Browser sign-in stopped".to_string());
    registry
        .0
        .lock()
        .map_err(|_| "Sign-in state unavailable")?
        .remove(&id);
    result?
}

#[tauri::command]
pub fn storage_oauth_cancel(
    id: String,
    registry: tauri::State<'_, StorageOAuth>,
) -> Result<(), String> {
    if let Some(pending) = registry
        .0
        .lock()
        .map_err(|_| "Sign-in state unavailable")?
        .remove(&id)
    {
        pending.cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpStream;

    fn pending_receiver() -> Arc<Pending> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let redirect = format!(
            "http://{}/clio-storage-return",
            listener.local_addr().unwrap()
        );
        Arc::new(Pending {
            listener: Mutex::new(Some(listener)),
            cancelled: AtomicBool::new(false),
            redirect,
        })
    }

    #[test]
    fn browser_return_is_received_once_without_reflecting_the_code() {
        let pending = pending_receiver();
        let address = tauri::Url::parse(&pending.redirect).unwrap();
        let receiver = pending.clone();
        let task = std::thread::spawn(move || receive(receiver, "expected-state-123".into()));
        let mut socket = TcpStream::connect(("127.0.0.1", address.port().unwrap())).unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        socket.write_all(b"GET /clio-storage-return?state=expected-state-123&code=private-code HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
        let mut response = String::new();
        socket.read_to_string(&mut response).unwrap();
        assert!(response.starts_with("HTTP/1.1 200 OK"));
        assert!(!response.contains("private-code"));
        assert!(task.join().unwrap().unwrap().contains("code=private-code"));
        assert!(receive(pending, "expected-state-123".into())
            .unwrap_err()
            .contains("already"));
    }

    #[test]
    fn cancelling_releases_the_listener() {
        let pending = pending_receiver();
        let address = pending
            .listener
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .local_addr()
            .unwrap();
        pending.cancelled.store(true, Ordering::Relaxed);
        assert!(receive(pending, "expected-state-123".into()).is_err());
        assert!(TcpListener::bind(address).is_ok());
    }
    #[test]
    fn only_the_bound_browser_return_is_accepted() {
        let redirect = "http://127.0.0.1:48173/clio-storage-return";
        assert!(callback(
            redirect,
            "GET /clio-storage-return?state=expected&code=private HTTP/1.1\r\n\r\n",
            "expected"
        )
        .is_some());
        for query in [
            "state=other&code=private",
            "state=expected&state=other&code=private",
            "state=expected",
        ] {
            assert!(callback(
                redirect,
                &format!("GET /clio-storage-return?{query} HTTP/1.1\r\n\r\n"),
                "expected"
            )
            .is_none());
        }
        assert!(callback(
            redirect,
            "GET /other?state=expected&code=private HTTP/1.1",
            "expected"
        )
        .is_none());
    }
}

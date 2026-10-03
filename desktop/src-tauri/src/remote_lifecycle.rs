//! Ask the local controller to stop only this Desktop's remote launches before
//! closing its SSH bridges. Service drivers and ownership checks stay in CLIO.

use std::time::Duration;

pub struct DesktopDeploymentOwner(pub String);

#[tauri::command]
pub fn desktop_deployment_owner(owner: tauri::State<'_, DesktopDeploymentOwner>) -> String {
    owner.0.clone()
}

pub fn stop_remote_agents(
    base_url: &str,
    bearer_token: &str,
    desktop_id: &str,
) -> Result<(), String> {
    if base_url.is_empty() || bearer_token.is_empty() {
        return Ok(());
    }
    let endpoint = format!(
        "{}/v1/infrastructure/desktop-exit",
        base_url.trim_end_matches('/')
    );
    let body = serde_json::json!({"desktop_id": desktop_id}).to_string();
    let response = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(2))
        .timeout_read(Duration::from_secs(180))
        .build()
        .post(&endpoint)
        .set("Authorization", &format!("Bearer {bearer_token}"))
        .set("Content-Type", "application/json")
        .send_string(&body);
    match response {
        // An older controller has no ownership records to clean up.
        Err(ureq::Error::Status(404, _)) => Ok(()),
        Err(error) => Err(format!("Remote agent shutdown failed: {error}")),
        Ok(response) => {
            let text = response.into_string().map_err(|error| error.to_string())?;
            let result: serde_json::Value =
                serde_json::from_str(&text).map_err(|error| error.to_string())?;
            match result.get("failures").and_then(|value| value.as_array()) {
                Some(failures) if failures.is_empty() => Ok(()),
                _ => Err(format!("Remote agent shutdown incomplete: {text}")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn respond(status: &str, body: &str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let reply = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let worker = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 1024];
            loop {
                let count = socket.read(&mut chunk).unwrap();
                request.extend_from_slice(&chunk[..count]);
                let text = String::from_utf8_lossy(&request);
                if text.contains("{\"desktop_id\":\"desktop-test\"}") {
                    break;
                }
                assert!(count > 0);
            }
            socket.write_all(reply.as_bytes()).unwrap();
            String::from_utf8(request).unwrap()
        });
        (url, worker)
    }

    #[test]
    fn exit_authenticates_and_scopes_cleanup_to_this_desktop() {
        let (url, worker) = respond("200 OK", "{\"failures\":[]}");
        assert!(stop_remote_agents(&url, "secret", "desktop-test").is_ok());
        let request = worker.join().unwrap();
        assert!(request.starts_with("POST /v1/infrastructure/desktop-exit "));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer secret"));
    }

    #[test]
    fn exit_reports_incomplete_remote_cleanup() {
        let (url, worker) = respond("200 OK", "{\"failures\":[\"SSH disconnected\"]}");
        assert!(stop_remote_agents(&url, "secret", "desktop-test")
            .unwrap_err()
            .contains("SSH disconnected"));
        worker.join().unwrap();
    }

    #[test]
    fn exit_accepts_a_legacy_controller_without_remote_ownership() {
        let (url, worker) = respond("404 Not Found", "{}");
        assert!(stop_remote_agents(&url, "secret", "desktop-test").is_ok());
        worker.join().unwrap();
    }
}

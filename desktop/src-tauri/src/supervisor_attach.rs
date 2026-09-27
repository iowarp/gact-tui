use std::{env, path::Path, time::Duration};

use crate::brand_backend::brand_backend;
use crate::clio_core_registry;
use crate::supervisor_attach_token::{
    attach_credential, probe_attach_check, url_port, AttachCheck, AttachCredential,
};
use crate::supervisor_boot_log::boot_log_line;
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Fast probe used during the attach-first check.
const ATTACH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// One-shot probe of the brand's conventional attach port. When an answer
/// comes back with a contract_version, returns a handle carrying the bearer
/// token that server enforces, read from the credential record it publishes
/// (`supervisor_attach_token`). Without a usable record the desktop asks the
/// server (`GET /v1/desktop/attach`); only a 401 there gets the typed
/// `AuthUnavailable` status (clio-agent#1478): loopback HTTP works without a
/// token, but the SSH transport socket does not.
/// Any other outcome returns None and the caller falls back to spawning a
/// fresh sidecar (managed mode) or surfacing the connect-mode error.
///
/// The attach URL/port and the env vars that override them are brand-driven
/// (`attach_url_env`, then `attach_port_env`, then `attach_port`): the neutral
/// default uses `GACT_URL`/`GACT_PORT`/:17800, a managed brand its own
/// convention (e.g. clio-agent's `CLIO_*`).
pub fn try_attach_existing() -> Option<BackendHandle> {
    let bb = brand_backend();
    let url = env::var(&bb.attach_url_env)
        .ok()
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let port = env::var(&bb.attach_port_env)
                .ok()
                .and_then(|s| s.parse::<u16>().ok())
                .unwrap_or(bb.attach_port);
            format!("http://127.0.0.1:{port}")
        });
    let endpoint = format!("{url}/v1/capabilities");
    let resp = ureq::get(&endpoint)
        .timeout(ATTACH_PROBE_TIMEOUT)
        .call()
        .ok()?;
    if resp.status() != 200 {
        return None;
    }
    let body = resp.into_string().ok()?;
    // Cheap shape check — parse the contract_version field. We don't
    // need the full envelope here; the SplashScreen will refetch and
    // gate on it client-side.
    let parsed: serde_json::Value = serde_json::from_str(&body).ok()?;
    parsed.get("contract_version").and_then(|v| v.as_str())?;
    let state_dir = clio_core_registry::runtime_state_dir();
    Some(attached_handle(
        url,
        state_dir.as_deref(),
        probe_attach_check,
    ))
}

/// The handle for a server this desktop attached to: its real token, no token
/// when the server enforces none, or a typed reason why it can't be authenticated.
pub(crate) fn attached_handle(
    url: String,
    state_dir: Option<&Path>,
    probe: impl Fn(&str) -> AttachCheck,
) -> BackendHandle {
    let credential = match url_port(&url) {
        Some(port) => attach_credential(state_dir, port),
        None => Err(format!("its address {url} names no port")),
    };
    match credential {
        Ok(AttachCredential::Token(token)) => BackendHandle {
            url,
            bearer_token: token,
            status: BackendStatus::Ready,
        },
        Ok(AttachCredential::NoneRequired) => BackendHandle {
            url,
            bearer_token: String::new(),
            status: BackendStatus::Ready,
        },
        Err(reason) => {
            let status = match probe(&url) {
                AttachCheck::Open => {
                    boot_log_line(&format!(
                        "attached backend has no credential record ({reason}); \
                         its attach check says no token is enforced"
                    ));
                    BackendStatus::Ready
                }
                AttachCheck::TokenRequired => BackendStatus::AuthUnavailable(format!(
                    "{reason}, and it requires an access token (its attach check answered 401)"
                )),
                AttachCheck::Unknown(answer) => {
                    boot_log_line(&format!(
                        "attached backend has no credential record ({reason}) and no \
                         attach check ({answer}); attaching without a token"
                    ));
                    BackendStatus::Ready
                }
            };
            BackendHandle {
                url,
                bearer_token: String::new(),
                status,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn state_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clio-attach-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("gact-servers")).expect("create state dir");
        dir
    }

    fn never_probed(_url: &str) -> AttachCheck {
        panic!("a usable credential record must not trigger the attach check")
    }

    #[test]
    fn an_attached_server_is_used_with_the_token_it_enforces() {
        let dir = state_dir("token");
        let pid = std::process::id();
        fs::write(
            dir.join("gact-servers").join("17800.json"),
            format!(r#"{{"schema":1,"port":17800,"pid":{pid},"bearer_token":"launcher-token"}}"#),
        )
        .expect("write record");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), never_probed);

        assert_eq!(handle.bearer_token, "launcher-token");
        assert!(matches!(handle.status, BackendStatus::Ready));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_less_server_that_enforces_no_token_attaches() {
        let dir = state_dir("open");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), |_| {
            AttachCheck::Open
        });

        assert!(handle.bearer_token.is_empty());
        assert!(matches!(handle.status, BackendStatus::Ready));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_less_server_that_requires_a_token_is_auth_unavailable() {
        let dir = state_dir("locked");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), |_| {
            AttachCheck::TokenRequired
        });

        match handle.status {
            BackendStatus::AuthUnavailable(reason) => {
                assert!(
                    reason.contains("did not publish its access token"),
                    "{reason}"
                );
                assert!(reason.contains("answered 401"), "{reason}");
            }
            other => panic!("expected auth_unavailable, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_less_server_without_the_check_attaches_as_before() {
        let dir = state_dir("older");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), |_| {
            AttachCheck::Unknown("HTTP 404".into())
        });

        assert!(matches!(handle.status, BackendStatus::Ready));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_probe_reads_the_servers_answer() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        for (status_line, expected) in [
            ("204 No Content", AttachCheck::Open),
            ("401 Unauthorized", AttachCheck::TokenRequired),
            ("404 Not Found", AttachCheck::Unknown("HTTP 404".into())),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
            let url = format!("http://{}", listener.local_addr().expect("addr"));
            let reply =
                format!("HTTP/1.1 {status_line}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("accept");
                let mut request = [0_u8; 1024];
                let read = stream.read(&mut request).expect("read");
                let head = String::from_utf8_lossy(&request[..read]).to_string();
                stream.write_all(reply.as_bytes()).expect("reply");
                head
            });

            assert_eq!(probe_attach_check(&url), expected, "{status_line}");
            let head = server.join().expect("server");
            assert!(head.starts_with("GET /v1/desktop/attach "), "{head}");
            assert!(
                !head.to_ascii_lowercase().contains("authorization:"),
                "{head}"
            );
        }
    }
}

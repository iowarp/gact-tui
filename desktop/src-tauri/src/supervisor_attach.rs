use std::{env, path::Path, time::Duration};

use crate::brand_backend::brand_backend;
use crate::clio_core_registry;
use crate::supervisor_attach_token::{attach_credential, url_port, AttachCredential};
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Fast probe used during the attach-first check.
const ATTACH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// One-shot probe of the brand's conventional attach port. When an answer
/// comes back with a contract_version, returns a handle carrying the bearer
/// token that server enforces, read from the credential record it publishes
/// (`supervisor_attach_token`). A server whose token can't be read gets a
/// typed `AuthUnavailable` status instead of an empty token (clio-agent#1478):
/// loopback HTTP works without one, but the SSH transport socket does not.
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
    Some(attached_handle(url, state_dir.as_deref()))
}

/// The handle for a server this desktop attached to: its real token, or a
/// typed reason why it can't be authenticated.
pub(crate) fn attached_handle(url: String, state_dir: Option<&Path>) -> BackendHandle {
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
        Err(reason) => BackendHandle {
            url,
            bearer_token: String::new(),
            status: BackendStatus::AuthUnavailable(reason),
        },
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

    #[test]
    fn an_attached_server_is_used_with_the_token_it_enforces() {
        let dir = state_dir("token");
        let pid = std::process::id();
        fs::write(
            dir.join("gact-servers").join("17800.json"),
            format!(r#"{{"schema":1,"port":17800,"pid":{pid},"bearer_token":"launcher-token"}}"#),
        )
        .expect("write record");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir));

        assert_eq!(handle.bearer_token, "launcher-token");
        assert!(matches!(handle.status, BackendStatus::Ready));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_attached_server_without_a_record_is_auth_unavailable_not_ready() {
        let dir = state_dir("missing");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir));

        assert!(handle.bearer_token.is_empty());
        match handle.status {
            BackendStatus::AuthUnavailable(reason) => {
                assert!(
                    reason.contains("did not publish its access token"),
                    "{reason}"
                )
            }
            other => panic!("expected auth_unavailable, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }
}

use std::{path::Path, time::Duration};

use crate::clio_core_registry;
use crate::supervisor_attach_owner::listener_belongs_to_this_user;
use crate::supervisor_attach_token::{attach_credential, url_port, AttachCredential};
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Fast probe used during the attach-first check.
const ATTACH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// One-shot probe of the brand's conventional attach port. When an answer
/// comes back with a contract_version, returns a handle for it: `Ready` with
/// the bearer token the server enforces, read from the owner-only credential
/// record it publishes (`supervisor_attach_token`), or the typed
/// `AuthUnavailable` status when this desktop cannot confirm the server is its
/// user's own (clio-agent#1478). Any other outcome returns None and the caller
/// falls back to spawning a fresh sidecar (managed mode) or surfacing the
/// connect-mode error.
///
/// The attach URL is the brand's URL override, else the agent's configured port
/// (`agent_port`): the user's agent config, its env override, then the brand default.
pub fn try_attach_existing() -> Option<BackendHandle> {
    let url = crate::agent_port::agent_endpoint();
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
        listener_belongs_to_this_user,
    ))
}

/// Whether `url` names this computer's loopback interface.
fn is_loopback_url(url: &str) -> bool {
    let authority = url.split("://").nth(1).unwrap_or(url);
    let authority = authority.split('/').next().unwrap_or(authority);
    let host = authority
        .rsplit_once(':')
        .map_or(authority, |(host, _)| host)
        .trim_start_matches('[')
        .trim_end_matches(']');
    host == "localhost" || host == "::1" || host.starts_with("127.")
}

/// The handle for a server this desktop attached to but did not spawn.
///
/// Every account on the computer can listen on loopback, so the server must be
/// confirmed as this user's own before the desktop uses it: on loopback its
/// listening socket must belong to this user (`owner`, checked where the
/// platform allows), and it must have published an owner-only credential
/// record naming a running process. A server that fails either is not used;
/// its status is `AuthUnavailable` with the reason, and no token is handed out.
pub(crate) fn attached_handle(
    url: String,
    state_dir: Option<&Path>,
    owner: impl Fn(u16) -> Result<(), String>,
) -> BackendHandle {
    let credential = match url_port(&url) {
        Some(port) if is_loopback_url(&url) => {
            owner(port).and_then(|()| attach_credential(state_dir, port))
        }
        Some(port) => attach_credential(state_dir, port),
        None => Err(format!("its address {url} names no port")),
    };
    let (bearer_token, status) = match credential {
        Ok(AttachCredential::Token(token)) => (token, BackendStatus::Ready),
        Ok(AttachCredential::NoneRequired) => (String::new(), BackendStatus::Ready),
        Err(reason) => (
            String::new(),
            BackendStatus::AuthUnavailable(format!(
                "{reason}, so this desktop cannot confirm it is your own server"
            )),
        ),
    };
    BackendHandle {
        url,
        bearer_token,
        status,
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

    fn owned(_port: u16) -> Result<(), String> {
        Ok(())
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

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), owned);

        assert_eq!(handle.bearer_token, "launcher-token");
        assert!(matches!(handle.status, BackendStatus::Ready));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_less_server_is_not_used() {
        let dir = state_dir("record-less");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), owned);

        assert!(handle.bearer_token.is_empty());
        match handle.status {
            BackendStatus::AuthUnavailable(reason) => {
                assert!(reason.contains("did not publish its access token"), "{reason}");
                assert!(reason.contains("cannot confirm it is your own"), "{reason}");
            }
            other => panic!("expected auth_unavailable, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn another_accounts_listener_gets_no_token_even_with_a_record() {
        let dir = state_dir("other-account");
        let pid = std::process::id();
        fs::write(
            dir.join("gact-servers").join("17800.json"),
            format!(r#"{{"schema":1,"port":17800,"pid":{pid},"bearer_token":"launcher-token"}}"#),
        )
        .expect("write record");

        let handle = attached_handle("http://127.0.0.1:17800".into(), Some(&dir), |port| {
            Err(format!("the server listening on port {port} belongs to another account"))
        });

        assert!(handle.bearer_token.is_empty());
        assert!(matches!(handle.status, BackendStatus::AuthUnavailable(_)));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn loopback_urls_are_recognised() {
        assert!(is_loopback_url("http://127.0.0.1:17800"));
        assert!(is_loopback_url("http://localhost:17800/"));
        assert!(is_loopback_url("http://[::1]:17800"));
        assert!(!is_loopback_url("https://clio.lab.example:17800"));
    }
}

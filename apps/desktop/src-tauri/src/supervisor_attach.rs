use std::{env, time::Duration};

use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Port the upstream `clio` installer binds by default. If a server is
/// answering here we attach to it instead of spawning a competing one
/// — the user's existing config (CLIO_LM_PROVIDER=alcf etc.) is then
/// honored automatically.
const ATTACH_DEFAULT_PORT: u16 = 17800;
/// Env var that overrides the attach-port — matches the upstream
/// `clio.{ps1,sh}` launcher convention.
const ATTACH_PORT_ENV: &str = "CLIO_PORT";
/// Env var that overrides the attach target with a full local backend URL.
/// This mirrors the TUI/web test convention and lets native smoke tests bind
/// to an owned CLIO without occupying the user's conventional `:17800`.
const ATTACH_URL_ENV: &str = "CLIO_GACT_URL";
/// Fast probe used during the attach-first check.
const ATTACH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// One-shot probe of the conventional clio port. Returns a Ready
/// handle (with an empty bearer token — the server's trust_socket auth
/// scheme accepts localhost requests on its own) when an answer comes
/// back with a contract_version. Any other outcome returns None and the
/// caller falls back to spawning a fresh sidecar.
///
/// Honors `$CLIO_GACT_URL` when set, then `$CLIO_PORT` (matching the upstream
/// `clio` launcher convention), before falling back to the documented :17800
/// default.
pub fn try_attach_existing() -> Option<BackendHandle> {
    let url = env::var(ATTACH_URL_ENV)
        .ok()
        .map(|s| s.trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            let port = env::var(ATTACH_PORT_ENV)
                .ok()
                .and_then(|s| s.parse::<u16>().ok())
                .unwrap_or(ATTACH_DEFAULT_PORT);
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
    Some(BackendHandle {
        url,
        bearer_token: String::new(),
        status: BackendStatus::Ready,
    })
}

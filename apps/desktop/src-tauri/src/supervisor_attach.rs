use std::{env, time::Duration};

use crate::brand_backend::brand_backend;
use crate::supervisor_types::{BackendHandle, BackendStatus};

/// Fast probe used during the attach-first check.
const ATTACH_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// One-shot probe of the brand's conventional attach port. Returns a Ready
/// handle (with an empty bearer token — the server's trust_socket auth
/// scheme accepts localhost requests on its own) when an answer comes
/// back with a contract_version. Any other outcome returns None and the
/// caller falls back to spawning a fresh sidecar (managed mode) or surfacing
/// the connect-mode error.
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
    Some(BackendHandle {
        url,
        bearer_token: String::new(),
        status: BackendStatus::Ready,
    })
}

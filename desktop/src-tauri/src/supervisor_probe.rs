//! Readiness probe: the "probe" stage of the sidecar lifecycle.
//!
//! After spawn, polls `/v1/capabilities` until it returns 200 (or a
//! timeout) so boot only reports `Ready` once the sidecar truly serves.

use std::{
    thread,
    time::{Duration, Instant},
};

/// Maximum time to wait for /v1/capabilities to return 200 before
/// declaring the sidecar broken.
///
/// The bundle must be prepared during packaging/installation so opening the
/// desktop does not turn into an installation step. Thirty seconds is a
/// failure boundary, not a normal startup budget.
const CAPABILITIES_TIMEOUT: Duration = Duration::from_secs(30);
/// Health-poll cadence while waiting for capabilities.
const POLL_INTERVAL: Duration = Duration::from_millis(200);
/// Per-request timeout for one capabilities probe. Short because the sidecar
/// is local: a request that has not answered by now is a stalled attempt, and
/// the next poll is cheaper than waiting on it.
const PROBE_REQUEST_TIMEOUT: Duration = Duration::from_millis(800);

pub(crate) fn probe_capabilities(url: &str, token: &str) -> Result<(), String> {
    let endpoint = format!("{url}/v1/capabilities");
    let auth = format!("Bearer {token}");
    let start = Instant::now();
    let mut last_err = String::from("no probe attempted");
    while start.elapsed() < CAPABILITIES_TIMEOUT {
        match ureq::get(&endpoint)
            .set("Authorization", &auth)
            .timeout(PROBE_REQUEST_TIMEOUT)
            .call()
        {
            Ok(resp) if resp.status() == 200 => return Ok(()),
            Ok(resp) => last_err = format!("/v1/capabilities returned {}", resp.status()),
            Err(e) => last_err = format!("/v1/capabilities probe: {e}"),
        }
        thread::sleep(POLL_INTERVAL);
    }
    Err(format!(
        "sidecar did not report ready within {}s: {}",
        CAPABILITIES_TIMEOUT.as_secs(),
        last_err
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_startup_does_not_hide_installation_work() {
        assert_eq!(CAPABILITIES_TIMEOUT, Duration::from_secs(30));
    }
}

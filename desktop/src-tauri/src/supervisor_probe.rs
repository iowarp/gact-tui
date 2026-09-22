//! Readiness probe: the "probe" stage of the sidecar lifecycle.
//!
//! After spawn, polls `/v1/capabilities` until it returns 200. A slow machine
//! may take arbitrarily long while its boot transcript advances; only a
//! genuine no-progress stall fails the probe.

use std::{
    process::{Child, ExitStatus},
    thread,
    time::{Duration, Instant},
};

use crate::supervisor_boot_log::boot_log_size;

/// Fail only when the managed backend has emitted no startup progress for
/// this long. This is deliberately not a total startup deadline: an HDD or a
/// busy workstation can keep loading for longer without being killed.
const STARTUP_STALL_TIMEOUT: Duration = Duration::from_secs(30);
/// Health-poll cadence while waiting for capabilities.
const POLL_INTERVAL: Duration = Duration::from_millis(200);
/// Per-request timeout for one capabilities probe. Short because the sidecar
/// is local: a request that has not answered by now is a stalled attempt, and
/// the next poll is cheaper than waiting on it.
const PROBE_REQUEST_TIMEOUT: Duration = Duration::from_millis(800);

#[derive(Debug)]
struct StallWatch {
    last_marker: Option<u64>,
    last_progress: Instant,
}

#[derive(Debug)]
pub(crate) enum ProbeError {
    Exited(ExitStatus),
    Failed(String),
}

impl StallWatch {
    fn new(now: Instant, marker: Option<u64>) -> Self {
        Self {
            last_marker: marker,
            last_progress: now,
        }
    }

    fn observe(&mut self, now: Instant, marker: Option<u64>) {
        if marker != self.last_marker {
            self.last_marker = marker;
            self.last_progress = now;
        }
    }

    fn stalled(&self, now: Instant) -> bool {
        now.duration_since(self.last_progress) >= STARTUP_STALL_TIMEOUT
    }
}

pub(crate) fn probe_capabilities(
    url: &str,
    token: &str,
    child: &mut Child,
) -> Result<(), ProbeError> {
    let endpoint = format!("{url}/v1/capabilities");
    let auth = format!("Bearer {token}");
    let mut progress = StallWatch::new(Instant::now(), boot_log_size());
    let mut last_err: String;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Err(ProbeError::Exited(status)),
            Ok(None) => {}
            Err(error) => {
                return Err(ProbeError::Failed(format!(
                    "could not inspect sidecar startup process: {error}"
                )))
            }
        }
        match ureq::get(&endpoint)
            .set("Authorization", &auth)
            .timeout(PROBE_REQUEST_TIMEOUT)
            .call()
        {
            Ok(resp) if resp.status() == 200 => return Ok(()),
            Ok(resp) => last_err = format!("/v1/capabilities returned {}", resp.status()),
            Err(e) => last_err = format!("/v1/capabilities probe: {e}"),
        }
        let now = Instant::now();
        progress.observe(now, boot_log_size());
        if progress.stalled(now) {
            return Err(ProbeError::Failed(format!(
                "sidecar emitted no startup progress for {}s: {}",
                STARTUP_STALL_TIMEOUT.as_secs(),
                last_err
            )));
        }
        thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn advancing_boot_progress_has_no_total_deadline() {
        let start = Instant::now();
        let mut watch = StallWatch::new(start, Some(10));
        let much_later = start + Duration::from_secs(120);
        watch.observe(much_later, Some(11));
        assert!(!watch.stalled(much_later));
    }

    #[test]
    fn unchanged_boot_progress_stalls_after_thirty_seconds() {
        let start = Instant::now();
        let watch = StallWatch::new(start, Some(10));
        assert!(!watch.stalled(start + Duration::from_secs(29)));
        assert!(watch.stalled(start + STARTUP_STALL_TIMEOUT));
    }
}

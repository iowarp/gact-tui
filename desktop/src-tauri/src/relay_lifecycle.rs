//! Ask the local agent to close the person's open relays before CLIO exits.
//!
//! The agent calls the relay plugin's `shutdown` operation for every signed-in site and
//! the local machine (`POST /v1/relays/shutdown`, answering `relay.shutdown.v1`). Quit
//! never waits on it for longer than [`RELAY_READ_TIMEOUT`]: an unreachable site is a
//! failure the agent reports, and a slow agent is cut off here. Every outcome is logged.

use std::time::Duration;

/// The per-site bound the relay plugin applies (`timeout_s`).
const RELAY_TOOL_TIMEOUT_S: u64 = 15;
/// The agent answers within the tool's bound plus its own 5 s margin; allow a little more.
const RELAY_READ_TIMEOUT: Duration = Duration::from_secs(RELAY_TOOL_TIMEOUT_S + 7);

fn log(line: &str) {
    crate::supervisor_boot_log::boot_log_line(line);
}

fn rows(result: &serde_json::Value, key: &str) -> Vec<serde_json::Value> {
    result
        .get(key)
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default()
}

fn field(row: &serde_json::Value, key: &str) -> String {
    match row.get(key) {
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(serde_json::Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

/// One log line per stopped process, job left running and failure.
fn summarize(result: &serde_json::Value) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(skipped) = result.get("skipped").and_then(|value| value.as_str()) {
        lines.push(format!("relays on quit: nothing to close ({skipped})"));
        return lines;
    }
    let stopped = rows(result, "stopped");
    let running = rows(result, "still_running");
    let failures = rows(result, "failures");
    lines.push(format!(
        "relays on quit: stopped={} still_running={} failures={} elapsed_ms={}",
        stopped.len(),
        running.len(),
        failures.len(),
        field(result, "elapsed_ms"),
    ));
    for row in &stopped {
        lines.push(format!(
            "relays on quit: stopped site={} kind={} pid={} {}",
            field(row, "site"),
            field(row, "kind"),
            field(row, "pid"),
            field(row, "detail"),
        ));
    }
    for row in &running {
        lines.push(format!(
            "relays on quit: left running site={} kind={} id={} {}",
            field(row, "site"),
            field(row, "kind"),
            field(row, "id"),
            field(row, "detail"),
        ));
    }
    for row in &failures {
        lines.push(format!(
            "relays on quit: failed site={} error={} {}",
            field(row, "site"),
            field(row, "error"),
            field(row, "detail"),
        ));
    }
    lines
}

/// Whether the local agent has relay endpoints to close, for the quit prompt's box.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct RelayStatus {
    pub available: bool,
    pub endpoints: u64,
}

/// Read `GET /v1/relays/quit` quickly; `None` when the agent cannot say (an older
/// agent, or one still starting), which hides the box.
pub fn relay_status(base_url: &str, bearer_token: &str) -> Option<RelayStatus> {
    if base_url.is_empty() || bearer_token.is_empty() {
        return None;
    }
    let endpoint = format!("{}/v1/relays/quit", base_url.trim_end_matches('/'));
    let text = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(800))
        .timeout_read(Duration::from_millis(1500))
        .build()
        .get(&endpoint)
        .set("Authorization", &format!("Bearer {bearer_token}"))
        .call()
        .ok()?
        .into_string()
        .ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    Some(RelayStatus {
        available: value.get("available")?.as_bool()?,
        endpoints: value.get("endpoints")?.as_u64()?,
    })
}

/// Close the open relays through the agent at `base_url`; logs and never fails the quit.
pub fn close_relays(base_url: &str, bearer_token: &str) {
    if base_url.is_empty() || bearer_token.is_empty() {
        log("relays on quit: skipped, no agent connection");
        return;
    }
    let endpoint = format!("{}/v1/relays/shutdown", base_url.trim_end_matches('/'));
    let body = serde_json::json!({ "timeout_s": RELAY_TOOL_TIMEOUT_S }).to_string();
    let response = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(2))
        .timeout_read(RELAY_READ_TIMEOUT)
        .build()
        .post(&endpoint)
        .set("Authorization", &format!("Bearer {bearer_token}"))
        .set("Content-Type", "application/json")
        .send_string(&body);
    match response {
        // An agent without the relay routes has no relays to close.
        Err(ureq::Error::Status(404, _)) => {
            log("relays on quit: skipped, this agent has no relay shutdown")
        }
        Err(error) => log(&format!("relays on quit: failed: {error}")),
        Ok(response) => {
            let parsed = response
                .into_string()
                .map_err(|error| error.to_string())
                .and_then(|text| {
                    serde_json::from_str::<serde_json::Value>(&text)
                        .map_err(|error| error.to_string())
                });
            match parsed {
                Ok(result) => summarize(&result).iter().for_each(|line| log(line)),
                Err(error) => log(&format!("relays on quit: unreadable answer: {error}")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_lists_each_outcome() {
        let result = serde_json::json!({
            "schema": "relay.shutdown.v1",
            "stopped": [{"site": "delta", "kind": "tunnel", "pid": 42, "detail": "ssh -L"}],
            "still_running": [{"site": "delta", "kind": "job", "id": "j1", "detail": "sim"}],
            "failures": [{"site": "polaris", "error": "unreachable", "detail": "timed out"}],
            "elapsed_ms": 1200,
        });
        let lines = summarize(&result);
        assert!(lines[0].contains("stopped=1 still_running=1 failures=1"));
        assert!(lines[1].contains("site=delta kind=tunnel pid=42"));
        assert!(lines[2].contains("left running site=delta kind=job id=j1"));
        assert!(lines[3].contains("failed site=polaris error=unreachable"));
    }

    #[test]
    fn summary_names_a_skip() {
        let lines = summarize(&serde_json::json!({"skipped": "no_endpoints"}));
        assert_eq!(
            lines,
            vec!["relays on quit: nothing to close (no_endpoints)"]
        );
    }
}

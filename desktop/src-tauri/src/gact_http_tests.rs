//! Integration tests for the `gact_http` Rust HTTP proxy — the path
//! the real desktop WebView uses instead of `fetch()` (the WebView
//! origin is cross-origin to the localhost sidecar and clio emits no
//! Access-Control-Allow-Origin, so every frontend request is bridged
//! through this command). The pure-web Playwright suite bypasses this
//! entirely with `--disable-web-security`, so it is only ever exercised
//! here.
//!
//! Gated on `CLIO_GACT_URL` (default :17800). Skips with a printed
//! note when no backend is reachable so CI without clio stays green.

use crate::gact_http::{gact_http, GactHttpRequest};
use std::collections::HashMap;

fn backend() -> Option<String> {
    let url =
        std::env::var("CLIO_GACT_URL").unwrap_or_else(|_| "http://127.0.0.1:17800".to_string());
    // Probe reachability so the test self-skips off a dev box.
    match ureq::get(&format!("{url}/v1/capabilities"))
        .timeout(std::time::Duration::from_millis(800))
        .call()
    {
        Ok(_) => Some(url),
        Err(ureq::Error::Status(_, _)) => Some(url),
        Err(_) => None,
    }
}

fn req(method: &str, url: String, body: Option<String>) -> GactHttpRequest {
    GactHttpRequest {
        method: method.to_string(),
        url,
        headers: HashMap::new(),
        body,
        body_encoding: None,
    }
}

fn create_session_body(base: &str) -> String {
    let workspace_id = ureq::get(&format!("{base}/v1/workspaces"))
        .call()
        .ok()
        .and_then(|r| r.into_string().ok())
        .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
        .and_then(|j| {
            j.get("workspaces")
                .and_then(|v| v.as_array())
                .and_then(|rows| rows.first())
                .and_then(|row| row.get("id"))
                .and_then(|v| v.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "ws_default".to_string());
    serde_json::json!({ "workspace_id": workspace_id }).to_string()
}

#[test]
fn proxies_capabilities_get() {
    let Some(url) = backend() else {
        eprintln!("skip: no clio at CLIO_GACT_URL");
        return;
    };
    let r = gact_http(req("GET", format!("{url}/v1/capabilities"), None))
        .expect("gact_http GET should not transport-error");
    assert_eq!(r.status, 200, "capabilities should be 200");
    assert!(
        r.body.contains("contract_version") || r.body.contains("capabilities"),
        "capabilities body should carry the GACT envelope, got: {}",
        &r.body[..r.body.len().min(200)]
    );
}

#[test]
fn proxies_post_create_session() {
    let Some(url) = backend() else {
        eprintln!("skip: no clio at CLIO_GACT_URL");
        return;
    };
    let mut r = req(
        "POST",
        format!("{url}/v1/sessions"),
        Some(create_session_body(&url)),
    );
    r.headers
        .insert("Content-Type".to_string(), "application/json".to_string());
    let resp = gact_http(r).expect("gact_http POST should not transport-error");
    assert!(
        resp.status == 200 || resp.status == 201,
        "create session should be 200/201, got {}",
        resp.status
    );
    assert!(
        resp.body.contains("\"id\""),
        "create session body should carry an id, got: {}",
        &resp.body[..resp.body.len().min(200)]
    );
}

#[test]
fn surfaces_error_status_not_transport_error() {
    // The ureq::Error::Status branch must return Ok(response) with the
    // real status + body so the frontend's HttpError lift sees the
    // SPEC §14 envelope — not Err (which the frontend can't parse).
    let Some(url) = backend() else {
        eprintln!("skip: no clio at CLIO_GACT_URL");
        return;
    };
    let r = gact_http(req(
        "GET",
        format!("{url}/v1/sessions/does-not-exist-xyz/messages"),
        None,
    ))
    .expect("a 4xx must come back as Ok(resp), never Err(transport)");
    assert!(
        r.status >= 400 && r.status < 500,
        "expected a 4xx for a bogus session, got {}",
        r.status
    );
    assert!(
        r.body.contains("error") || r.body.contains("not_found"),
        "error body should carry the envelope, got: {}",
        &r.body[..r.body.len().min(200)]
    );
}

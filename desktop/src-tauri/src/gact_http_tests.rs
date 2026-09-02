//! Tests for the `gact_http` Rust HTTP proxy — the path the real desktop
//! WebView uses instead of `fetch()` (the WebView origin is cross-origin
//! to the localhost sidecar and clio emits no Access-Control-Allow-Origin,
//! so every frontend request is bridged through this command). The
//! pure-web Playwright suite bypasses this entirely with
//! `--disable-web-security`, so it is only ever exercised here.
//!
//! Two layers. The first serves an in-test HTTP stub over a loopback
//! socket, so the bridge's own contract — request bodies, the response
//! ceiling, the timeout, typed errors — is covered on every machine. The
//! second is gated on `CLIO_GACT_URL` (default :17800) and skips with a
//! printed note when no backend is reachable, so CI without clio stays
//! green.

use crate::gact_http::{
    gact_http, resolve_timeout_ms, GactHttpRequest, DEFAULT_TIMEOUT_MS, ERROR_REQUEST_BODY_INVALID,
    ERROR_RESPONSE_TOO_LARGE, ERROR_TRANSPORT, ERROR_UNSUPPORTED_METHOD, MAX_RESPONSE_BYTES,
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::{Duration, Instant};

/// One-shot HTTP stub: accepts a single connection, hands the request back
/// over a channel, and writes the canned response.
struct HttpStub {
    port: u16,
    request: Receiver<Vec<u8>>,
}

impl HttpStub {
    /// Serve `response` verbatim after `delay`.
    ///
    /// `response` is raw wire bytes so a test can serve a malformed or
    /// oversized message the way a real server would.
    fn serve(response: Vec<u8>, delay: Duration) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback stub");
        let port = listener.local_addr().expect("stub address").port();
        let (sender, request) = mpsc::channel();
        thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let received = read_request(&mut stream);
            let _ = sender.send(received);
            thread::sleep(delay);
            // Both writes are best-effort: a test that stops reading at the
            // response ceiling drops the connection mid-write, and that
            // broken pipe is the expected end of this thread, not a failure.
            let _ = stream.write_all(&response);
            let _ = stream.flush();
        });
        Self { port, request }
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }

    fn received_request(&self) -> Vec<u8> {
        self.request
            .recv_timeout(Duration::from_secs(10))
            .expect("stub should receive one request")
    }
}

/// Read one HTTP message: headers, then exactly `Content-Length` body bytes.
fn read_request(stream: &mut TcpStream) -> Vec<u8> {
    let mut received = Vec::new();
    let mut byte = [0u8; 1];
    while !received.ends_with(b"\r\n\r\n") {
        match stream.read(&mut byte) {
            Ok(0) | Err(_) => return received,
            Ok(_) => received.push(byte[0]),
        }
    }
    let head = String::from_utf8_lossy(&received).to_ascii_lowercase();
    let content_length = head
        .lines()
        .find_map(|line| line.strip_prefix("content-length:"))
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0u8; content_length];
    if content_length > 0 && stream.read_exact(&mut body).is_err() {
        return received;
    }
    received.extend_from_slice(&body);
    received
}

fn http_response(status_line: &str, content_type: &str, body: &[u8]) -> Vec<u8> {
    let mut response = format!(
        "{status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    response.extend_from_slice(body);
    response
}

#[test]
fn sends_a_base64_request_body_as_raw_bytes() {
    // The WebView base64-encodes every binary upload chunk. Those bytes must
    // reach the socket decoded and byte-exact, or a resource lands corrupt.
    let payload: Vec<u8> = (0u8..=255).collect();
    let stub = HttpStub::serve(
        http_response("HTTP/1.1 200 OK", "application/json", b"{\"ok\":true}"),
        Duration::ZERO,
    );
    let mut request = req("PATCH", stub.url("/v1/upload"), None);
    request.body = Some(BASE64_STANDARD.encode(&payload));
    request.body_encoding = Some("base64".to_string());

    let response = gact_http(request).expect("stub request should succeed");
    let received = stub.received_request();

    assert_eq!(response.status, 200);
    assert_eq!(response.body, "{\"ok\":true}");
    assert_eq!(response.body_encoding, "text");
    assert!(
        received.ends_with(&payload),
        "the decoded bytes should reach the socket verbatim"
    );
}

#[test]
fn malformed_base64_request_body_is_a_typed_error() {
    // The decode fails before anything is sent, so no server is involved: the
    // port below is never connected to.
    let mut request = req("POST", "http://127.0.0.1:1/v1/upload".to_string(), None);
    request.body = Some("not %% base64".to_string());
    request.body_encoding = Some("base64".to_string());

    let error = gact_http(request).expect_err("a malformed body must not be sent");

    assert!(
        error.starts_with(ERROR_REQUEST_BODY_INVALID),
        "expected a typed request-body error, got: {error}"
    );
}

#[test]
fn oversized_response_is_a_typed_cap_error() {
    // One byte past the ceiling: the bridge buffers the whole body in memory
    // and base64-encodes binary, so an unbounded read is an out-of-memory
    // vector the frontend cannot even receive.
    let body = vec![b'x'; MAX_RESPONSE_BYTES + 1];
    let stub = HttpStub::serve(
        http_response("HTTP/1.1 200 OK", "application/octet-stream", &body),
        Duration::ZERO,
    );

    let error = gact_http(req("GET", stub.url("/v1/huge"), None))
        .expect_err("a response past the ceiling must fail");

    assert!(
        error.starts_with(ERROR_RESPONSE_TOO_LARGE),
        "expected a typed cap error, got: {error}"
    );
}

#[test]
fn a_body_on_the_ceiling_still_succeeds() {
    // The boundary itself is allowed: only the first byte past it fails.
    let body = vec![b'x'; 4_096];
    let stub = HttpStub::serve(
        http_response("HTTP/1.1 200 OK", "text/plain", &body),
        Duration::ZERO,
    );

    let response = gact_http(req("GET", stub.url("/v1/small"), None)).expect("a small body is fine");

    assert_eq!(response.status, 200);
    assert_eq!(response.body.len(), body.len());
}

#[test]
fn honours_the_requested_timeout() {
    // A slow endpoint must fail on the caller's budget, not on the default:
    // the whole point of the field is that an upload can outlive 30 seconds
    // while an ordinary read still fails fast.
    let stub = HttpStub::serve(
        http_response("HTTP/1.1 200 OK", "text/plain", b"late"),
        Duration::from_secs(30),
    );
    let mut request = req("GET", stub.url("/v1/slow"), None);
    request.timeout_ms = Some(1_000);

    let started = Instant::now();
    let error = gact_http(request).expect_err("a slow endpoint must time out");
    let elapsed = started.elapsed();

    assert!(
        error.starts_with(ERROR_TRANSPORT),
        "a timeout is a transport failure, got: {error}"
    );
    assert!(
        elapsed < Duration::from_secs(10),
        "the 1s budget should have ended this long before the stub replied, took {elapsed:?}"
    );
}

#[test]
fn serves_an_error_status_from_the_stub_as_a_response() {
    // The Status branch must return Ok(response), because Err is unparseable
    // to the frontend's HttpError lift. Covered here too so it holds without
    // a live backend.
    let stub = HttpStub::serve(
        http_response(
            "HTTP/1.1 404 Not Found",
            "application/json",
            b"{\"error\":{\"error\":\"not_found\"}}",
        ),
        Duration::ZERO,
    );

    let response =
        gact_http(req("GET", stub.url("/v1/missing"), None)).expect("a 404 must not be an Err");

    assert_eq!(response.status, 404);
    assert!(response.body.contains("not_found"));
}

#[test]
fn binary_responses_come_back_base64() {
    let body = vec![0u8, 159, 146, 150, 255];
    let stub = HttpStub::serve(
        http_response("HTTP/1.1 200 OK", "application/octet-stream", &body),
        Duration::ZERO,
    );

    let response = gact_http(req("GET", stub.url("/v1/bytes"), None)).expect("binary body");

    assert_eq!(response.body_encoding, "base64");
    assert_eq!(BASE64_STANDARD.decode(response.body).unwrap(), body);
}

#[test]
fn head_is_not_a_supported_method() {
    // Nothing in the client issues one; the arm went with the TS transport.
    let error = gact_http(req("HEAD", "http://127.0.0.1:1/v1/any".to_string(), None))
        .expect_err("HEAD is no longer bridged");

    assert!(
        error.starts_with(ERROR_UNSUPPORTED_METHOD),
        "expected a typed unsupported-method error, got: {error}"
    );
}

#[test]
fn timeout_budget_is_clamped_into_range() {
    assert_eq!(resolve_timeout_ms(None), DEFAULT_TIMEOUT_MS);
    assert_eq!(resolve_timeout_ms(Some(60_000)), 60_000);
    // A zero budget would time out every request before it started.
    assert_eq!(resolve_timeout_ms(Some(0)), 1_000);
    // And an unbounded one would park a thread indefinitely.
    assert_eq!(resolve_timeout_ms(Some(u64::MAX)), 1_800_000);
}

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
        timeout_ms: None,
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

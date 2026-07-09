//! Live SSE-bridge integration tests (gated on CLIO_GACT_URL). Proves
//! the Rust read+parse loop actually streams real clio events - the
//! part the desktop now relies on instead of a raw EventSource.

use crate::sse_stream::{run_stream, run_stream_with_timeout};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

fn backend() -> Option<String> {
    let url =
        std::env::var("CLIO_GACT_URL").unwrap_or_else(|_| "http://127.0.0.1:17800".to_string());
    match ureq::get(&format!("{url}/v1/capabilities"))
        .timeout(Duration::from_millis(800))
        .call()
    {
        Ok(_) | Err(ureq::Error::Status(_, _)) => Some(url),
        Err(_) => None,
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
fn streams_real_clio_events_through_the_parser() {
    let Some(base) = backend() else {
        eprintln!("skip: no clio at CLIO_GACT_URL");
        return;
    };
    // Fresh session to subscribe to.
    let body = ureq::post(&format!("{base}/v1/sessions"))
        .set("Content-Type", "application/json")
        .send_string(&create_session_body(&base))
        .ok()
        .and_then(|r| r.into_string().ok())
        .expect("create session");
    let sid: String = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|j| j.get("id").and_then(|v| v.as_str()).map(String::from))
        .expect("session id in response");

    // Record (kind, data, id) so we can assert the parser surfaces the SSE
    // `id:` value the frontend needs for Last-Event-ID resume.
    let events: Arc<Mutex<Vec<(String, Option<String>, Option<String>)>>> =
        Arc::new(Mutex::new(Vec::new()));
    let stop = Arc::new(AtomicBool::new(false));
    let url = format!("{base}/v1/sessions/{sid}/events");
    let ev2 = events.clone();
    let stop2 = stop.clone();
    let reader = thread::spawn(move || {
        run_stream(&url, &HashMap::new(), &stop2, |m| {
            ev2.lock()
                .unwrap()
                .push((m.kind.clone(), m.data.clone(), m.id.clone()));
        });
    });

    // Give the stream a beat to connect, then drive a turn so clio
    // emits events on it.
    thread::sleep(Duration::from_millis(800));
    let _ = ureq::post(&format!("{base}/v1/sessions/{sid}/messages"))
        .set("Content-Type", "application/json")
        .send_string(r#"{"parts":[{"type":"text","text":"hi"}]}"#);

    // Wait for events to arrive (clio emits message.created /
    // status_changed / heartbeat on the stream).
    let mut got_open = false;
    let mut got_event = false;
    for _ in 0..40 {
        {
            let g = events.lock().unwrap();
            got_open = g.iter().any(|(k, _, _)| k == "open");
            got_event = g.iter().any(|(k, d, _)| {
                k == "event"
                    && d.as_deref()
                        .map(|s| s.contains("\"type\""))
                        .unwrap_or(false)
            });
        }
        if got_open && got_event {
            break;
        }
        thread::sleep(Duration::from_millis(300));
    }
    stop.store(true, Ordering::Relaxed);
    let _ = reader.join();

    assert!(got_open, "bridge should emit an 'open' on connect");
    assert!(
        got_event,
        "bridge should forward at least one parsed SSE event with a type field"
    );
    // clio numbers every SSE event with an `id:` line so clients can resume;
    // the parser must surface at least one so the frontend can echo it as
    // Last-Event-ID.
    let got_id =
        events.lock().unwrap().iter().any(|(k, _, id)| {
            k == "event" && id.as_deref().map(|s| !s.is_empty()).unwrap_or(false)
        });
    assert!(got_id, "bridge should surface an SSE id: for resume");
}

/// HARDENING: setting the stop flag must terminate the reader thread
/// (it notices at the next line, which clio's heartbeat keeps within
/// a few seconds) and emit a final `closed`. Proves session-switch /
/// shutdown teardown doesn't leak SSE threads holding clio sockets.
#[test]
fn stop_flag_terminates_the_reader() {
    let Some(base) = backend() else {
        eprintln!("skip: no clio at CLIO_GACT_URL");
        return;
    };
    let body = ureq::post(&format!("{base}/v1/sessions"))
        .set("Content-Type", "application/json")
        .send_string(&create_session_body(&base))
        .ok()
        .and_then(|r| r.into_string().ok())
        .expect("create session");
    let sid = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|j| j.get("id").and_then(|v| v.as_str()).map(String::from))
        .expect("session id");

    let closed = Arc::new(AtomicBool::new(false));
    let stop = Arc::new(AtomicBool::new(false));
    let url = format!("{base}/v1/sessions/{sid}/events");
    let closed2 = closed.clone();
    let stop2 = stop.clone();
    let reader = thread::spawn(move || {
        run_stream(&url, &HashMap::new(), &stop2, |m| {
            if m.kind == "closed" {
                closed2.store(true, Ordering::Relaxed);
            }
        });
    });

    thread::sleep(Duration::from_millis(800)); // let it connect
    stop.store(true, Ordering::Relaxed);

    // The thread must exit within a heartbeat window or two.
    let mut joined = false;
    for _ in 0..40 {
        if reader.is_finished() {
            joined = true;
            break;
        }
        thread::sleep(Duration::from_millis(500));
    }
    assert!(
        joined,
        "reader thread did not stop within ~20s of stop flag"
    );
    let _ = reader.join();
    assert!(
        closed.load(Ordering::Relaxed),
        "reader should emit 'closed' on stop"
    );
}

/// TIMEOUT-CONTINUE: an idle read timeout is not a failure. A local server
/// sends exactly one SSE event then holds the socket open in silence, so the
/// client's body read times out repeatedly. The reader must keep waiting
/// (looping back to the stop check) and emit NO error; once stopped it exits
/// with a single terminal `closed`. Self-contained — no live clio needed.
#[test]
fn idle_read_timeout_continues_without_spurious_error() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let addr = listener.local_addr().expect("local addr");
    let url = format!("http://{addr}/events");

    // Server: accept one connection, reply with an SSE response carrying a
    // single event, then sit silent (no Content-Length, so the client keeps
    // the body open and its reads time out on the idle socket).
    let server = thread::spawn(move || {
        let (mut sock, _) = listener.accept().expect("accept");
        // Read the request headers so ureq's write side completes; we don't
        // parse them. A short read timeout avoids blocking if the client
        // pipelines nothing further.
        let _ = sock.set_read_timeout(Some(Duration::from_millis(300)));
        let mut buf = [0u8; 2048];
        let _ = sock.read(&mut buf);
        let response = "HTTP/1.1 200 OK\r\n\
Content-Type: text/event-stream\r\n\
Cache-Control: no-cache\r\n\
Connection: keep-alive\r\n\
\r\n\
id: 7\n\
data: {\"type\":\"server.heartbeat\"}\n\
\n";
        let _ = sock.write_all(response.as_bytes());
        let _ = sock.flush();
        // Hold the connection open and silent long enough for the client to
        // hit several idle read timeouts before it is stopped.
        thread::sleep(Duration::from_secs(3));
    });

    let events: Arc<Mutex<Vec<(String, Option<String>, Option<String>)>>> =
        Arc::new(Mutex::new(Vec::new()));
    let stop = Arc::new(AtomicBool::new(false));
    let ev2 = events.clone();
    let stop2 = stop.clone();
    let url2 = url.clone();
    // Short idle read timeout so the timeout-continue loop iterates quickly.
    let reader = thread::spawn(move || {
        run_stream_with_timeout(
            &url2,
            &HashMap::new(),
            &stop2,
            Duration::from_millis(250),
            |m| {
                ev2.lock()
                    .unwrap()
                    .push((m.kind.clone(), m.data.clone(), m.id.clone()));
            },
        );
    });

    // Wait until the single event has been forwarded.
    let mut got_event = false;
    for _ in 0..40 {
        if events.lock().unwrap().iter().any(|(k, _, _)| k == "event") {
            got_event = true;
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    assert!(got_event, "bridge should forward the one SSE event");

    // Let a few idle read timeouts (250ms each) elapse to exercise the
    // timeout-continue path, then stop.
    thread::sleep(Duration::from_millis(900));
    stop.store(true, Ordering::Relaxed);

    let mut joined = false;
    for _ in 0..40 {
        if reader.is_finished() {
            joined = true;
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    assert!(
        joined,
        "reader should stop within a read-timeout window of the stop flag"
    );
    let _ = reader.join();
    let _ = server.join();

    let g = events.lock().unwrap();
    let kinds: Vec<&str> = g.iter().map(|(k, _, _)| k.as_str()).collect();
    assert!(kinds.contains(&"open"), "should emit open: {kinds:?}");
    assert!(
        kinds.iter().filter(|k| **k == "event").count() == 1,
        "should forward exactly the one event: {kinds:?}"
    );
    assert!(
        !kinds.contains(&"error"),
        "idle read timeout must NOT surface as an error: {kinds:?}"
    );
    assert_eq!(
        kinds.last(),
        Some(&"closed"),
        "stream should end with a single terminal closed: {kinds:?}"
    );
    // The event's id: survives for Last-Event-ID resume.
    assert!(
        g.iter()
            .any(|(k, _, id)| k == "event" && id.as_deref() == Some("7")),
        "event id should be surfaced"
    );
}

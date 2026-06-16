//! SSE-over-IPC bridge.
//!
//! The frontend's live transcript needs Server-Sent Events from clio.
//! A raw browser `EventSource` works only when clio emits permissive
//! CORS (`Access-Control-Allow-Origin: *`) AND cannot attach an
//! `Authorization` header (the EventSource API has no header surface),
//! so it leans entirely on clio's `trust_socket` localhost trust. Both
//! are exactly the cross-origin exposure tracked in
//! `apps/SECURITY.md` / issue #111.
//!
//! This bridge moves the SSE read into Rust (no browser CORS layer) and
//! forwards each event's `data:` payload to the frontend over a Tauri
//! `Channel`. It can also set the bearer token on the request — closing
//! the "SSE rides on clio CORS + no auth" gap so REST and SSE are
//! protected symmetrically.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::ipc::Channel;
use tauri::Manager;

fn redact_url(url: &str) -> String {
    match url.split_once('?') {
        Some((base, _)) => format!("{base}?<redacted>"),
        None => url.to_string(),
    }
}

/// One message pushed to the frontend channel. `kind` discriminates:
/// `open` (stream connected), `event` (a parsed SSE event — `data`
/// carries the JSON envelope the reducer expects), `error` (transport
/// failure — frontend should back off + reconnect), `closed` (stream
/// ended cleanly / was stopped).
#[derive(Clone, Serialize)]
pub struct SseMessage {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl SseMessage {
    fn open() -> Self {
        Self {
            kind: "open".into(),
            data: None,
            message: None,
        }
    }
    fn event(data: String) -> Self {
        Self {
            kind: "event".into(),
            data: Some(data),
            message: None,
        }
    }
    fn error(msg: String) -> Self {
        Self {
            kind: "error".into(),
            data: None,
            message: Some(msg),
        }
    }
    fn closed() -> Self {
        Self {
            kind: "closed".into(),
            data: None,
            message: None,
        }
    }
}

/// Tracks live SSE reader threads so they can be stopped on session
/// switch (`gact_sse_close`) or app shutdown (`stop_all`).
pub struct SseRegistry {
    next: AtomicU64,
    streams: Mutex<HashMap<u64, Arc<AtomicBool>>>,
}

impl SseRegistry {
    pub fn new() -> Self {
        Self {
            next: AtomicU64::new(1),
            streams: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self) -> (u64, Arc<AtomicBool>) {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut g) = self.streams.lock() {
            g.insert(id, stop.clone());
        }
        (id, stop)
    }

    fn stop(&self, id: u64) {
        if let Ok(mut g) = self.streams.lock() {
            if let Some(s) = g.remove(&id) {
                s.store(true, Ordering::Relaxed);
            }
        }
    }

    /// Drop the registry entry once a thread finishes on its own.
    fn forget(&self, id: u64) {
        if let Ok(mut g) = self.streams.lock() {
            g.remove(&id);
        }
    }

    /// Signal every live stream to stop — called on shutdown.
    pub fn stop_all(&self) {
        if let Ok(mut g) = self.streams.lock() {
            for (_, s) in g.drain() {
                s.store(true, Ordering::Relaxed);
            }
        }
    }
}

impl Default for SseRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Open an SSE stream to `url`, forwarding events to `on_event`. Returns
/// a stream id the frontend passes to `gact_sse_close` on teardown.
#[tauri::command]
pub fn gact_sse_open(
    app: tauri::AppHandle,
    url: String,
    headers: HashMap<String, String>,
    on_event: Channel<SseMessage>,
) -> Result<u64, String> {
    let (id, stop) = app.state::<SseRegistry>().register();
    eprintln!("[gact_sse] open requested id={id} url={}", redact_url(&url));
    let app2 = app.clone();
    thread::Builder::new()
        .name(format!("gact-sse-{id}"))
        .spawn(move || {
            eprintln!("[gact_sse] thread started id={id}");
            run_stream(&url, &headers, &stop, |m| {
                eprintln!("[gact_sse] emit id={id} kind={}", m.kind);
                let _ = on_event.send(m);
            });
            app2.state::<SseRegistry>().forget(id);
            eprintln!("[gact_sse] thread stopped id={id}");
        })
        .map_err(|e| format!("sse thread spawn: {e}"))?;
    Ok(id)
}

/// Stop a previously-opened SSE stream. The reader thread notices the
/// flag at its next line read (clio's `server.heartbeat` keeps that
/// cadence to a few seconds) and exits.
#[tauri::command]
pub fn gact_sse_close(app: tauri::AppHandle, id: u64) {
    eprintln!("[gact_sse] close requested id={id}");
    app.state::<SseRegistry>().stop(id);
}

/// Connect to an SSE URL and drive `emit` with each lifecycle message.
/// Generic over the sink so it's testable without a Tauri `Channel`:
/// production passes a closure that forwards to the IPC channel; tests
/// pass a collector.
fn run_stream<F: FnMut(SseMessage)>(
    url: &str,
    headers: &HashMap<String, String>,
    stop: &AtomicBool,
    mut emit: F,
) {
    eprintln!("[gact_sse] connecting url={}", redact_url(url));
    let mut req = ureq::get(url).set("Accept", "text/event-stream");
    for (k, v) in headers {
        req = req.set(k, v);
    }
    let resp = match req.call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, _)) => {
            eprintln!("[gact_sse] status error code={code}");
            emit(SseMessage::error(format!("sse status {code}")));
            return;
        }
        Err(e) => {
            eprintln!("[gact_sse] connect error {e}");
            emit(SseMessage::error(format!("sse connect: {e}")));
            return;
        }
    };
    eprintln!("[gact_sse] connected status={}", resp.status());
    emit(SseMessage::open());

    let mut reader = BufReader::new(resp.into_reader());
    let mut line = String::new();
    let mut data_buf = String::new();
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break, // EOF — server closed the stream
            Ok(_) => {
                let l = line.trim_end_matches(['\r', '\n']);
                if l.is_empty() {
                    // Blank line terminates an event.
                    if !data_buf.is_empty() {
                        emit(SseMessage::event(std::mem::take(&mut data_buf)));
                    }
                } else if let Some(rest) = l.strip_prefix("data:") {
                    if !data_buf.is_empty() {
                        data_buf.push('\n');
                    }
                    data_buf.push_str(rest.strip_prefix(' ').unwrap_or(rest));
                }
                // event:/id:/retry:/`:`-comment lines carry no payload the
                // reducer needs (it reads `type` from the data JSON), so
                // they're ignored.
            }
            Err(e) => {
                emit(SseMessage::error(format!("sse read: {e}")));
                break;
            }
        }
    }
    emit(SseMessage::closed());
}

#[cfg(test)]
mod tests {
    //! Live SSE-bridge integration test (gated on CLIO_GACT_URL). Proves
    //! the Rust read+parse loop actually streams real clio events — the
    //! part the desktop now relies on instead of a raw EventSource.
    use super::run_stream;
    use std::collections::HashMap;
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

    #[test]
    fn streams_real_clio_events_through_the_parser() {
        let Some(base) = backend() else {
            eprintln!("skip: no clio at CLIO_GACT_URL");
            return;
        };
        // Fresh session to subscribe to.
        let body = ureq::post(&format!("{base}/v1/sessions"))
            .set("Content-Type", "application/json")
            .send_string("{}")
            .ok()
            .and_then(|r| r.into_string().ok())
            .expect("create session");
        let sid: String = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|j| j.get("id").and_then(|v| v.as_str()).map(String::from))
            .expect("session id in response");

        let events: Arc<Mutex<Vec<(String, Option<String>)>>> = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let url = format!("{base}/v1/sessions/{sid}/events");
        let ev2 = events.clone();
        let stop2 = stop.clone();
        let reader = thread::spawn(move || {
            run_stream(&url, &HashMap::new(), &stop2, |m| {
                ev2.lock().unwrap().push((m.kind.clone(), m.data.clone()));
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
                got_open = g.iter().any(|(k, _)| k == "open");
                got_event = g.iter().any(|(k, d)| {
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
            .send_string("{}")
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
}

//! Blocking SSE read loop that powers the IPC bridge.
//!
//! Connects to a clio SSE endpoint, parses `data:` frames, and drives a
//! sink with each lifecycle message until the `stop` flag is set.

use std::collections::HashMap;
use std::io::{self, BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::sse_message::SseMessage;
use crate::sse_parse::SseDataAccumulator;

/// Socket read timeout for the streaming body. clio's `server.heartbeat`
/// keeps events flowing every few seconds, so a read that blocks this long
/// means the stream is idle — we loop back to the stop check and keep
/// waiting rather than treating it as a fatal error. It also bounds
/// `gact_sse_close` teardown: the reader notices the stop flag within one
/// timeout window even if the server goes silent.
const READ_TIMEOUT: Duration = Duration::from_secs(15);

/// True when an SSE-body read error is just the idle read timeout firing
/// (no data arrived within `READ_TIMEOUT`) rather than a real transport
/// failure. The socket read timeout surfaces as `WouldBlock` on Unix and
/// `TimedOut` on Windows.
fn is_read_timeout(e: &io::Error) -> bool {
    matches!(
        e.kind(),
        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
    )
}

/// Connect to an SSE URL and drive `emit` with each lifecycle message.
/// Generic over the sink so it's testable without a Tauri `Channel`:
/// production passes a closure that forwards to the IPC channel; tests
/// pass a collector. Uses the production 15s idle read timeout.
pub(crate) fn run_stream<F: FnMut(SseMessage)>(
    url: &str,
    headers: &HashMap<String, String>,
    stop: &AtomicBool,
    emit: F,
) {
    run_stream_with_timeout(url, headers, stop, READ_TIMEOUT, emit)
}

/// Same as [`run_stream`] but with an explicit idle read timeout, so tests
/// can drive the timeout-continue path without waiting the full 15s.
pub(crate) fn run_stream_with_timeout<F: FnMut(SseMessage)>(
    url: &str,
    headers: &HashMap<String, String>,
    stop: &AtomicBool,
    read_timeout: Duration,
    mut emit: F,
) {
    eprintln!("[gact_sse] connecting url={}", redact_url(url));
    let agent = ureq::AgentBuilder::new().timeout_read(read_timeout).build();
    let mut req = agent.get(url).set("Accept", "text/event-stream");
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
    let mut parser = SseDataAccumulator::default();
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        match reader.read_line(&mut line) {
            Ok(0) => break, // EOF — server closed the stream
            Ok(_) => {
                if let Some(ev) = parser.push_line(&line) {
                    emit(SseMessage::event(ev.data, ev.id));
                }
                line.clear();
                // event:/retry:/`:`-comment lines carry no payload the reducer
                // needs (it reads `type` from the data JSON); the `id:` value
                // is captured by the accumulator and surfaced on `SseMessage`
                // so the frontend can resume via Last-Event-ID.
            }
            Err(ref e) if is_read_timeout(e) => {
                // Idle read timeout, not a failure: loop back to the stop
                // check and keep waiting. Any partial bytes stay in `line`
                // (we only clear after a full line) so nothing is lost when
                // the stream resumes mid-line. Emit NO error/closed here.
                continue;
            }
            Err(e) => {
                emit(SseMessage::error(format!("sse read: {e}")));
                break;
            }
        }
    }
    emit(SseMessage::closed());
}

pub(crate) fn redact_url(url: &str) -> String {
    match url.split_once('?') {
        Some((base, _)) => format!("{base}?<redacted>"),
        None => url.to_string(),
    }
}

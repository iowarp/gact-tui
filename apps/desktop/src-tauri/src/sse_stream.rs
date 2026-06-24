//! Blocking SSE read loop that powers the IPC bridge.
//!
//! Connects to a clio SSE endpoint, parses `data:` frames, and drives a
//! sink with each lifecycle message until the `stop` flag is set.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::sse_message::SseMessage;
use crate::sse_parse::SseDataAccumulator;

/// Connect to an SSE URL and drive `emit` with each lifecycle message.
/// Generic over the sink so it's testable without a Tauri `Channel`:
/// production passes a closure that forwards to the IPC channel; tests
/// pass a collector.
pub(crate) fn run_stream<F: FnMut(SseMessage)>(
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
    let mut parser = SseDataAccumulator::default();
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break, // EOF — server closed the stream
            Ok(_) => {
                if let Some(data) = parser.push_line(&line) {
                    emit(SseMessage::event(data));
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

pub(crate) fn redact_url(url: &str) -> String {
    match url.split_once('?') {
        Some((base, _)) => format!("{base}?<redacted>"),
        None => url.to_string(),
    }
}

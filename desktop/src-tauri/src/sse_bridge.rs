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
//! forwards each event's `data:` payload to the frontend over the keyed
//! global Tauri event `gact:sse` (filtered by `client_id`). It can also
//! set the bearer token on the request — closing the "SSE rides on clio
//! CORS + no auth" gap so REST and SSE are protected symmetrically.
//!
//! Delivery is single-channel: the keyed global event is THE transport
//! (`tauri_sse.ts` listens for `gact:sse` and filters on `client_id`).
//! An earlier build also mirrored every message over a per-command Tauri
//! `Channel`; that produced double delivery and was removed. The old
//! Linux-WebKit note (Channel callbacks never firing) is moot now that the
//! keyed event is the sole path.

use serde::Serialize;
use std::collections::HashMap;
use std::thread;
use tauri::{Emitter, Manager};

use crate::sse_message::SseMessage;
use crate::sse_registry::SseRegistry;
use crate::sse_stream::{redact_url, run_stream};

const SSE_EVENT: &str = "gact:sse";

/// Whether to log the per-event hot-path line. Off in release builds unless
/// `GACT_SSE_DEBUG` is set; the lifecycle lines (open/connect/close/stop)
/// always log so a quiet release build still traces stream setup+teardown.
fn sse_debug_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var_os("GACT_SSE_DEBUG").is_some()
}

#[derive(Clone, Serialize)]
struct SseEventPayload {
    client_id: String,
    message: SseMessage,
}

/// Open an SSE stream to `url`, forwarding each message to the frontend
/// over the keyed global `gact:sse` event. Returns a stream id the
/// frontend passes to `gact_sse_close` on teardown.
#[tauri::command]
pub fn gact_sse_open(
    app: tauri::AppHandle,
    url: String,
    headers: HashMap<String, String>,
    client_id: Option<String>,
) -> Result<u64, String> {
    let (id, stop) = app.state::<SseRegistry>().register();
    let event_client_id = client_id.unwrap_or_else(|| id.to_string());
    eprintln!("[gact_sse] open requested id={id} url={}", redact_url(&url));
    let debug = sse_debug_enabled();
    let app2 = app.clone();
    thread::Builder::new()
        .name(format!("gact-sse-{id}"))
        .spawn(move || {
            eprintln!("[gact_sse] thread started id={id}");
            run_stream(&url, &headers, &stop, |m| {
                if debug {
                    eprintln!("[gact_sse] emit id={id} kind={}", m.kind);
                }
                let _ = app2.emit(
                    SSE_EVENT,
                    SseEventPayload {
                        client_id: event_client_id.clone(),
                        message: m,
                    },
                );
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

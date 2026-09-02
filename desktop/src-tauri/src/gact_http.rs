//! Rust-side HTTP bridge command for the frontend.
//!
//! Performs the request from native code (no CORS layer) so the
//! cross-origin WebView can reach the localhost sidecar without a
//! `fetch()` preflight, returning a JSON-serializable response.

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;

use crate::gact_http_response::{headers_from_response, response_from_parts, GactHttpResponse};

/// Whole-request budget when the caller names none.
///
/// Mirrored by `GACT_HTTP_TIMEOUT_MS` in `web/src/lib/runtime-limits.ts`.
pub(crate) const DEFAULT_TIMEOUT_MS: u64 = 30_000;

/// Bounds on a caller-supplied budget. The floor keeps a zero or one-millisecond
/// value from turning every request into an instant timeout; the ceiling keeps a
/// mistyped budget from parking a thread for a day.
const MIN_TIMEOUT_MS: u64 = 1_000;
const MAX_TIMEOUT_MS: u64 = 1_800_000;

/// Largest response body this bridge will hold in memory.
///
/// The body is buffered whole (and base64-encoded when binary), so an
/// unbounded read lets one endpoint exhaust the app's memory. The frontend
/// never asks this bridge for more than a preview or a workspace resource, so
/// the ceiling is generous; exceeding it is reported as its own error rather
/// than as a transport failure, because the request reached the server and the
/// answer is simply too large to carry.
pub(crate) const MAX_RESPONSE_BYTES: usize = 64 * 1024 * 1024;

/// Stable leading token of every error this command returns.
///
/// `web/src/lib/transport/tauri-transport.ts` maps these to typed transport
/// reasons, so an oversized response or an unusable request body is not
/// reported to the user as a dead connection. Changing one changes that map.
pub(crate) const ERROR_UNSUPPORTED_METHOD: &str = "gact_http_unsupported_method";
pub(crate) const ERROR_REQUEST_BODY_INVALID: &str = "gact_http_request_body_invalid";
pub(crate) const ERROR_RESPONSE_TOO_LARGE: &str = "gact_http_response_too_large";
pub(crate) const ERROR_RESPONSE_UNREADABLE: &str = "gact_http_response_unreadable";
pub(crate) const ERROR_TRANSPORT: &str = "gact_http_transport_error";

#[derive(Deserialize)]
pub(crate) struct GactHttpRequest {
    pub(crate) method: String,
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
    #[serde(default)]
    pub(crate) body: Option<String>,
    #[serde(default)]
    pub(crate) body_encoding: Option<String>,
    /// Whole-request budget in milliseconds. Absent means [`DEFAULT_TIMEOUT_MS`].
    #[serde(default)]
    pub(crate) timeout_ms: Option<u64>,
}

/// Direct HTTP bridge for the frontend.
///
/// The WebView origin (`http://tauri.localhost`) is cross-origin to any
/// local sidecar (`http://127.0.0.1:17800`), and `clio-agent-gact`
/// doesn't emit `Access-Control-Allow-Origin`, so a vanilla browser
/// `fetch()` gets blocked at the CORS preflight. This command performs
/// the HTTP from Rust (where there's no CORS layer) and returns a
/// JSON-serializable response the frontend can reconstruct into a
/// `Response`.
///
/// Declared `async` so Tauri runs it off the main thread: the body it decodes
/// and encodes is megabyte-scale for a workspace upload, and the socket blocks
/// for the whole request, both of which freeze the window from the main thread.
#[tauri::command(async)]
pub(crate) fn gact_http(req: GactHttpRequest) -> Result<GactHttpResponse, String> {
    let method = req.method.to_uppercase();
    let mut builder = match method.as_str() {
        // No HEAD: nothing in the client issues one (see the note on
        // `TransportRequest` in `packages/core/src/v3/transport.ts`), and a
        // method with no caller is a shape this bridge would have to keep
        // answering for.
        "GET" => ureq::get(&req.url),
        "POST" => ureq::post(&req.url),
        "PUT" => ureq::put(&req.url),
        "PATCH" => ureq::request("PATCH", &req.url),
        "DELETE" => ureq::delete(&req.url),
        _ => return Err(format!("{ERROR_UNSUPPORTED_METHOD}: {method}")),
    };
    for (k, v) in &req.headers {
        builder = builder.set(k, v);
    }
    builder = builder.timeout(Duration::from_millis(resolve_timeout_ms(req.timeout_ms)));
    let result = if let Some(b) = req.body {
        if req.body_encoding.as_deref() == Some("base64") {
            let bytes = BASE64_STANDARD
                .decode(b)
                .map_err(|error| format!("{ERROR_REQUEST_BODY_INVALID}: {error}"))?;
            builder.send_bytes(&bytes)
        } else {
            builder.send_string(&b)
        }
    } else {
        builder.call()
    };
    let resp = match result {
        Ok(r) => r,
        Err(ureq::Error::Status(code, r)) => {
            // Surface the error response with status + body so the
            // frontend's HttpError lift sees the SPEC §14 envelope.
            let headers = headers_from_response(&r);
            let (body, body_encoding) = read_response_body(r)?;
            return Ok(response_from_parts(code, headers, body, body_encoding));
        }
        Err(e) => return Err(format!("{ERROR_TRANSPORT}: {e}")),
    };
    let status = resp.status();
    let headers = headers_from_response(&resp);
    let (body, body_encoding) = read_response_body(resp)?;
    Ok(response_from_parts(status, headers, body, body_encoding))
}

/// Clamp a caller's budget into the range this bridge will honour.
pub(crate) fn resolve_timeout_ms(requested: Option<u64>) -> u64 {
    match requested {
        Some(ms) => ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
        None => DEFAULT_TIMEOUT_MS,
    }
}

fn read_response_body(resp: ureq::Response) -> Result<(String, &'static str), String> {
    let content_type = resp
        .header("content-type")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let textual = content_type.starts_with("text/")
        || content_type.contains("json")
        || content_type.contains("xml")
        || content_type.contains("javascript")
        || content_type.contains("x-www-form-urlencoded")
        || content_type.contains("svg");
    // Read one byte past the ceiling so a body that sits exactly on it still
    // succeeds and the first oversized byte is what fails the read.
    let mut bytes = Vec::new();
    resp.into_reader()
        .take((MAX_RESPONSE_BYTES as u64) + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("{ERROR_RESPONSE_UNREADABLE}: {error}"))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(format!(
            "{ERROR_RESPONSE_TOO_LARGE}: response exceeds the {MAX_RESPONSE_BYTES}-byte bridge limit"
        ));
    }
    if textual {
        let body = String::from_utf8(bytes)
            .map_err(|error| format!("{ERROR_RESPONSE_UNREADABLE}: decode text body: {error}"))?;
        Ok((body, "text"))
    } else {
        Ok((BASE64_STANDARD.encode(bytes), "base64"))
    }
}

//! Rust-side HTTP bridge command for the frontend.
//!
//! Performs the request from native code (no CORS layer) so the
//! cross-origin WebView can reach the localhost sidecar without a
//! `fetch()` preflight, returning a JSON-serializable response.

use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::gact_http_response::{headers_from_response, response_from_parts, GactHttpResponse};

#[derive(Deserialize)]
pub(crate) struct GactHttpRequest {
    pub(crate) method: String,
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
    #[serde(default)]
    pub(crate) body: Option<String>,
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
#[tauri::command]
pub(crate) fn gact_http(req: GactHttpRequest) -> Result<GactHttpResponse, String> {
    let method = req.method.to_uppercase();
    let mut builder = match method.as_str() {
        "GET" => ureq::get(&req.url),
        "POST" => ureq::post(&req.url),
        "PUT" => ureq::put(&req.url),
        "PATCH" => ureq::request("PATCH", &req.url),
        "DELETE" => ureq::delete(&req.url),
        _ => return Err(format!("unsupported method: {method}")),
    };
    for (k, v) in &req.headers {
        builder = builder.set(k, v);
    }
    builder = builder.timeout(Duration::from_secs(30));
    let result = if let Some(b) = req.body {
        builder.send_string(&b)
    } else {
        builder.call()
    };
    let resp = match result {
        Ok(r) => r,
        Err(ureq::Error::Status(code, r)) => {
            // Surface the error response with status + body so the
            // frontend's HttpError lift sees the SPEC §14 envelope.
            let headers = headers_from_response(&r);
            let body = r.into_string().unwrap_or_default();
            return Ok(response_from_parts(code, headers, body));
        }
        Err(e) => return Err(format!("gact_http transport error: {e}")),
    };
    let status = resp.status();
    let headers = headers_from_response(&resp);
    let body = resp.into_string().map_err(|e| format!("read body: {e}"))?;
    Ok(response_from_parts(status, headers, body))
}

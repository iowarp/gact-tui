//! Serializable response shape for the [`crate::gact_http`] bridge.
//!
//! Flattens a `ureq::Response` into status/headers/body the WebView can
//! reconstruct into a `Response`, plus the canonical status-text map.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub(crate) struct GactHttpResponse {
    pub(crate) status: u16,
    pub(crate) status_text: String,
    pub(crate) headers: HashMap<String, String>,
    pub(crate) body: String,
}

pub(crate) fn response_from_parts(
    status: u16,
    headers: HashMap<String, String>,
    body: String,
) -> GactHttpResponse {
    GactHttpResponse {
        status,
        status_text: status_text_for(status),
        headers,
        body,
    }
}

pub(crate) fn headers_from_response(resp: &ureq::Response) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    for name in resp.headers_names() {
        if let Some(value) = resp.header(&name) {
            headers.insert(name, value.to_string());
        }
    }
    headers
}

fn status_text_for(code: u16) -> String {
    match code {
        200 => "OK".into(),
        201 => "Created".into(),
        204 => "No Content".into(),
        400 => "Bad Request".into(),
        401 => "Unauthorized".into(),
        403 => "Forbidden".into(),
        404 => "Not Found".into(),
        500 => "Internal Server Error".into(),
        // Unmapped codes still get a non-empty reason phrase so the web
        // `Response.statusText` is never blank (a blank reason renders as an
        // empty error label in the frontend).
        other => format!("HTTP {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{response_from_parts, status_text_for};
    use std::collections::HashMap;

    #[test]
    fn status_text_mapping_matches_frontend_fetch_shape() {
        assert_eq!(status_text_for(200), "OK");
        assert_eq!(status_text_for(201), "Created");
        assert_eq!(status_text_for(204), "No Content");
        assert_eq!(status_text_for(400), "Bad Request");
        assert_eq!(status_text_for(401), "Unauthorized");
        assert_eq!(status_text_for(403), "Forbidden");
        assert_eq!(status_text_for(404), "Not Found");
        assert_eq!(status_text_for(500), "Internal Server Error");
        // Unmapped codes fall back to a generic, non-empty reason phrase so
        // the web Response.statusText is never blank.
        assert_eq!(status_text_for(418), "HTTP 418");
        assert_eq!(status_text_for(599), "HTTP 599");
    }

    #[test]
    fn response_from_parts_derives_status_text() {
        let response = response_from_parts(404, HashMap::new(), "missing".into());
        assert_eq!(response.status, 404);
        assert_eq!(response.status_text, "Not Found");
        assert_eq!(response.body, "missing");
    }
}

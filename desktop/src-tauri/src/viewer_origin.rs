//! Bundled viewer pages served from their own origin.
//!
//! The HDF5 viewer (h5web) builds functions from strings when it loads, which
//! the app's CSP forbids (`script-src 'self'`). Rather than loosen that for the
//! whole app, the viewer's files are served from a separate scheme whose own
//! policy allows it. The viewer runs in an iframe and gets its data from the host
//! page over `postMessage`, so its policy gives it no network access at all.
//!
//! Tauri treats every registered custom scheme as a *local* origin for IPC.
//! What keeps the viewer away from IPC is that Tauri's IPC scripts and invoke
//! key reach the main frame only, and a cross-origin frame cannot read the
//! parent's. Serving the viewer from the app's own origin would undo that.
//!
//! The files are captured from the embedded frontend before the app is built
//! and served by exact path only. Tauri's asset resolver is not used: for HTML
//! it injects the app's CSP, and for an unknown path it falls back to the app's
//! own `index.html`.

use std::collections::HashMap;
use std::sync::Arc;

use tauri::http::{header, Method, Request, Response, StatusCode};

/// The scheme the viewer pages are served on. On Windows and Android the
/// webview reaches it as `http://gact-viewer.localhost/`.
pub const SCHEME: &str = "gact-viewer";

/// Folders of the embedded frontend that are viewer pages.
const VIEWER_DIRS: &[&str] = &["hdf5-viewer/"];

/// The viewer's policy: its own files, plus `'unsafe-eval'` for h5web's array
/// libraries. No network, no frames, no forms, and only the app may embed it.
pub const VIEWER_CSP: &str = "default-src 'none'; \
     script-src 'self' 'unsafe-eval'; \
     style-src 'self' 'unsafe-inline'; \
     img-src 'self' data: blob:; \
     font-src 'self' data:; \
     connect-src 'none'; \
     base-uri 'none'; \
     form-action 'none'; \
     frame-ancestors tauri://localhost http://tauri.localhost https://tauri.localhost";

/// The viewer pages' files, keyed by path without a leading slash.
#[derive(Clone, Default)]
pub struct ViewerAssets(Arc<HashMap<String, Vec<u8>>>);

impl ViewerAssets {
    /// Copy the viewer pages out of the embedded frontend.
    ///
    /// In `tauri dev` nothing is embedded and this is empty; the web app then
    /// loads the viewer from the dev server, which sets no CSP.
    pub fn capture<R: tauri::Runtime>(assets: &dyn tauri::Assets<R>) -> Self {
        let keys: Vec<String> = assets
            .iter()
            .map(|(key, _)| key.into_owned())
            .filter(|key| is_viewer_path(key.trim_start_matches('/')))
            .collect();
        let files = keys
            .into_iter()
            .filter_map(|key| {
                let bytes = assets.get(&key.as_str().into())?.into_owned();
                Some((key.trim_start_matches('/').to_owned(), bytes))
            })
            .collect();
        Self(Arc::new(files))
    }

    /// Build from explicit files, for tests.
    #[cfg(test)]
    fn from_files(files: &[(&str, &[u8])]) -> Self {
        Self(Arc::new(
            files
                .iter()
                .map(|(path, bytes)| ((*path).to_owned(), bytes.to_vec()))
                .collect(),
        ))
    }

    /// Answer one request on [`SCHEME`].
    pub fn respond(&self, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
        if request.method() != Method::GET && request.method() != Method::HEAD {
            return plain(StatusCode::METHOD_NOT_ALLOWED, "Only GET is served.");
        }
        let mut path = request.uri().path().trim_start_matches('/').to_owned();
        if path.ends_with('/') {
            path.push_str("index.html");
        }
        let Some(bytes) = self.0.get(&path) else {
            return plain(StatusCode::NOT_FOUND, "Not a viewer file.");
        };
        let body = if request.method() == Method::HEAD {
            Vec::new()
        } else {
            bytes.clone()
        };
        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type(&path))
            .header(header::CONTENT_SECURITY_POLICY, VIEWER_CSP)
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(body)
            .expect("static headers are valid")
    }
}

fn is_viewer_path(path: &str) -> bool {
    VIEWER_DIRS.iter().any(|dir| path.starts_with(dir))
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, ext)| ext) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn plain(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, "default-src 'none'")
        .body(message.as_bytes().to_vec())
        .expect("static headers are valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assets() -> ViewerAssets {
        ViewerAssets::from_files(&[
            ("hdf5-viewer/index.html", b"<!doctype html>"),
            ("hdf5-viewer/assets/index-abc.js", b"export {}"),
        ])
    }

    fn get(uri: &str) -> Response<Vec<u8>> {
        assets().respond(&Request::get(uri).body(Vec::new()).unwrap())
    }

    #[test]
    fn serves_viewer_files_with_their_own_policy() {
        let response = get("gact-viewer://localhost/hdf5-viewer/index.html");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), b"<!doctype html>");
        let headers = response.headers();
        assert_eq!(headers[header::CONTENT_TYPE], "text/html; charset=utf-8");
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        let csp = headers[header::CONTENT_SECURITY_POLICY].to_str().unwrap();
        assert!(csp.contains("script-src 'self' 'unsafe-eval'"));
        assert!(csp.contains("connect-src 'none'"));
        assert!(csp.contains("frame-ancestors tauri://localhost"));
    }

    #[test]
    fn a_folder_serves_its_index_and_windows_urls_resolve_the_same() {
        let folder = get("gact-viewer://localhost/hdf5-viewer/");
        assert_eq!(folder.body(), b"<!doctype html>");
        let windows = get("http://gact-viewer.localhost/hdf5-viewer/assets/index-abc.js");
        assert_eq!(windows.status(), StatusCode::OK);
        assert_eq!(
            windows.headers()[header::CONTENT_TYPE],
            "text/javascript; charset=utf-8"
        );
    }

    #[test]
    fn only_captured_files_are_served() {
        for uri in [
            "gact-viewer://localhost/index.html",
            "gact-viewer://localhost/",
            "gact-viewer://localhost/hdf5-viewer/missing.js",
            "gact-viewer://localhost/hdf5-viewer/../index.html",
            "gact-viewer://localhost/hdf5-viewer/%2e%2e/index.html",
        ] {
            assert_eq!(get(uri).status(), StatusCode::NOT_FOUND, "{uri}");
        }
    }

    #[test]
    fn only_reads_are_served() {
        let post = Request::post("gact-viewer://localhost/hdf5-viewer/index.html")
            .body(Vec::new())
            .unwrap();
        assert_eq!(
            assets().respond(&post).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
    }

    /// Against the real embedded frontend (web/dist must be built first).
    #[cfg(not(dev))]
    #[test]
    fn captures_the_bundled_viewer_raw() {
        let context: tauri::Context<tauri::Wry> = tauri::generate_context!();
        let captured = ViewerAssets::capture(context.assets());
        let index = captured
            .0
            .get("hdf5-viewer/index.html")
            .expect("the viewer is bundled");
        let html = String::from_utf8_lossy(index);
        assert!(
            html.to_ascii_lowercase().starts_with("<!doctype html>"),
            "decompressed HTML, got {:?}",
            &html[..html.len().min(60)]
        );
        // Not run through Tauri's asset handler, which injects the app's CSP.
        assert!(!html.contains("Content-Security-Policy"));
        assert!(captured
            .0
            .keys()
            .all(|path| path.starts_with("hdf5-viewer/")));
        assert!(captured.0.keys().any(|path| path.ends_with(".js")));
    }

    #[test]
    fn only_viewer_folders_are_captured() {
        assert!(is_viewer_path("hdf5-viewer/index.html"));
        assert!(!is_viewer_path("index.html"));
        assert!(!is_viewer_path("assets/app.js"));
        assert!(!is_viewer_path("hdf5-viewer-evil/index.html"));
    }
}

//! CLIO Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.
//!
//! Wave 3: also owns SSH tunnel lifecycles + OS notifications + tray.

mod plugins;
mod sse_bridge;
mod ssh;
mod supervisor;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use ssh::{TunnelHandle, TunnelManager, TunnelRequest};
use supervisor::{BackendHandle, Supervisor};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

#[derive(Serialize)]
struct HarnessInfo {
    name: &'static str,
    version: &'static str,
    contract: &'static str,
}

#[tauri::command]
fn harness_info() -> HarnessInfo {
    HarnessInfo {
        name: "clio-desktop",
        version: env!("CARGO_PKG_VERSION"),
        contract: "GACT v0.2",
    }
}

/// Frontend mounts on app load and polls this until `status.kind == "ready"`.
#[tauri::command]
fn get_backend(state: tauri::State<'_, Mutex<Supervisor>>) -> BackendHandle {
    state
        .lock()
        .expect("get_backend: supervisor mutex poisoned")
        .snapshot()
}

/// Open an SSH tunnel for an `ssh-tunnel` backend entry. Returns the
/// local URL the frontend should point its Client at, or an error code
/// the AddRemote wizard can route to a user-actionable message.
#[tauri::command]
fn tunnel_open(
    request: TunnelRequest,
    tunnels: tauri::State<'_, TunnelManager>,
) -> Result<TunnelHandle, String> {
    tunnels.open(request).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct GactHttpRequest {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Serialize)]
struct GactHttpResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
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
fn gact_http(req: GactHttpRequest) -> Result<GactHttpResponse, String> {
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
            let mut headers = HashMap::new();
            for h in r.headers_names() {
                if let Some(v) = r.header(&h) {
                    headers.insert(h, v.to_string());
                }
            }
            let body = r.into_string().unwrap_or_default();
            return Ok(GactHttpResponse {
                status: code,
                status_text: status_text_for(code),
                headers,
                body,
            });
        }
        Err(e) => return Err(format!("gact_http transport error: {e}")),
    };
    let status = resp.status();
    let mut headers = HashMap::new();
    for h in resp.headers_names() {
        if let Some(v) = resp.header(&h) {
            headers.insert(h, v.to_string());
        }
    }
    let body = resp.into_string().map_err(|e| format!("read body: {e}"))?;
    Ok(GactHttpResponse {
        status,
        status_text: status_text_for(status),
        headers,
        body,
    })
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
        _ => "".into(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let supervisor = Supervisor::new();

    // Locate the bundled launcher and kick off the sidecar boot. If the
    // launcher is missing, leave the handle in BackendStatus::Error so the
    // frontend Splash renders a recoverable error card.
    match supervisor::locate_launcher() {
        Ok(launcher) => supervisor.start(launcher),
        Err(e) => supervisor.set_error(format!(
            "sidecar launcher missing: {e}. Run `pnpm fetch-sidecar` and rebuild."
        )),
    }

    let state = Mutex::new(supervisor);

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .manage(TunnelManager::new())
        .manage(sse_bridge::SseRegistry::new())
        .invoke_handler(tauri::generate_handler![
            harness_info,
            get_backend,
            tunnel_open,
            gact_http,
            sse_bridge::gact_sse_open,
            sse_bridge::gact_sse_close,
            plugins::exec_plugin
        ])
        .setup(|app| {
            // Tray icon with a single "Show / Quit" menu — counts as the
            // platform-native badge surface for `detached sessions` once
            // the live wire grows a session count signal we can push
            // here.
            let show = MenuItem::with_id(app, "show", "Show CLIO", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("clio-tray")
                .tooltip("CLIO Desktop")
                .menu(&menu)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<Mutex<Supervisor>>() {
                    if let Ok(s) = state.lock() {
                        s.shutdown();
                    }
                }
                if let Some(tm) = window.app_handle().try_state::<TunnelManager>() {
                    tm.shutdown_all();
                }
                if let Some(sse) = window.app_handle().try_state::<sse_bridge::SseRegistry>() {
                    sse.stop_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CLIO desktop application");
}

#[cfg(test)]
mod gact_http_tests {
    //! Integration tests for the `gact_http` Rust HTTP proxy — the path
    //! the real desktop WebView uses instead of `fetch()` (the WebView
    //! origin is cross-origin to the localhost sidecar and clio emits no
    //! Access-Control-Allow-Origin, so every frontend request is bridged
    //! through this command). The pure-web Playwright suite bypasses this
    //! entirely with `--disable-web-security`, so it is only ever
    //! exercised here.
    //!
    //! Gated on `CLIO_GACT_URL` (default :17800). Skips with a printed
    //! note when no backend is reachable so CI without clio stays green.
    use super::{gact_http, GactHttpRequest};
    use std::collections::HashMap;

    fn backend() -> Option<String> {
        let url = std::env::var("CLIO_GACT_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:17800".to_string());
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
        }
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
        let mut r = req("POST", format!("{url}/v1/sessions"), Some("{}".to_string()));
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
}

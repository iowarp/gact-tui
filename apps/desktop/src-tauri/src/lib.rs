//! CLIO Desktop Tauri shell.
//!
//! On launch we boot the bundled sidecar (clio-agent-gact via the Go
//! launcher under `binaries/`) and expose its URL + bearer token to
//! the frontend via the `get_backend` Tauri command.
//!
//! Wave 3: also owns SSH tunnel lifecycles + OS notifications + tray.

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
        .invoke_handler(tauri::generate_handler![
            harness_info,
            get_backend,
            tunnel_open,
            gact_http
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
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CLIO desktop application");
}

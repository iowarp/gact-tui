//! Real desktop acceptance: direct and embedded-frame downloads save their exact bytes.

#[path = "../src/downloads.rs"]
mod downloads;

#[cfg(target_os = "windows")]
mod acceptance {
    use crate::downloads;
    use std::{
        path::Path,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::Duration,
    };
    use tauri::{utils::config::WindowConfig, Manager, WebviewUrl, WebviewWindow};
    use webview2_com::{
        CallDevToolsProtocolMethodCompletedHandler, DownloadStartingEventHandler,
        Microsoft::Web::WebView2::Win32::{ICoreWebView2_4, ICoreWebView2_9},
    };
    use windows::core::{Interface, HSTRING};

    fn devtools(window: &WebviewWindow, method: &str, parameters: &str) -> Result<String, String> {
        let (sender, receiver) = std::sync::mpsc::channel();
        let method = HSTRING::from(method);
        let parameters = HSTRING::from(parameters);
        window
            .with_webview(move |platform| {
                let completed = sender.clone();
                let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |status, json| {
                        let result = status
                            .map(|()| json.to_string())
                            .map_err(|error| error.to_string());
                        let _ = completed.send(result);
                        Ok(())
                    },
                ));
                // SAFETY: Tauri runs this callback on the WebView2 UI thread.
                let result = unsafe {
                    platform.controller().CoreWebView2().and_then(|core| {
                        core.CallDevToolsProtocolMethod(&method, &parameters, &handler)
                    })
                };
                if let Err(error) = result {
                    let _ = sender.send(Err(error.to_string()));
                }
            })
            .map_err(|error| error.to_string())?;
        receiver
            .recv_timeout(Duration::from_secs(5))
            .map_err(|error| error.to_string())?
    }

    fn click_embedded_download(window: &WebviewWindow) -> Result<(), String> {
        let mut ready = false;
        for _ in 0..50 {
            let result = devtools(
                window,
                "Runtime.evaluate",
                r#"{"expression":"Boolean(window.__clioFrameReady)","returnByValue":true}"#,
            )?;
            let result: serde_json::Value =
                serde_json::from_str(&result).map_err(|error| error.to_string())?;
            if result["result"]["value"].as_bool() == Some(true) {
                ready = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if !ready {
            return Err("Embedded download button did not load".into());
        }
        // Match an editor's user gesture without relaxing multiple-download
        // protection or manually opening the native history dialog.
        devtools(
            window,
            "Input.dispatchMouseEvent",
            r#"{"type":"mousePressed","button":"left","buttons":1,"clickCount":1,"x":40,"y":40}"#,
        )?;
        devtools(
            window,
            "Input.dispatchMouseEvent",
            r#"{"type":"mouseReleased","button":"left","buttons":0,"clickCount":1,"x":40,"y":40}"#,
        )?;
        Ok(())
    }

    fn dialog_state(window: &WebviewWindow, close: bool) -> Result<bool, String> {
        let (sender, receiver) = std::sync::mpsc::channel();
        window
            .with_webview(move |platform| {
                // SAFETY: Tauri runs this callback on the WebView2 UI thread.
                let result = unsafe {
                    platform.controller().CoreWebView2().and_then(|core| {
                        let core = core.cast::<ICoreWebView2_9>()?;
                        if close {
                            core.CloseDefaultDownloadDialog()?;
                        }
                        let mut open = Default::default();
                        core.IsDefaultDownloadDialogOpen(&mut open)?;
                        Ok(open.as_bool())
                    })
                }
                .map_err(|error| error.to_string());
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;
        receiver
            .recv_timeout(Duration::from_secs(5))
            .map_err(|error| error.to_string())?
    }

    fn wait_for_dialog(window: &WebviewWindow, wanted: bool) -> Result<(), String> {
        for _ in 0..50 {
            if dialog_state(window, false)? == wanted {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err(format!("Downloads dialog did not become open={wanted}"))
    }

    fn verify_download(window: &WebviewWindow, path: &Path, bytes: &[u8]) -> Result<(), String> {
        for _ in 0..100 {
            if std::fs::read(path).is_ok_and(|content| content == bytes) {
                return wait_for_dialog(window, true);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err(format!(
            "Download did not save the expected bytes: {}",
            path.display()
        ))
    }

    pub fn run() {
        let root = std::env::temp_dir().join(format!("clio-download-proof-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("create acceptance directory");
        let targets = [root.join("sample.csv"), root.join("embedded.json")];
        let started = Arc::new(AtomicUsize::new(0));
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows = vec![WindowConfig {
            label: "download-proof".into(),
            url: WebviewUrl::External("about:blank".parse().expect("blank URL")),
            visible: false,
            data_directory: Some(root.join("webview-profile")),
            ..Default::default()
        }];
        let startup_windows = downloads::defer_configured_windows(context.config_mut());
        tauri::Builder::default()
            .plugin(downloads::plugin())
            .setup(move |app| {
                downloads::create_configured_windows(app, &startup_windows)?;
                let window = app.get_webview_window("download-proof").expect("configured window");
                let counter = started.clone();
                let destinations = targets.clone();
                // Choose disposable destinations and count actual native events.
                // Production still controls dialog opening; the test never calls it.
                window.with_webview(move |platform| unsafe {
                    let core = platform.controller().CoreWebView2()
                        .expect("WebView2").cast::<ICoreWebView2_4>().expect("download events");
                    core.add_DownloadStarting(&DownloadStartingEventHandler::create(Box::new(move |_, args| {
                        if let Some(args) = args {
                            let index = counter.fetch_add(1, Ordering::SeqCst);
                            args.SetResultFilePath(&HSTRING::from(destinations[index].to_string_lossy().as_ref()))?;
                        }
                        Ok(())
                    })), &mut Default::default()).expect("observe native downloads");
                })?;
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let result = (|| -> Result<(), String> {
                        std::thread::sleep(Duration::from_secs(2));
                        window.eval(r#"const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['activity,hours\nCoding,30'],{type:'text/csv'})); a.download='sample.csv'; document.body.append(a); a.click(); a.remove();"#).map_err(|error| error.to_string())?;
                        verify_download(&window, &targets[0], b"activity,hours\nCoding,30")?;
                        dialog_state(&window, true)?;
                        wait_for_dialog(&window, false)?;
                        window.eval(r#"const f=document.createElement('iframe'); f.style='position:fixed;left:0;top:0;width:400px;height:200px;border:0'; f.srcdoc='<!doctype html><body></body>'; f.onload=()=>{const d=f.contentDocument; const b=d.createElement('button'); b.style='position:absolute;left:0;top:0;width:160px;height:70px'; b.textContent='Download'; b.onclick=()=>{const a=d.createElement('a'); a.href=f.contentWindow.URL.createObjectURL(new Blob(['{"saved":true}'],{type:'application/json'})); a.download='embedded.json'; d.body.append(a); a.click(); a.remove();}; d.body.append(b); window.__clioFrameReady=true;}; document.body.append(f);"#).map_err(|error| error.to_string())?;
                        click_embedded_download(&window)?;
                        verify_download(&window, &targets[1], br#"{"saved":true}"#)?;
                        // The existing header/shared-handler command remains
                        // safe when the observer already opened the dialog.
                        tauri::async_runtime::block_on(downloads::open_downloads(window.as_ref().clone()))?;
                        wait_for_dialog(&window, true)?;
                        if started.load(Ordering::SeqCst) != 2 { return Err("Expected exactly two native downloads".into()); }
                        Ok(())
                    })();
                    match result {
                        Ok(()) => {
                            println!("PASS: direct CSV and embedded-frame JSON saved intact; each automatically opened native Downloads");
                            handle.exit(0);
                        }
                        Err(error) => { eprintln!("FAIL: {error}"); handle.exit(1); }
                    }
                });
                Ok(())
            }).run(context).expect("run acceptance webview");
    }
}

#[cfg(target_os = "windows")]
fn main() {
    acceptance::run();
}

#[cfg(not(target_os = "windows"))]
mod webkit_acceptance {
    use crate::downloads;
    use std::{
        path::Path,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        time::Duration,
    };
    use tauri::{webview::DownloadEvent, WebviewUrl, WebviewWindowBuilder};

    fn wait_for_bytes(path: &Path, expected: &[u8]) -> Result<(), String> {
        for _ in 0..150 {
            if std::fs::read(path).is_ok_and(|content| content == expected) {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        Err(format!("Download bytes did not match: {}", path.display()))
    }

    pub fn run() {
        let root = std::env::temp_dir().join(format!("clio-download-proof-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("create acceptance directory");
        let targets = [root.join("sample.csv"), root.join("embedded.json")];
        let started = Arc::new(AtomicUsize::new(0));
        let completed = Arc::new(AtomicUsize::new(0));
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .setup(move |app| {
                let requests = started.clone();
                let finishes = completed.clone();
                let destinations = targets.clone();
                let window = WebviewWindowBuilder::new(
                    app,
                    "download-proof",
                    WebviewUrl::External("about:blank".parse()?),
                )
                .visible(false)
                .data_directory(root.join("webview-profile"))
                .on_download(move |webview, event| {
                    // Test-only destinations/counts; the real production handler
                    // accepts the browser transfer and reveals Downloads.
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            let index = requests.fetch_add(1, Ordering::SeqCst);
                            let Some(target) = destinations.get(index) else {
                                return false;
                            };
                            *destination = target.clone();
                            downloads::handle_download(webview, DownloadEvent::Requested { url, destination })
                        }
                        event => {
                            if matches!(event, DownloadEvent::Finished { success: true, .. }) {
                                finishes.fetch_add(1, Ordering::SeqCst);
                            }
                            downloads::handle_download(webview, event)
                        }
                    }
                })
                .build()?;
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let result = (|| -> Result<(), String> {
                        std::thread::sleep(Duration::from_secs(2));
                        window.eval(r#"const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['activity,hours\nCoding,30'],{type:'text/csv'})); a.download='sample.csv'; document.body.append(a); a.click(); a.remove();"#).map_err(|error| error.to_string())?;
                        wait_for_bytes(&targets[0], b"activity,hours\nCoding,30")?;
                        window.eval(r#"const f=document.createElement('iframe'); f.srcdoc='<!doctype html><body></body>'; f.onload=()=>{const d=f.contentDocument; const a=d.createElement('a'); a.href=f.contentWindow.URL.createObjectURL(new Blob(['{"saved":true}'],{type:'application/json'})); a.download='embedded.json'; d.body.append(a); a.click(); a.remove();}; document.body.append(f);"#).map_err(|error| error.to_string())?;
                        wait_for_bytes(&targets[1], br#"{"saved":true}"#)?;
                        for _ in 0..50 {
                            if completed.load(Ordering::SeqCst) == 2 { break; }
                            std::thread::sleep(Duration::from_millis(100));
                        }
                        if started.load(Ordering::SeqCst) != 2 || completed.load(Ordering::SeqCst) != 2 {
                            return Err("Expected exactly two successful native transfers".into());
                        }
                        Ok(())
                    })();
                    match result {
                        Ok(()) => {
                            println!("PASS: WebKit direct CSV and embedded-frame JSON saved intact with the production download handler");
                            // Headless CI may lack a file manager. Byte/event proof
                            // is separate from live Downloads-folder UI acceptance.
                            handle.exit(0);
                        }
                        Err(error) => { eprintln!("FAIL: {error}"); handle.exit(1); }
                    }
                });
                Ok(())
            })
            .run(context)
            .expect("run acceptance webview");
    }
}

#[cfg(not(target_os = "windows"))]
fn main() {
    webkit_acceptance::run();
}

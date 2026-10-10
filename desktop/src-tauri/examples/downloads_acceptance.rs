//! Real desktop acceptance: direct and embedded-frame downloads save their exact bytes.

#[path = "../src/downloads.rs"]
mod downloads;

#[cfg(target_os = "windows")]
mod acceptance {
    use crate::downloads;
    use std::{
        io::{Read, Write},
        net::TcpListener,
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

    const TRANSCRIPT: &[u8] =
        b"<!doctype html><title>CLIO session export</title><h1>Conversation transcript</h1>";

    fn serve_transcript() -> Result<String, String> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
        let address = listener.local_addr().map_err(|error| error.to_string())?;
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let result = (|| -> std::io::Result<()> {
                    let mut stream = stream?;
                    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
                    let mut request = [0; 4096];
                    stream.read(&mut request)?;
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Disposition: attachment; filename=conversation.html\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n", TRANSCRIPT.len())?;
                    stream.write_all(TRANSCRIPT)
                })();
                if let Err(error) = result {
                    eprintln!("Transcript download failed: {error}");
                }
            }
        });
        Ok(format!("http://{address}/conversation.html"))
    }

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

    fn click_download(window: &WebviewWindow) -> Result<(), String> {
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
        let targets = [
            root.join("sample.csv"),
            root.join("embedded.json"),
            root.join("conversation.html"),
        ];
        let transcript_url = serve_transcript().expect("serve transcript attachment");
        let started = Arc::new(AtomicUsize::new(0));
        let hidden = Arc::new(AtomicUsize::new(0));
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows = vec![WindowConfig {
            label: "download-proof".into(),
            url: WebviewUrl::External("about:blank".parse().expect("blank URL")),
            title: "CLIO Downloads acceptance".into(),
            visible: std::env::var_os("CLIO_DOWNLOAD_PROOF_VISIBLE").is_some(),
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
                let hidden_entries = hidden.clone();
                let destinations = targets.clone();
                // Choose disposable destinations and count actual native events.
                // Production still controls dialog opening; the test never calls it.
                window.with_webview(move |platform| unsafe {
                    let core = platform.controller().CoreWebView2()
                        .expect("WebView2").cast::<ICoreWebView2_4>().expect("download events");
                    core.add_DownloadStarting(&DownloadStartingEventHandler::create(Box::new(move |_, args| {
                        if let Some(args) = args {
                            // File bytes plus an open dialog are insufficient:
                            // Wry's default Handled=true hides the entry itself.
                            // This observer runs after the production handler.
                            let mut handled = Default::default();
                            args.Handled(&mut handled)?;
                            if handled.as_bool() {
                                hidden_entries.fetch_add(1, Ordering::SeqCst);
                            }
                            let index = counter.fetch_add(1, Ordering::SeqCst);
                            let target = destinations.get(index).expect("unexpected native download");
                            args.SetResultFilePath(&HSTRING::from(target.to_string_lossy().as_ref()))?;
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
                        click_download(&window)?;
                        verify_download(&window, &targets[1], br#"{"saved":true}"#)?;
                        dialog_state(&window, true)?;
                        wait_for_dialog(&window, false)?;
                        let script = format!("document.body.replaceChildren(); const b=document.createElement('button'); b.style='position:fixed;left:0;top:0;width:160px;height:70px'; b.textContent='Export HTML'; b.onclick=()=>{{const t=document.createElement('a'); t.href={}; t.download='conversation.html'; document.body.append(t); t.click(); t.remove();}}; document.body.append(b);", serde_json::to_string(&transcript_url).map_err(|error| error.to_string())?);
                        window.eval(&script).map_err(|error| error.to_string())?;
                        click_download(&window)?;
                        verify_download(&window, &targets[2], TRANSCRIPT)?;
                        // The existing header/shared-handler command remains
                        // safe when the observer already opened the dialog.
                        tauri::async_runtime::block_on(downloads::open_downloads(window.as_ref().clone()))?;
                        wait_for_dialog(&window, true)?;
                        if started.load(Ordering::SeqCst) != 3 { return Err("Expected exactly three native downloads".into()); }
                        if hidden.load(Ordering::SeqCst) != 0 { return Err("Downloads were marked handled, suppressing their native entries".into()); }
                        window.eval("document.body.replaceChildren(); const h=document.createElement('h1'); h.textContent='Native download acceptance'; const p=document.createElement('p'); p.textContent='Direct CSV, embedded JSON, and HTTP HTML export saved intact. Confirm all three filenames in Downloads.'; document.body.append(h,p);").map_err(|error| error.to_string())?;
                        Ok(())
                    })();
                    match result {
                        Ok(()) => {
                            println!("PASS: direct CSV, embedded-frame JSON and HTTP HTML export saved intact; all three retain native download entries and automatically open Downloads");
                            if let Ok(seconds) = std::env::var("CLIO_DOWNLOAD_PROOF_HOLD_SECONDS") {
                                std::thread::sleep(Duration::from_secs(seconds.parse().expect("hold seconds")));
                            }
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
        io::{Read, Write},
        net::TcpListener,
        path::Path,
        sync::{
            atomic::{AtomicBool, AtomicUsize, Ordering},
            Arc,
        },
        time::Duration,
    };
    use tauri::{webview::DownloadEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

    fn serve_document() -> Result<tauri::Url, String> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
        let address = listener.local_addr().map_err(|error| error.to_string())?;
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let result = (|| -> std::io::Result<()> {
                    let mut stream = stream?;
                    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
                    let mut request = [0; 4096];
                    stream.read(&mut request)?;
                    let body =
                        "<!doctype html><html><body>Native download acceptance</body></html>";
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
                })();
                if let Err(error) = result {
                    eprintln!("Acceptance document request failed: {error}");
                }
            }
        });
        format!("http://{address}/")
            .parse::<tauri::Url>()
            .map_err(|error| error.to_string())
    }

    fn evaluate(window: &WebviewWindow, script: &str) -> Result<serde_json::Value, String> {
        let (sender, receiver) = std::sync::mpsc::channel();
        window
            .eval_with_callback(script, move |value| {
                let _ = sender.send(value);
            })
            .map_err(|error| error.to_string())?;
        let value = receiver
            .recv_timeout(Duration::from_secs(5))
            .map_err(|error| format!("JavaScript callback did not complete: {error}"))?;
        serde_json::from_str(&value)
            .map_err(|error| format!("JavaScript returned {value:?}: {error}"))
    }

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
        // Unlike WebView2, GTK's initial about:blank does not finish a load
        // and flush Wry's queued scripts. Use a real test-owned document.
        let document_url = serve_document().expect("start acceptance document");
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .setup(move |app| {
                let requests = started.clone();
                let finishes = completed.clone();
                let destinations = targets.clone();
                let loaded = Arc::new(AtomicBool::new(false));
                let page_loaded = loaded.clone();
                let window = WebviewWindowBuilder::new(
                    app,
                    "download-proof",
                    WebviewUrl::External(document_url),
                )
                // WebKitGTK needs a mapped native window to finish initial
                // navigation. Linux CI maps this window inside Xvfb.
                .visible(true)
                .data_directory(root.join("webview-profile"))
                .on_page_load(move |_, payload| {
                    if payload.event() == tauri::webview::PageLoadEvent::Finished {
                        page_loaded.store(true, Ordering::SeqCst);
                    }
                })
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
                            println!("Native request {}: {}", index + 1, destination.display());
                            downloads::handle_download(webview, DownloadEvent::Requested { url, destination })
                        }
                        event => {
                            if matches!(event, DownloadEvent::Finished { success: true, .. }) {
                                finishes.fetch_add(1, Ordering::SeqCst);
                                println!("Native transfer completed");
                            }
                            downloads::handle_download(webview, event)
                        }
                    }
                })
                .build()?;
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let result = (|| -> Result<(), String> {
                        // Wry queues early scripts without their result callback.
                        // Wait for the actual initial navigation before evaluating.
                        for _ in 0..100 {
                            if loaded.load(Ordering::SeqCst) { break; }
                            std::thread::sleep(Duration::from_millis(100));
                        }
                        if !loaded.load(Ordering::SeqCst) { return Err("Native document did not finish loading".into()); }
                        if evaluate(&window, "Boolean(document.body && document.readyState === 'complete')")?.as_bool() != Some(true) { return Err("Native document body was not ready".into()); }
                        let clicked = evaluate(&window, r#"(()=>{const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['activity,hours\nCoding,30'],{type:'text/csv'})); a.download='sample.csv'; document.body.append(a); a.click(); a.remove(); return 'download-started';})()"#)?;
                        if clicked.as_str() != Some("download-started") { return Err(format!("Download action failed: {clicked}")); }
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

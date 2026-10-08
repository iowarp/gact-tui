//! Windows downloads use WebView2's own history, progress and file actions.

#[cfg(target_os = "windows")]
use webview2_com::{
    DownloadStartingEventHandler,
    Microsoft::Web::WebView2::Win32::{ICoreWebView2_4, ICoreWebView2_9},
};
#[cfg(target_os = "windows")]
use windows::core::Interface;

/// Reveal downloads initiated by any document or frame in a Windows webview.
pub(crate) fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("download-history")
        .on_webview_ready(|_webview| {
            #[cfg(target_os = "windows")]
            if let Err(error) = observe_downloads(_webview) {
                eprintln!("Could not observe Downloads: {error}");
            }
        })
        .build()
}

#[cfg(target_os = "windows")]
fn observe_downloads(webview: tauri::Webview) -> tauri::Result<()> {
    let download_view = webview.clone();
    webview.with_webview(move |platform| {
        // SAFETY: Tauri dispatches this callback on the WebView2 UI thread.
        let result = unsafe {
            platform.controller().CoreWebView2().and_then(|core| {
                let core = core.cast::<ICoreWebView2_4>()?;
                let handler = DownloadStartingEventHandler::create(Box::new(move |_, _| {
                    let view = download_view.clone();
                    // Wait until the starting callback returns before opening
                    // the dialog. Leave the destination, cancellation, and
                    // progress entirely under the browser's control.
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = open_downloads(view).await {
                            eprintln!("Could not open Downloads: {error}");
                        }
                    });
                    Ok(())
                }));
                // WebView2 owns the handler until this webview is destroyed.
                core.add_DownloadStarting(&handler, &mut Default::default())
            })
        };
        if let Err(error) = result {
            eprintln!("Could not observe Downloads: {error}");
        }
    })
}

/// Open the same native Downloads dialog exposed by Ctrl+J.
#[tauri::command]
pub(crate) async fn open_downloads(webview: tauri::Webview) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        webview
            .with_webview(move |platform| {
                // SAFETY: Tauri dispatches this callback on the WebView2 UI thread.
                let result = unsafe {
                    platform
                        .controller()
                        .CoreWebView2()
                        .and_then(|core| core.cast::<ICoreWebView2_9>())
                        .and_then(|core| core.OpenDefaultDownloadDialog())
                }
                .map_err(|error| format!("Open Downloads: {error}"));
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;
        tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv_timeout(std::time::Duration::from_secs(10))
                .map_err(|error| error.to_string())?
        })
        .await
        .map_err(|error| error.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        use tauri::Manager;
        use tauri_plugin_opener::OpenerExt;
        let path = webview
            .app_handle()
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?;
        webview
            .app_handle()
            .opener()
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|error| error.to_string())
    }
}

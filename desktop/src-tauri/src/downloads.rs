//! Windows downloads use WebView2's own history, progress and file actions.

#[cfg(target_os = "windows")]
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_9;
#[cfg(target_os = "windows")]
use windows::core::Interface;

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

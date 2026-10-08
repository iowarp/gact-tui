//! Desktop downloads retain their browser transfer and the user's file-opening choice.

#[cfg(not(target_os = "windows"))]
use tauri::Manager;
use tauri::{utils::config::WindowConfig, webview::DownloadEvent};

/// Defer configured startup windows so their download handler can be installed before navigation.
pub(crate) fn defer_configured_windows(config: &mut tauri::Config) -> Vec<WindowConfig> {
    config
        .app
        .windows
        .iter_mut()
        .filter(|window| window.create)
        .map(|window| {
            let startup = window.clone();
            window.create = false;
            startup
        })
        .collect()
}

/// Create each requested startup window with the platform's native download integration.
pub(crate) fn create_configured_windows(
    app: &tauri::App,
    windows: &[WindowConfig],
) -> tauri::Result<()> {
    for config in windows {
        let builder = tauri::WebviewWindowBuilder::from_config(app, config)?;
        // WebKit requires a handler to save downloads, including Blob exports
        // and downloads from embedded frames. WebView2 keeps its own default
        // transfer UI instead; our plugin only reveals that native history.
        #[cfg(not(target_os = "windows"))]
        let builder = builder.on_download(handle_download);
        builder.build()?;
    }
    Ok(())
}

/// Accept WebKit downloads and reveal Downloads after a successful transfer.
#[cfg_attr(target_os = "windows", allow(dead_code))]
pub(crate) fn handle_download(webview: tauri::Webview, event: DownloadEvent<'_>) -> bool {
    if should_reveal(&event) {
        tauri::async_runtime::spawn(async move {
            if let Err(error) = open_downloads(webview).await {
                eprintln!("Could not open Downloads: {error}");
            }
        });
    }
    // Keep the suggested destination and let WebKit save the file. Never
    // launch it, including when a transfer is cancelled or fails.
    true
}

#[cfg_attr(target_os = "windows", allow(dead_code))]
fn should_reveal(event: &DownloadEvent<'_>) -> bool {
    matches!(event, DownloadEvent::Finished { success: true, .. })
}

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

/// Reveal native Downloads on Windows, or the Downloads folder on macOS/Linux.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn startup_deferral_preserves_window_settings_and_skips_templates() {
        let mut config = tauri::Config::default();
        let startup = WindowConfig {
            label: "main".into(),
            title: "CLIO".into(),
            width: 1440.0,
            height: 900.0,
            decorations: false,
            data_directory: Some(PathBuf::from("profile")),
            ..Default::default()
        };
        let template = WindowConfig {
            label: "template".into(),
            create: false,
            ..Default::default()
        };
        config.app.windows = vec![startup.clone(), template.clone()];
        let deferred = defer_configured_windows(&mut config);
        assert_eq!(deferred.len(), 1);
        assert_eq!(
            serde_json::to_value(&deferred[0]).unwrap(),
            serde_json::to_value(startup).unwrap()
        );
        assert!(config.app.windows.iter().all(|window| !window.create));
        assert_eq!(
            serde_json::to_value(&config.app.windows[1]).unwrap(),
            serde_json::to_value(template).unwrap()
        );
        assert!(defer_configured_windows(&mut config).is_empty());
    }

    #[test]
    fn only_completed_successful_transfers_reveal_downloads() {
        let url: tauri::Url = "https://example.test/download".parse().unwrap();
        let mut destination = PathBuf::from("sample.csv");
        assert!(!should_reveal(&DownloadEvent::Requested {
            url: url.clone(),
            destination: &mut destination,
        }));
        assert!(!should_reveal(&DownloadEvent::Finished {
            url: url.clone(),
            path: None,
            success: false,
        }));
        assert!(should_reveal(&DownloadEvent::Finished {
            url,
            // WKWebView does not report a path on completion.
            path: None,
            success: true,
        }));
    }
}

//! The main window opens hidden on a dark background and is revealed once the page has
//! committed its first frame, so launch never flashes an unpainted white WebView (#739).

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::{window::Color, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

/// The window that is held back until the page reports its first frame.
pub(crate) const STARTUP_WINDOW: &str = "main";

/// The default dark theme's page background (`oklch(0.105 0 0)` in themes.css).
const STARTUP_BACKGROUND: Color = Color(4, 4, 4, 255);

/// Reveal the window anyway when the page never reports its first frame.
const REVEAL_FALLBACK: Duration = Duration::from_millis(2_500);

static REVEALED: AtomicBool = AtomicBool::new(false);

/// Marks the page as hosted by this desktop app, as opposed to any Tauri WebView.
pub(crate) fn desktop_marker_script(version: &str) -> String {
    let version = serde_json::to_string(version).unwrap_or_else(|_| "\"\"".to_owned());
    format!(
        "Object.defineProperty(window,'__CLIO_DESKTOP__',\
         {{value:Object.freeze({{version:{version}}}),configurable:false,enumerable:false}});"
    )
}

/// Hold the startup window back until [`reveal_startup_window`] or the fallback shows it.
pub(crate) fn prepare<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    version: &str,
) -> WebviewWindowBuilder<'a, R, M> {
    builder
        .visible(false)
        .background_color(STARTUP_BACKGROUND)
        .initialization_script(desktop_marker_script(version))
}

pub(crate) fn reveal_after_fallback<R: Runtime>(window: WebviewWindow<R>) {
    std::thread::spawn(move || {
        std::thread::sleep(REVEAL_FALLBACK);
        reveal(&window);
    });
}

fn reveal<R: Runtime>(window: &WebviewWindow<R>) {
    if REVEALED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = window.show();
    let _ = window.set_focus();
}

/// Called by the page after its first committed frame.
#[tauri::command]
pub(crate) fn reveal_startup_window<R: Runtime>(window: WebviewWindow<R>) {
    if window.label() == STARTUP_WINDOW {
        reveal(&window);
    }
}

#[cfg(test)]
mod tests {
    use super::desktop_marker_script;

    #[test]
    fn marker_script_quotes_the_version() {
        assert_eq!(
            desktop_marker_script("0.9.5\"1"),
            "Object.defineProperty(window,'__CLIO_DESKTOP__',\
             {value:Object.freeze({version:\"0.9.5\\\"1\"}),configurable:false,enumerable:false});"
        );
    }
}

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

/// Marks the page as hosted by this desktop app, as opposed to any Tauri WebView, and
/// reports the agent address the desktop resolved from the agent's config (#739 B7).
pub(crate) fn desktop_marker_script(version: &str) -> String {
    marker_script(version, &crate::agent_port::agent_endpoint())
}

fn marker_script(version: &str, agent_endpoint: &str) -> String {
    let quote = |value: &str| serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_owned());
    let (version, agent_endpoint) = (quote(version), quote(agent_endpoint));
    format!(
        "Object.defineProperty(window,'__CLIO_DESKTOP__',\
         {{value:Object.freeze({{version:{version},agentEndpoint:{agent_endpoint}}}),\
         configurable:false,enumerable:false}});"
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
    use super::marker_script;

    #[test]
    fn marker_script_quotes_the_version_and_agent_address() {
        assert_eq!(
            marker_script("0.9.5\"1", "http://127.0.0.1:18123"),
            "Object.defineProperty(window,'__CLIO_DESKTOP__',\
             {value:Object.freeze({version:\"0.9.5\\\"1\",agentEndpoint:\"http://127.0.0.1:18123\"}),\
             configurable:false,enumerable:false});"
        );
    }
}

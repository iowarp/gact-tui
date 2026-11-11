//! The main window opens hidden on a dark background and is revealed once the page has
//! committed its first frame, so launch never flashes an unpainted white WebView (#739).

use std::{sync::Mutex, time::Duration};
use tauri::{window::Color, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};

/// The window that is held back until the page reports its first frame.
pub(crate) const STARTUP_WINDOW: &str = "main";

/// The default Dark theme's page background (`#1e1c19` in themes.css).
const STARTUP_BACKGROUND: Color = Color(0x1e, 0x1c, 0x19, 255);

/// Reveal the window anyway when the page never reports its first frame.
const REVEAL_FALLBACK: Duration = Duration::from_millis(2_500);

type AfterReveal = Box<dyn FnOnce() + Send>;

/// Reveal state plus the work held back until the window is on screen.
struct RevealState {
    revealed: bool,
    pending: Vec<AfterReveal>,
}

impl RevealState {
    const fn new() -> Self {
        Self {
            revealed: false,
            pending: Vec::new(),
        }
    }

    /// Queue `task` until the reveal, or hand it back when the window is already shown.
    fn defer(&mut self, task: AfterReveal) -> Option<AfterReveal> {
        if self.revealed {
            Some(task)
        } else {
            self.pending.push(task);
            None
        }
    }

    /// Mark the window revealed and return the queued work, or `None` if it already was.
    fn reveal(&mut self) -> Option<Vec<AfterReveal>> {
        if std::mem::replace(&mut self.revealed, true) {
            None
        } else {
            Some(std::mem::take(&mut self.pending))
        }
    }
}

static REVEAL: Mutex<RevealState> = Mutex::new(RevealState::new());

fn reveal_state() -> std::sync::MutexGuard<'static, RevealState> {
    REVEAL.lock().unwrap_or_else(|e| e.into_inner())
}

/// Run `task` once the startup window is visible, or now if it already is.
/// AppKit does not present an alert raised while the app has no visible
/// window, so prompts shown at launch must wait for the reveal (#739 C3).
pub(crate) fn after_reveal(task: impl FnOnce() + Send + 'static) {
    let ready = reveal_state().defer(Box::new(task));
    if let Some(task) = ready {
        task();
    }
}

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
    let Some(pending) = reveal_state().reveal() else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
    for task in pending {
        task();
    }
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
    use super::{marker_script, RevealState};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    #[test]
    fn work_queued_before_the_reveal_runs_once_after_it() {
        let ran = Arc::new(AtomicUsize::new(0));
        let mut state = RevealState::new();
        let counter = Arc::clone(&ran);
        assert!(state
            .defer(Box::new(move || {
                counter.fetch_add(1, Ordering::SeqCst);
            }))
            .is_none());
        assert_eq!(ran.load(Ordering::SeqCst), 0, "nothing runs while hidden");

        let pending = state.reveal().expect("first reveal");
        pending.into_iter().for_each(|task| task());
        assert_eq!(ran.load(Ordering::SeqCst), 1);
        assert!(state.reveal().is_none(), "a second reveal is a no-op");

        let counter = Arc::clone(&ran);
        let late = state.defer(Box::new(move || {
            counter.fetch_add(1, Ordering::SeqCst);
        }));
        late.expect("work after the reveal runs immediately")();
        assert_eq!(ran.load(Ordering::SeqCst), 2);
    }

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

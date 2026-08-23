use serde::Serialize;
use std::sync::{Arc, Mutex};

/// Tauri event names for the streamed install. The frontend subscribes to
/// these on the `needs_install` -> auto-install transition.
pub(crate) const EVT_INSTALL_PROGRESS: &str = "clio:install-progress";
pub(crate) const EVT_INSTALL_DONE: &str = "clio:install-done";
pub(crate) const EVT_INSTALL_FAILED: &str = "clio:install-failed";

/// How many trailing log lines to ship in the `clio:install-failed` payload
/// so the error card can show the tail without the whole transcript.
pub(crate) const INSTALL_FAILURE_TAIL_LINES: usize = 30;

#[derive(Clone, Serialize)]
pub(crate) struct InstallProgress {
    pub(crate) line: String,
}

#[derive(Clone, Serialize)]
pub(crate) struct InstallFailed {
    /// Process exit code, or `None` when the installer couldn't be launched
    /// / waited on at all.
    pub(crate) code: Option<i32>,
    /// The last ~30 lines of combined stdout/stderr.
    pub(crate) tail: String,
}

pub(crate) type InstallRecentLines = Arc<Mutex<Vec<String>>>;

/// Record one progress line in the shared failure-tail ring buffer.
pub(crate) fn record_recent_line(recent: &InstallRecentLines, line: String) {
    let mut buf = crate::supervisor_state::lock_recover(recent);
    buf.push(line);
    // Keep enough slack that readers can request the latest tail without
    // retaining an unbounded install transcript in memory.
    if buf.len() > INSTALL_FAILURE_TAIL_LINES * 2 {
        let drop = buf.len() - INSTALL_FAILURE_TAIL_LINES;
        buf.drain(0..drop);
    }
}

/// Join the last [`INSTALL_FAILURE_TAIL_LINES`] recorded lines into one
/// string for the `clio:install-failed` payload.
pub(crate) fn tail_of(recent: &InstallRecentLines) -> String {
    let buf = crate::supervisor_state::lock_recover(recent);
    let start = buf.len().saturating_sub(INSTALL_FAILURE_TAIL_LINES);
    buf[start..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The progress + failure payloads serialize to the exact JSON shape the
    /// frontend event handlers destructure (`{line}` and `{code, tail}`).
    #[test]
    fn install_event_payloads_match_frontend_shape() {
        let prog = serde_json::to_string(&InstallProgress {
            line: "Installing clio-agent...".into(),
        })
        .expect("serialize progress");
        assert_eq!(prog, r#"{"line":"Installing clio-agent..."}"#);

        let failed = serde_json::to_string(&InstallFailed {
            code: Some(7),
            tail: "line a\nline b".into(),
        })
        .expect("serialize failed");
        assert_eq!(failed, r#"{"code":7,"tail":"line a\nline b"}"#);

        // A launch failure (no exit code) serializes code as null.
        let failed_null = serde_json::to_string(&InstallFailed {
            code: None,
            tail: "boom".into(),
        })
        .expect("serialize failed null");
        assert_eq!(failed_null, r#"{"code":null,"tail":"boom"}"#);
    }

    /// `tail_of` returns at most INSTALL_FAILURE_TAIL_LINES lines, taking the
    /// newest, joined by newlines.
    #[test]
    fn tail_of_keeps_only_the_newest_lines() {
        let recent = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let mut g = recent.lock().unwrap();
            for i in 0..(INSTALL_FAILURE_TAIL_LINES + 10) {
                g.push(format!("line {i}"));
            }
        }
        let tail = tail_of(&recent);
        let lines: Vec<&str> = tail.lines().collect();
        assert_eq!(lines.len(), INSTALL_FAILURE_TAIL_LINES);
        // The very last produced line must be present; the very first must not.
        assert_eq!(
            *lines.last().unwrap(),
            format!("line {}", INSTALL_FAILURE_TAIL_LINES + 9)
        );
        assert_eq!(*lines.first().unwrap(), "line 10");
    }

    #[test]
    fn record_recent_line_trims_the_shared_buffer() {
        let recent = Arc::new(Mutex::new(Vec::<String>::new()));
        for i in 0..(INSTALL_FAILURE_TAIL_LINES * 2 + 1) {
            record_recent_line(&recent, format!("line {i}"));
        }

        let buf = recent.lock().unwrap();
        assert_eq!(buf.len(), INSTALL_FAILURE_TAIL_LINES);
        assert_eq!(buf.first().unwrap(), "line 31");
        assert_eq!(buf.last().unwrap(), "line 60");
    }
}

use serde::{Deserialize, Serialize};

/// Snapshot of the sidecar handle returned to the frontend.
///
/// This is the shape consumed by `<SplashScreen />` and (after transition)
/// by `<ChatScreen />` so they can mount a `Client` from `@clio/core`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendHandle {
    pub url: String,
    pub bearer_token: String,
    pub status: BackendStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "detail")]
pub enum BackendStatus {
    Starting,
    Ready,
    /// The bundled launcher resolved no `clio-agent-gact` (it exited with
    /// [`crate::supervisor_spawn::LAUNCHER_EXIT_NOT_FOUND`]). The frontend reacts by auto-running
    /// `install_clio` — a one-swoop first-run install — rather than showing
    /// the manual copy-paste error card. Serializes as `{"kind":"needs_install"}`.
    NeedsInstall,
    Error(String),
}

#[cfg(test)]
mod tests {
    use super::{BackendHandle, BackendStatus};

    #[test]
    fn backend_handle_serializes_round_trip() {
        let h = BackendHandle {
            url: "http://127.0.0.1:12345".into(),
            bearer_token: "deadbeef".into(),
            status: BackendStatus::Ready,
        };
        let j = serde_json::to_string(&h).expect("serialize");
        let back: BackendHandle = serde_json::from_str(&j).expect("deserialize");
        assert_eq!(back.url, h.url);
        assert!(matches!(back.status, BackendStatus::Ready));
    }

    /// The frontend discriminates on `status.kind`. These exact tag strings
    /// are the wire contract `tauri.ts`'s `BackendStatus` union switches on —
    /// they must not drift.
    #[test]
    fn backend_status_kind_tags_are_stable() {
        let cases = [
            (BackendStatus::Starting, r#"{"kind":"starting"}"#),
            (BackendStatus::Ready, r#"{"kind":"ready"}"#),
            (BackendStatus::NeedsInstall, r#"{"kind":"needs_install"}"#),
        ];
        for (status, want) in cases {
            let got = serde_json::to_string(&status).expect("serialize status");
            assert_eq!(got, want, "status tag drifted from frontend contract");
        }
        // Error carries its detail string under "detail".
        let err = serde_json::to_string(&BackendStatus::Error("boom".into())).expect("serialize");
        assert_eq!(err, r#"{"kind":"error","detail":"boom"}"#);
    }

    /// needs_install must round-trip so a snapshot serialized over the IPC
    /// boundary deserializes back to the same variant.
    #[test]
    fn needs_install_round_trips() {
        let h = BackendHandle {
            url: String::new(),
            bearer_token: String::new(),
            status: BackendStatus::NeedsInstall,
        };
        let j = serde_json::to_string(&h).expect("serialize");
        assert!(j.contains(r#""kind":"needs_install""#), "got {j}");
        let back: BackendHandle = serde_json::from_str(&j).expect("deserialize");
        assert!(matches!(back.status, BackendStatus::NeedsInstall));
    }
}

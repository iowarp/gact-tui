//! Shared data types for the SSH tunnel subsystem.
//!
//! The request/handle/error structs (and error taxonomy) exchanged
//! across the tunnel manager, command builder, and frontend IPC.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelRequest {
    pub host: String,
    pub user: String,
    pub remote_port: u16,
    pub key_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelHandle {
    pub local_url: String,
    pub local_port: u16,
}

#[derive(Debug)]
pub struct TunnelError {
    pub code: TunnelErrorCode,
    pub message: String,
}

impl std::fmt::Display for TunnelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl std::error::Error for TunnelError {}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum TunnelErrorCode {
    SshNotInstalled,
    PortAllocation,
    SpawnFailed,
}

#[cfg(test)]
mod tests {
    use super::{TunnelError, TunnelErrorCode, TunnelHandle};

    #[test]
    fn tunnel_error_display_includes_code_and_message() {
        let error = TunnelError {
            code: TunnelErrorCode::SpawnFailed,
            message: "ssh spawn failed".into(),
        };

        assert_eq!(error.to_string(), "[SpawnFailed] ssh spawn failed");
    }

    #[test]
    fn tunnel_handle_serializes_for_ipc() {
        let handle = TunnelHandle {
            local_url: "http://127.0.0.1:1234".into(),
            local_port: 1234,
        };

        let json = serde_json::to_string(&handle).expect("serialize handle");
        assert_eq!(
            json,
            r#"{"local_url":"http://127.0.0.1:1234","local_port":1234}"#
        );
    }
}

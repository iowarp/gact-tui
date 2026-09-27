//! The bearer token of a CLIO this desktop attaches to but did not spawn
//! (clio-agent#1478).
//!
//! A spawned sidecar gets its token from us. An already-running server on the
//! conventional port does not; handing the UI an empty token worked for HTTP
//! (loopback needs none) but made the SSH transport socket refuse every remote
//! deploy. The server publishes `<runtime state dir>/gact-servers/<port>.json`
//! (`clio_agent.gact.server_credentials`) with the token it enforces, or
//! `null` when it enforces none. This module reads that record; when it can't,
//! boot reports a typed "can't authenticate to the running CLIO" state up front
//! instead of letting a deploy fail later.

use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::clio_core_registry::pid_is_alive;

/// What the attached server expects from this desktop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AttachCredential {
    /// The server enforces this bearer token.
    Token(String),
    /// The server enforces no bearer token.
    NoneRequired,
}

#[derive(Deserialize)]
struct CredentialRecord {
    port: u16,
    pid: u32,
    bearer_token: Option<String>,
}

/// The port of an attach URL such as `http://127.0.0.1:17800`.
pub(crate) fn url_port(url: &str) -> Option<u16> {
    let authority = url.split("://").nth(1).unwrap_or(url);
    let authority = authority.split('/').next().unwrap_or(authority);
    authority.rsplit_once(':')?.1.parse().ok()
}

/// Read the credential the server on `port` published, or say why not.
///
/// The error is the plain-language reason shown to the user.
pub(crate) fn attach_credential(
    state_dir: Option<&Path>,
    port: u16,
) -> Result<AttachCredential, String> {
    let Some(state_dir) = state_dir else {
        return Err("the agent state folder on this computer could not be located".to_string());
    };
    let path = state_dir.join("gact-servers").join(format!("{port}.json"));
    let text = fs::read_to_string(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!(
                "it did not publish its access token (no {}); it is probably an older version",
                path.display()
            )
        } else {
            format!("its access token record could not be read ({error})")
        }
    })?;
    let record: CredentialRecord = serde_json::from_str(&text)
        .map_err(|error| format!("its access token record is not valid ({error})"))?;
    if record.port != port {
        return Err(format!(
            "its access token record names port {} instead of {port}",
            record.port
        ));
    }
    if !pid_is_alive(record.pid, None) {
        return Err(format!(
            "its access token record belongs to a server (pid {}) that is no longer running",
            record.pid
        ));
    }
    Ok(match record.bearer_token {
        Some(token) if !token.is_empty() => AttachCredential::Token(token),
        _ => AttachCredential::NoneRequired,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn state_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("clio-attach-token-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("gact-servers")).expect("create state dir");
        dir
    }

    fn write_record(dir: &Path, port: u16, body: &str) {
        fs::write(dir.join("gact-servers").join(format!("{port}.json")), body)
            .expect("write record");
    }

    #[test]
    fn reads_the_token_the_running_server_enforces() {
        let dir = state_dir("token");
        let pid = std::process::id();
        write_record(
            &dir,
            17800,
            &format!(r#"{{"schema":1,"port":17800,"pid":{pid},"bearer_token":"real"}}"#),
        );
        assert_eq!(
            attach_credential(Some(&dir), 17800),
            Ok(AttachCredential::Token("real".into()))
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_null_token_means_none_is_required() {
        let dir = state_dir("null");
        let pid = std::process::id();
        write_record(
            &dir,
            17800,
            &format!(r#"{{"schema":1,"port":17800,"pid":{pid},"bearer_token":null}}"#),
        );
        assert_eq!(
            attach_credential(Some(&dir), 17800),
            Ok(AttachCredential::NoneRequired)
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_record_is_a_typed_reason_not_an_empty_token() {
        let dir = state_dir("missing");
        let reason = attach_credential(Some(&dir), 17800).expect_err("must not guess");
        assert!(
            reason.contains("did not publish its access token"),
            "{reason}"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_record_from_a_dead_server_is_refused() {
        let dir = state_dir("stale");
        write_record(
            &dir,
            17800,
            r#"{"schema":1,"port":17800,"pid":4294967294,"bearer_token":"old"}"#,
        );
        let reason = attach_credential(Some(&dir), 17800).expect_err("stale record");
        assert!(reason.contains("no longer running"), "{reason}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn url_port_reads_the_attach_port() {
        assert_eq!(url_port("http://127.0.0.1:17800"), Some(17800));
        assert_eq!(url_port("http://localhost:9000/"), Some(9000));
        assert_eq!(url_port("http://localhost"), None);
    }
}

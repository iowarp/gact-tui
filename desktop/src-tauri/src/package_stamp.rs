//! Skip the per-launch managed-package check when nothing changed (B4).
//!
//! Every launch used to start Python twice (a `--help` probe, then
//! `document_install --reuse-installed`) before the agent, ~1-2.7 s. After a
//! successful check the desktop records a launch stamp: the bundled runtime's
//! path and manifest digest, the workspace, the user directory, the app version
//! and the environment the Python check depends on. A launch whose stamp still
//! matches starts the agent at once and runs the same full check right after it
//! is ready, so a damaged install is still detected and repaired, with a typed
//! reason in the boot log. A launch whose stamp does not match checks before the
//! agent starts, as before, and says why.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

const STAMP_FILE: &str = "desktop-packages.json";
const STAMP_FORMAT: u64 = 1;

/// Whether this launch may start the agent before checking the managed packages.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LaunchCheck {
    /// The last verified installation is unchanged: check after the agent starts.
    Unchanged,
    /// Check before the agent starts, for this typed reason.
    Required(&'static str),
}

fn stamp_path(user: &Path) -> PathBuf {
    user.join(STAMP_FILE)
}

/// The environment variables the Python check folds into its own receipt.
fn relevant_environment() -> Vec<(String, String)> {
    let mut variables: Vec<(String, String)> = std::env::vars_os()
        .filter_map(|(name, value)| Some((name.into_string().ok()?, value.into_string().ok()?)))
        .filter(|(name, _)| name == "PATH" || name.starts_with("CLIO_DOCUMENT_"))
        .collect();
    variables.sort();
    variables
}

/// The identity of everything a verified installation depends on, or why it has none.
fn identity(runtime: &Path, workspace: &Path, user: &Path) -> Result<String, &'static str> {
    let manifest = std::fs::read(runtime.join("runtime.json"))
        .map_err(|_| "launch_stamp_runtime_manifest_unreadable")?;
    let context = serde_json::json!({
        "format": STAMP_FORMAT,
        "app_version": env!("CARGO_PKG_VERSION"),
        "runtime": runtime.to_string_lossy(),
        "runtime_manifest": hex::encode(Sha256::digest(&manifest)),
        "workspace": workspace.to_string_lossy(),
        "user": user.to_string_lossy(),
        "environment": relevant_environment(),
    });
    Ok(hex::encode(Sha256::digest(context.to_string().as_bytes())))
}

/// Decide whether this launch can skip the check before the agent starts.
pub(crate) fn launch_check(runtime: &Path, workspace: &Path, user: &Path) -> LaunchCheck {
    if cfg!(windows) {
        // The Windows check also prepares the protected-execution fence the agent
        // starts under, so it stays before the agent.
        return LaunchCheck::Required("launch_stamp_windows_fence_first");
    }
    let current = match identity(runtime, workspace, user) {
        Ok(current) => current,
        Err(reason) => return LaunchCheck::Required(reason),
    };
    let recorded = match std::fs::read(stamp_path(user)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LaunchCheck::Required("launch_stamp_missing")
        }
        Err(_) => return LaunchCheck::Required("launch_stamp_unreadable"),
    };
    let Ok(recorded) = serde_json::from_slice::<serde_json::Value>(&recorded) else {
        return LaunchCheck::Required("launch_stamp_unreadable");
    };
    if recorded["format"].as_u64() != Some(STAMP_FORMAT) {
        return LaunchCheck::Required("launch_stamp_format_changed");
    }
    if recorded["identity"].as_str() != Some(current.as_str()) {
        return LaunchCheck::Required("launch_stamp_changed");
    }
    LaunchCheck::Unchanged
}

/// Record a successful full check, so the next unchanged launch can skip it.
pub(crate) fn record_verified(runtime: &Path, workspace: &Path, user: &Path) -> Result<(), String> {
    let identity = identity(runtime, workspace, user)
        .map_err(|reason| format!("record launch stamp: {reason}"))?;
    let verified_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();
    let payload = serde_json::json!({
        "format": STAMP_FORMAT,
        "identity": identity,
        "verified_at": verified_at,
    });
    let path = stamp_path(user);
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, payload.to_string())
        .and_then(|()| std::fs::rename(&temporary, &path))
        .map_err(|error| format!("record launch stamp {}: {error}", path.display()))
}

/// Drop the stamp after a failed check, so the next launch checks before starting.
pub(crate) fn forget(user: &Path) -> Result<(), String> {
    match std::fs::remove_file(stamp_path(user)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("remove launch stamp: {error}")),
    }
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("clio-package-stamp-{}-{id}", std::process::id()));
            std::fs::create_dir_all(path.join("runtime")).unwrap();
            std::fs::create_dir_all(path.join("user")).unwrap();
            std::fs::write(path.join("runtime/runtime.json"), r#"{"schema":1}"#).unwrap();
            Self(path)
        }

        fn check(&self) -> LaunchCheck {
            launch_check(&self.0.join("runtime"), &self.0, &self.0.join("user"))
        }

        fn record(&self) {
            record_verified(&self.0.join("runtime"), &self.0, &self.0.join("user")).unwrap();
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn an_unverified_install_is_checked_before_start() {
        let fixture = Fixture::new();
        assert_eq!(fixture.check(), LaunchCheck::Required("launch_stamp_missing"));
    }

    #[test]
    fn an_unchanged_install_skips_the_check_before_start() {
        let fixture = Fixture::new();
        fixture.record();
        assert_eq!(fixture.check(), LaunchCheck::Unchanged);
    }

    #[test]
    fn a_changed_runtime_is_checked_before_start() {
        let fixture = Fixture::new();
        fixture.record();
        std::fs::write(fixture.0.join("runtime/runtime.json"), r#"{"schema":1,"v":2}"#).unwrap();
        assert_eq!(fixture.check(), LaunchCheck::Required("launch_stamp_changed"));
    }

    #[test]
    fn a_failed_check_forgets_the_stamp() {
        let fixture = Fixture::new();
        fixture.record();
        forget(&fixture.0.join("user")).unwrap();
        assert_eq!(fixture.check(), LaunchCheck::Required("launch_stamp_missing"));
    }

    #[test]
    fn an_unreadable_stamp_is_checked_before_start() {
        let fixture = Fixture::new();
        std::fs::write(fixture.0.join("user").join(STAMP_FILE), "not json").unwrap();
        assert_eq!(fixture.check(), LaunchCheck::Required("launch_stamp_unreadable"));
    }
}

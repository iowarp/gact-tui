//! Bundled-runtime discovery for the sidecar.
//!
//! Resolves the optional `clio-runtime` bundled with the app and exports
//! its path via env so the launcher can prefer it over a system install.

use std::path::{Path, PathBuf};

pub(crate) const BUNDLED_RUNTIME_ENV: &str = "CLIO_BUNDLED_RUNTIME_DIR";

pub(crate) fn bundled_runtime_dir(resource_dir: &Path) -> Option<PathBuf> {
    let runtime = resource_dir.join("clio-runtime");
    runtime.is_dir().then_some(runtime)
}

pub(crate) fn install_bundled_runtime_env(resource_dir: &Path) -> Option<PathBuf> {
    let runtime = bundled_runtime_dir(resource_dir)?;
    std::env::set_var(BUNDLED_RUNTIME_ENV, &runtime);
    Some(runtime)
}

pub(crate) fn launcher_missing_message(err: &str) -> String {
    format!("sidecar launcher missing: {err}. Run `pnpm fetch-sidecar` and rebuild.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_case(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("clio-desktop-{name}-{suffix}"))
    }

    #[test]
    fn bundled_runtime_dir_detects_packaged_runtime() {
        let dir = temp_case("runtime-present");
        fs::create_dir_all(dir.join("clio-runtime")).unwrap();
        assert_eq!(bundled_runtime_dir(&dir), Some(dir.join("clio-runtime")));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn bundled_runtime_dir_ignores_missing_runtime() {
        let dir = temp_case("runtime-missing");
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(bundled_runtime_dir(&dir), None);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn launcher_missing_message_keeps_recovery_hint() {
        let msg = launcher_missing_message("not found");
        assert!(msg.contains("sidecar launcher missing: not found"));
        assert!(msg.contains("pnpm fetch-sidecar"));
    }
}

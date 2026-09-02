//! Bundled-runtime discovery for the sidecar.
//!
//! Resolves the optional `gact-runtime` bundled with the app and exports
//! its path via env so the launcher can prefer it over a system install.

use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(crate) const BUNDLED_RUNTIME_ENV: &str = "GACT_BUNDLED_RUNTIME_DIR";
pub(crate) const HF_HOME_ENV: &str = "HF_HOME";
pub(crate) const HF_HUB_CACHE_ENV: &str = "HF_HUB_CACHE";
pub(crate) const HF_XET_CACHE_ENV: &str = "HF_XET_CACHE";

pub(crate) fn bundled_runtime_dir(resource_dir: &Path) -> Option<PathBuf> {
    let runtime = resource_dir.join("gact-runtime");
    runtime.is_dir().then_some(runtime)
}

pub(crate) fn install_bundled_runtime_env(resource_dir: &Path) -> Option<PathBuf> {
    let runtime = bundled_runtime_dir(resource_dir)?;
    std::env::set_var(BUNDLED_RUNTIME_ENV, &runtime);
    Some(runtime)
}

pub(crate) fn model_cache_dir(app_cache_dir: &Path) -> PathBuf {
    app_cache_dir.join("huggingface")
}

/// Configure one persistent model cache for this OS user and packaged app.
///
/// Tauri's app cache directory is keyed by the bundle identifier, so the cache
/// survives upgrades without leaking into workspaces or the executable tree.
///
/// An operator who already exported `HF_HOME` has pointed this machine's model
/// downloads somewhere deliberate — a shared volume, a large disk, a cache
/// primed offline. Overwriting it would silently re-download tens of gigabytes
/// into the app's own cache, so a pre-existing value wins and the whole trio is
/// left alone: HF_HUB_CACHE and HF_XET_CACHE derive from HF_HOME, and mixing a
/// caller's root with our subdirectories would split one cache in two.
///
/// Returns the root now in effect, whether this call set it or found it.
///
/// Called from Tauri's `setup` hook, which runs on the main thread before the
/// supervisor's worker threads exist: `set_var` is only sound while this process
/// is still single-threaded, so it must not move later in boot.
pub(crate) fn install_model_cache_env(app_cache_dir: &Path) -> io::Result<PathBuf> {
    if let Some(existing) = std::env::var_os(HF_HOME_ENV).filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(existing));
    }
    let root = model_cache_dir(app_cache_dir);
    let hub = root.join("hub");
    let xet = root.join("xet");
    fs::create_dir_all(&hub)?;
    fs::create_dir_all(&xet)?;
    std::env::set_var(HF_HOME_ENV, &root);
    std::env::set_var(HF_HUB_CACHE_ENV, &hub);
    std::env::set_var(HF_XET_CACHE_ENV, &xet);
    Ok(root)
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
        std::env::temp_dir().join(format!("gact-desktop-{name}-{suffix}"))
    }

    #[test]
    fn bundled_runtime_dir_detects_packaged_runtime() {
        let dir = temp_case("runtime-present");
        fs::create_dir_all(dir.join("gact-runtime")).unwrap();
        assert_eq!(bundled_runtime_dir(&dir), Some(dir.join("gact-runtime")));
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

    #[test]
    fn model_cache_is_scoped_to_the_platform_app_cache() {
        let cache = Path::new("platform-cache");
        assert_eq!(model_cache_dir(cache), cache.join("huggingface"));
    }

    /// Both branches in one test: these are process-wide environment variables,
    /// so splitting them would let the two halves race each other.
    #[test]
    fn model_cache_env_yields_to_an_operator_supplied_home() {
        let dir = temp_case("model-cache");
        std::env::remove_var(HF_HOME_ENV);
        std::env::remove_var(HF_HUB_CACHE_ENV);

        let root = install_model_cache_env(&dir).expect("prepare the app-scoped cache");
        assert_eq!(root, model_cache_dir(&dir));
        assert_eq!(std::env::var_os(HF_HOME_ENV), Some(root.into_os_string()));

        // An operator who already pointed HF_HOME somewhere keeps it, and the
        // derived caches are left alone rather than mixed with ours.
        let operator = temp_case("operator-cache");
        std::env::set_var(HF_HOME_ENV, &operator);
        std::env::set_var(HF_HUB_CACHE_ENV, operator.join("their-hub"));
        let kept = install_model_cache_env(&dir).expect("keep the operator's cache");
        assert_eq!(kept, operator);
        assert_eq!(
            std::env::var_os(HF_HUB_CACHE_ENV),
            Some(operator.join("their-hub").into_os_string())
        );

        std::env::remove_var(HF_HOME_ENV);
        std::env::remove_var(HF_HUB_CACHE_ENV);
        let _ = fs::remove_dir_all(dir);
    }
}

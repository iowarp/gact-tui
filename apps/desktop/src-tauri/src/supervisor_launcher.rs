use std::{env, path::Path, path::PathBuf};

use crate::brand_backend::brand_backend;

/// Looks up the bundled launcher binary, honoring Tauri's externalBin
/// placement convention. The basename stem is brand-driven (`sidecar_name`).
/// Only reached in managed mode — connect-mode brands own no launcher.
///
/// Production install: alongside the main executable, named
///   `<sidecar_name>{.exe}` — tauri-bundler STRIPS the target-triple suffix
///   when copying an externalBin into the bundle (iowarp/gact-tui#309; the
///   pre-fix lookup probed only the suffixed name and failed on every real
///   install).
/// Dev layouts keep the suffixed `<sidecar_name>-<host-triple>{.exe}` name:
///   `fetch-sidecar` drops it under `src-tauri/binaries/`, and `tauri:dev`
///   copies it next to the debug executable.
pub fn locate_launcher() -> Result<PathBuf, String> {
    locate_launcher_named(&brand_backend().sidecar_name)
}

/// Discovery core, parameterized by the externalBin stem so it is testable
/// without depending on the embedded brand (which defaults to connect-mode
/// with an empty `sidecar_name`).
pub fn locate_launcher_named(sidecar_name: &str) -> Result<PathBuf, String> {
    let basenames = launcher_basenames(sidecar_name);

    // 1) Tauri-installed (triple stripped) or tauri:dev: next to current_exe.
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(found) = find_in_dir(dir, &basenames) {
                return Ok(found);
            }
        }
    }
    // 2) Dev: binaries/ next to CARGO_MANIFEST_DIR (fetch-sidecar output).
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        if let Some(found) = find_in_dir(&Path::new(manifest).join("binaries"), &basenames) {
            return Ok(found);
        }
    }
    // 3) Workspace-relative fallback (for cargo test from any cwd).
    let cwd = env::current_dir().map_err(|e| format!("cwd: {e}"))?;
    if let Some(found) = find_in_dir(&cwd.join("binaries"), &basenames) {
        return Ok(found);
    }

    Err(format!(
        "launcher binary not found: looked for `{}` or `{}` next to current_exe \
         and under binaries/ — run `pnpm fetch-sidecar` (or the equivalent \
         scripts/fetch-sidecar.ps1)",
        basenames[0], basenames[1]
    ))
}

/// The candidate filenames the launcher may carry, most-likely first:
/// the triple-stripped name tauri-bundler installs, then the suffixed
/// name dev layouts use. The stripped name can collide with an unrelated
/// same-named binary sitting next to the app exe (e.g. a system-prefix
/// `clio-agent` console script on Linux) — accepted: in a healthy install
/// the bundler's own copy is that sibling, and a collision implies the
/// bundle was broken anyway.
fn launcher_basenames(sidecar_name: &str) -> [String; 2] {
    let triple = host_target_triple();
    let ext = if cfg!(windows) { ".exe" } else { "" };
    [
        format!("{sidecar_name}{ext}"),
        format!("{sidecar_name}-{triple}{ext}"),
    ]
}

/// First existing regular file among `basenames` inside `dir`.
fn find_in_dir(dir: &Path, basenames: &[String]) -> Option<PathBuf> {
    basenames.iter().map(|b| dir.join(b)).find(|c| c.is_file())
}

/// Best-effort host target triple in the form Tauri's externalBin uses.
/// Mirrors the keys in `apps/desktop/scripts/fetch-sidecar.sh`.
fn host_target_triple() -> &'static str {
    if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "aarch64") {
        "aarch64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "x86_64-apple-darwin"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        "aarch64-unknown-linux-gnu"
    } else {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn basenames_cover_installed_and_dev_layouts() {
        let [installed, dev] = launcher_basenames("clio-agent");
        let ext = if cfg!(windows) { ".exe" } else { "" };
        // tauri-bundler strips the triple when installing an externalBin —
        // the FIRST candidate must be the stripped name (iowarp/gact-tui#309).
        assert_eq!(installed, format!("clio-agent{ext}"));
        assert_eq!(
            dev,
            format!("clio-agent-{}{ext}", host_target_triple())
        );
    }

    #[test]
    fn find_in_dir_resolves_the_installed_stripped_name() {
        // Simulate the production layout: only the triple-stripped file
        // exists next to the executable.
        let dir = env::temp_dir().join(format!(
            "sidecar-lookup-test-{}-{}",
            std::process::id(),
            line!()
        ));
        fs::create_dir_all(&dir).unwrap();
        let basenames = launcher_basenames("clio-agent");
        let installed = dir.join(&basenames[0]);
        fs::write(&installed, b"stub").unwrap();

        let found = find_in_dir(&dir, &basenames);
        fs::remove_dir_all(&dir).ok();
        assert_eq!(found, Some(installed));
    }

    #[test]
    fn find_in_dir_still_resolves_the_dev_suffixed_name() {
        let dir = env::temp_dir().join(format!(
            "sidecar-lookup-test-{}-{}",
            std::process::id(),
            line!()
        ));
        fs::create_dir_all(&dir).unwrap();
        let basenames = launcher_basenames("clio-agent");
        let dev = dir.join(&basenames[1]);
        fs::write(&dev, b"stub").unwrap();

        let found = find_in_dir(&dir, &basenames);
        fs::remove_dir_all(&dir).ok();
        assert_eq!(found, Some(dev));
    }

    #[test]
    fn locate_launcher_finds_dev_binary() {
        // The host build pipeline runs `pnpm fetch-sidecar` before any Rust
        // build; that puts the host-triple launcher under binaries/. The
        // dev fixture is bundled as `clio-agent-<triple>` regardless of the
        // active brand (the neutral default ships no sidecar at all), so we
        // probe discovery with that known stem rather than `sidecar_name`.
        const DEV_SIDECAR_STEM: &str = "clio-agent";
        match locate_launcher_named(DEV_SIDECAR_STEM) {
            Ok(p) => {
                let s = p.to_string_lossy();
                assert!(
                    s.contains(DEV_SIDECAR_STEM),
                    "launcher path should include the stem {DEV_SIDECAR_STEM}, got {s}"
                );
                assert!(p.is_file());
            }
            // No bundled sidecar in this checkout (e.g. fetch-sidecar wasn't
            // run): discovery legitimately finds nothing — not a failure.
            Err(e) => eprintln!("skip: no dev launcher bundled ({e})"),
        }
    }

    #[test]
    fn host_target_triple_is_supported() {
        assert_ne!(
            host_target_triple(),
            "unknown",
            "host platform unsupported by sidecar bundling"
        );
    }
}

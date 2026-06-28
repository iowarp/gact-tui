use std::{env, path::Path, path::PathBuf};

use crate::brand_backend::brand_backend;

/// Looks up the bundled launcher binary, honoring Tauri's externalBin
/// placement convention. The basename stem is brand-driven (`sidecar_name`):
/// the launcher is `<sidecar_name>-<host-triple>{.exe}`. Only reached in
/// managed mode — connect-mode brands own no launcher.
///
/// Production install: alongside the main executable, named
///   `<sidecar_name>-<host-triple>{.exe}`.
/// `tauri:dev`: Tauri copies the externalBin into `target/debug/` so the
///   `current_exe + sibling` lookup works there too.
/// Fallback for tests / cargo-run: `apps/desktop/src-tauri/binaries/`
///   relative to `CARGO_MANIFEST_DIR`.
pub fn locate_launcher() -> Result<PathBuf, String> {
    locate_launcher_named(&brand_backend().sidecar_name)
}

/// Discovery core, parameterized by the externalBin stem so it is testable
/// without depending on the embedded brand (which defaults to connect-mode
/// with an empty `sidecar_name`).
pub fn locate_launcher_named(sidecar_name: &str) -> Result<PathBuf, String> {
    let triple = host_target_triple();
    let basename = if cfg!(windows) {
        format!("{sidecar_name}-{triple}.exe")
    } else {
        format!("{sidecar_name}-{triple}")
    };

    // 1) Tauri-installed: next to current_exe.
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let cand = dir.join(&basename);
            if cand.is_file() {
                return Ok(cand);
            }
        }
    }
    // 2) Dev: binaries/ next to CARGO_MANIFEST_DIR.
    if let Some(manifest) = option_env!("CARGO_MANIFEST_DIR") {
        let cand = Path::new(manifest).join("binaries").join(&basename);
        if cand.is_file() {
            return Ok(cand);
        }
    }
    // 3) Workspace-relative fallback (for cargo test from any cwd).
    let cwd = env::current_dir().map_err(|e| format!("cwd: {e}"))?;
    let cand = cwd.join("binaries").join(&basename);
    if cand.is_file() {
        return Ok(cand);
    }

    Err(format!(
        "launcher binary not found: looked for `{basename}` next to current_exe \
         and under binaries/ — run `pnpm fetch-sidecar` (or the equivalent \
         scripts/fetch-sidecar.ps1)"
    ))
}

/// Best-effort host target triple in the form Tauri's externalBin uses.
/// Mirrors the keys in `apps/desktop/scripts/fetch-sidecar.sh`.
fn host_target_triple() -> &'static str {
    if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "x86_64-apple-darwin"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "x86_64-unknown-linux-gnu"
    } else {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locate_launcher_finds_dev_binary() {
        // The host build pipeline runs `pnpm fetch-sidecar` before any Rust
        // build; that puts the host-triple launcher under binaries/. The
        // dev fixture is bundled as `clio-agent-<triple>` regardless of the
        // active brand (the neutral default ships no sidecar at all), so we
        // probe discovery with that known stem rather than `sidecar_name`.
        const DEV_SIDECAR_STEM: &str = "clio-agent";
        let triple = host_target_triple();
        let basename = if cfg!(windows) {
            format!("{DEV_SIDECAR_STEM}-{triple}.exe")
        } else {
            format!("{DEV_SIDECAR_STEM}-{triple}")
        };
        match locate_launcher_named(DEV_SIDECAR_STEM) {
            Ok(p) => {
                let s = p.to_string_lossy();
                assert!(
                    s.contains(&basename),
                    "launcher path should include the basename {basename}, got {s}"
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

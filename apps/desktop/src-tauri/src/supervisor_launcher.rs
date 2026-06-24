use std::{env, path::Path, path::PathBuf};

/// Looks up the bundled launcher binary, honoring Tauri's externalBin
/// placement convention.
///
/// Production install: alongside the main executable, named
///   `clio-agent-<host-triple>{.exe}` (e.g. `clio-agent-x86_64-pc-windows-msvc.exe`).
/// `tauri:dev`: Tauri copies the externalBin into `target/debug/` so the
///   `current_exe + sibling` lookup works there too.
/// Fallback for tests / cargo-run: `apps/desktop/src-tauri/binaries/`
///   relative to `CARGO_MANIFEST_DIR`.
pub fn locate_launcher() -> Result<PathBuf, String> {
    let triple = host_target_triple();
    let basename = if cfg!(windows) {
        format!("clio-agent-{triple}.exe")
    } else {
        format!("clio-agent-{triple}")
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
        // The host build pipeline runs `pnpm fetch-sidecar` before any
        // Rust build; that puts the host-triple launcher under binaries/.
        let p = locate_launcher().expect("launcher binary present after fetch-sidecar");
        let s = p.to_string_lossy();
        assert!(
            s.contains("clio-agent-"),
            "launcher path should include the basename, got {s}"
        );
        assert!(p.is_file());
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

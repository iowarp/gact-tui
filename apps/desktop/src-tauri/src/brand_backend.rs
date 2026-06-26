//! Brand-driven backend configuration.
//!
//! The supervisor's backend coupling (managed-vs-connect mode, attach
//! port/env-var names, the upstream installer coordinates, the bundled
//! sidecar basename) is read from a compile-time-embedded descriptor rather
//! than hardcoded. The descriptor is `gen/brand-backend.json`, generated from
//! the selected brand profile by `scripts/gen-brand-backend.mjs`.
//!
//! A committed neutral DEFAULT (connect-mode, no installer) lets `cargo build`/
//! `cargo test` pass with zero generator runs and gives the standalone `gact`
//! shell its correct behavior: attach to a user-run backend, never assume a
//! managed agent. An embedding project (e.g. clio-agent) ships its own brand
//! whose `backend` block flips this to managed-mode with its installer +
//! `CLIO_*` env-var conventions; its build regenerates this file before `cargo`
//! runs, so `include_str!` picks up the brand-correct config.
//!
//! The JSON wire shape matches the brand.json `backend` block (camelCase keys).

use serde::Deserialize;
use std::sync::OnceLock;

/// The embedded brand descriptor, baked in at compile time.
const BRAND_BACKEND_JSON: &str =
    include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/gen/brand-backend.json"));

/// The resolved backend block for the active brand. `mode == "managed"` means
/// the supervisor may spawn/install a sidecar; `mode == "connect"` means
/// attach-only (never install). All scalar defaults are applied by the
/// generator before this is embedded, so every field is present at parse time
/// except the optional top-level `repo_label` (only emitted for
/// connect/no-install brands).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandBackend {
    /// `"managed"` (spawn/install a sidecar) or `"connect"` (attach-only).
    pub mode: String,
    /// externalBin basename — the launcher is `<sidecar_name>-<triple>{.exe}`.
    pub sidecar_name: String,
    /// Conventional local port to attach-first.
    pub attach_port: u16,
    /// Env var overriding [`Self::attach_port`].
    pub attach_port_env: String,
    /// Env var overriding the full attach URL.
    pub attach_url_env: String,
    /// Top-level repo label used only on the connect/no-install error path
    /// (where there is no `install.repo_label` to fall back to).
    #[serde(default)]
    pub repo_label: Option<String>,
    /// Installer config, or `None` for connect-mode brands (no installer).
    pub install: Option<BrandInstall>,
}

/// Upstream installer coordinates for a managed brand. Absent (`None` on
/// [`BrandBackend::install`]) for connect-mode brands.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandInstall {
    /// Default git ref the installer should check out.
    #[serde(rename = "ref")]
    pub r#ref: String,
    /// Env var overriding [`Self::r#ref`].
    pub ref_env: String,
    /// Env var that forces a reinstall (rebuild a broken runtime).
    pub force_env: String,
    /// Windows installer URL (piped to `iex`).
    pub windows_url: String,
    /// macOS/Linux installer URL (piped to `bash`).
    pub unix_url: String,
    /// Human label for the install source (e.g. `github.com/iowarp/clio-agent`).
    pub repo_label: String,
}

/// Accessor for the embedded brand backend config, parsed once.
pub(crate) fn brand_backend() -> &'static BrandBackend {
    static BB: OnceLock<BrandBackend> = OnceLock::new();
    BB.get_or_init(|| {
        serde_json::from_str(BRAND_BACKEND_JSON).expect("gen/brand-backend.json is malformed")
    })
}

/// True when the active brand is managed AND ships an installer — i.e. the
/// supervisor is allowed to spawn the sidecar and (on exit-2) auto-install.
/// Connect-mode brands (or managed brands with `install: null`) return false:
/// the launcher is intentionally absent and a missing launcher is NORMAL, so
/// the boot path attaches-only and surfaces [`connect_mode_error`] instead of
/// `NeedsInstall`.
pub(crate) fn is_managed_install() -> bool {
    let bb = brand_backend();
    bb.mode == "managed" && bb.install.is_some()
}

/// The user-facing error for a connect-mode brand when no backend answers the
/// attach probe. Names the brand's repo label (never a vendor literal) and the
/// override env vars, telling the user to start that backend themselves.
pub(crate) fn connect_mode_error() -> String {
    let bb = brand_backend();
    let label = bb
        .repo_label
        .clone()
        .or_else(|| bb.install.as_ref().map(|i| i.repo_label.clone()))
        .unwrap_or_else(|| "the configured backend".to_string());
    format!(
        "No backend is running. Start {label} and ensure it is listening on the \
         attach port (override with {} / {}).",
        bb.attach_port_env, bb.attach_url_env
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The embedded default descriptor parses and is the neutral connect-mode
    /// profile — the standalone `gact` shell makes no managed-agent assumption.
    #[test]
    fn embedded_default_is_neutral_connect_mode() {
        let bb = brand_backend();
        assert_eq!(bb.mode, "connect");
        assert!(bb.install.is_none(), "neutral default ships no installer");
        assert!(
            !is_managed_install(),
            "connect-mode default must not be treated as managed"
        );
        // Neutral, non-vendor env-var conventions.
        assert_eq!(bb.attach_port_env, "GACT_PORT");
        assert_eq!(bb.attach_url_env, "GACT_URL");
        assert_eq!(bb.attach_port, 17800);
    }

    /// The connect-mode error names the override env vars and never a hardcoded
    /// vendor; with no repo label it falls back to a generic phrase.
    #[test]
    fn connect_mode_error_is_brand_neutral() {
        let msg = connect_mode_error();
        assert!(msg.contains("GACT_PORT") && msg.contains("GACT_URL"), "got: {msg}");
        assert!(
            !msg.to_lowercase().contains("clio"),
            "connect error must not name a vendor, got: {msg}"
        );
    }
}

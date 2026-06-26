//! Brand-driven construction of the upstream installer command line.
//!
//! Only relevant for managed brands (those with a `backend.install` block);
//! the neutral connect-mode default ships no installer and never reaches here.

use crate::brand_backend::{brand_backend, BrandInstall};

/// Resolve the git ref to install. An explicit target (from the version-badge
/// update panel — a release tag like `v0.5.2`) wins; otherwise fall back to the
/// brand's default ref (`install.ref`) the first-run install/repair uses.
///
/// Trimmed and validated to a conservative ref charset (alphanumerics plus
/// `.`, `_`, `-`, `/`) so a UI-supplied value can never inject extra shell —
/// anything outside that set falls back to the default ref.
pub(crate) fn resolve_ref_with(default_ref: &str, target_version: Option<&str>) -> String {
    match target_version {
        Some(v) => {
            let trimmed = v.trim();
            let safe = !trimmed.is_empty()
                && trimmed
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
            if safe {
                trimmed.to_string()
            } else {
                default_ref.to_string()
            }
        }
        None => default_ref.to_string(),
    }
}

/// The shell program + argument vector that runs the brand's UPSTREAM
/// installer for the current OS. This is the SAME script the manual error
/// card tells the user to copy-paste; the one-swoop flow just runs it for them
/// and streams the output. Pure (no spawn, no I/O) so the exact command line is
/// unit-testable per-OS.
///
/// The ref env var, force env var, and installer URLs are all brand-driven
/// (from `BrandInstall`), so a managed brand other than clio-agent supplies its
/// own installer + env-var conventions without any code change.
///
/// `force` drives Repair / reinstall: it sets the brand's force env var so the
/// upstream installer rebuilds a broken venv/runtime from scratch instead of
/// short-circuiting on an existing (but broken) install.
pub(crate) fn build_install_command(
    install: &BrandInstall,
    git_ref: &str,
    force: bool,
) -> (String, Vec<String>) {
    let ref_env = &install.ref_env;
    let force_env = &install.force_env;
    if cfg!(windows) {
        let force_prefix = if force {
            format!("$env:{force_env}='1'; ")
        } else {
            String::new()
        };
        let url = &install.windows_url;
        let script = format!("$env:{ref_env}='{git_ref}'; {force_prefix}irm {url} | iex");
        (
            "powershell".to_string(),
            vec![
                "-NoProfile".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-Command".to_string(),
                script,
            ],
        )
    } else {
        let force_prefix = if force {
            format!("{force_env}=1 ")
        } else {
            String::new()
        };
        let url = &install.unix_url;
        let script = format!("{ref_env}={git_ref} {force_prefix}curl -fsSL {url} | bash");
        ("bash".to_string(), vec!["-c".to_string(), script])
    }
}

/// Convenience over [`build_install_command`] that pulls the active brand's
/// installer descriptor + default ref. Only valid for managed brands; a
/// connect-mode brand (no `install`) yields a harmless no-op command rather
/// than panicking — the install flow is never invoked for it.
pub(crate) fn install_command_versioned(
    force: bool,
    target_version: Option<&str>,
) -> (String, Vec<String>) {
    match brand_backend().install.as_ref() {
        Some(install) => {
            let git_ref = resolve_ref_with(&install.r#ref, target_version);
            build_install_command(install, &git_ref, force)
        }
        None => (
            "true".to_string(),
            vec![format!(
                "connect-mode brand has no installer (mode={})",
                brand_backend().mode
            )],
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A representative managed installer descriptor (clio-agent's upstream
    /// conventions) used to exercise the per-OS command construction without
    /// depending on the embedded brand (which defaults to connect-mode).
    fn managed_install() -> BrandInstall {
        BrandInstall {
            r#ref: "develop".to_string(),
            ref_env: "CLIO_REF".to_string(),
            force_env: "CLIO_FORCE".to_string(),
            windows_url:
                "https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1"
                    .to_string(),
            unix_url:
                "https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh"
                    .to_string(),
            repo_label: "github.com/iowarp/clio-agent".to_string(),
        }
    }

    /// The install command is the brand's upstream installer for the host OS:
    /// the right shell, the default ref pinned via the brand's ref env var, and
    /// the brand's installer URL.
    #[test]
    fn install_command_targets_brand_installer() {
        let inst = managed_install();
        let git_ref = resolve_ref_with(&inst.r#ref, None);
        let (program, args) = build_install_command(&inst, &git_ref, false);
        let joined = args.join(" ");

        assert!(
            joined.contains(&inst.ref_env),
            "installer must pin the brand ref env var, got: {joined}"
        );
        assert!(
            joined.contains(&inst.r#ref),
            "installer must check out the default ref, got: {joined}"
        );

        if cfg!(windows) {
            assert_eq!(program, "powershell");
            assert!(args.contains(&"-NoProfile".to_string()));
            assert!(args.contains(&"-Command".to_string()));
            assert!(
                joined.contains(&inst.windows_url) && joined.contains("iex"),
                "windows installer must pipe the brand url to iex, got: {joined}"
            );
        } else {
            assert_eq!(program, "bash");
            assert_eq!(args[0], "-c");
            assert!(
                joined.contains(&inst.unix_url)
                    && joined.contains("curl")
                    && joined.contains("bash"),
                "unix installer must curl the brand url into bash, got: {joined}"
            );
        }
    }

    /// A normal first-run install (force = false) must NOT set the force env,
    /// while a Repair (force = true) MUST — that env var is what makes the
    /// upstream installer rebuild a broken venv instead of short-circuiting.
    #[test]
    fn install_command_force_flag_toggles_force_env() {
        let inst = managed_install();
        let git_ref = resolve_ref_with(&inst.r#ref, None);

        let (_p, normal) = build_install_command(&inst, &git_ref, false);
        let normal = normal.join(" ");
        assert!(
            !normal.contains(&inst.force_env),
            "first-run install must not force a reinstall, got: {normal}"
        );

        let (_p, repair) = build_install_command(&inst, &git_ref, true);
        let repair = repair.join(" ");
        assert!(
            repair.contains(&inst.force_env),
            "repair must set the force env to rebuild a broken runtime, got: {repair}"
        );
        // Repair still targets the SAME ref as a normal install — it only adds
        // the force env, nothing else changes.
        assert!(
            repair.contains(&inst.r#ref),
            "repair must reuse the same ref, got: {repair}"
        );
        if cfg!(windows) {
            assert!(
                repair.contains("$env:CLIO_FORCE='1'"),
                "windows repair must set the force env via $env:, got: {repair}"
            );
        } else {
            assert!(
                repair.contains("CLIO_FORCE=1"),
                "unix repair must set the force env, got: {repair}"
            );
        }
    }

    /// An explicit target version (a release tag from the update panel) pins
    /// the ref to that tag instead of the brand default.
    #[test]
    fn versioned_install_pins_the_requested_ref() {
        let inst = managed_install();
        let git_ref = resolve_ref_with(&inst.r#ref, Some("v0.5.2"));
        let (_p, args) = build_install_command(&inst, &git_ref, false);
        let joined = args.join(" ");
        assert!(
            joined.contains("CLIO_REF=v0.5.2") || joined.contains("CLIO_REF='v0.5.2'"),
            "versioned install must pin the requested tag, got: {joined}"
        );
        assert!(
            !joined.contains("develop"),
            "a versioned install must NOT fall back to the default ref, got: {joined}"
        );
    }

    /// No target version → the brand default ref (NOT a pinned tag).
    #[test]
    fn versioned_install_without_target_uses_default_ref() {
        let inst = managed_install();
        let git_ref = resolve_ref_with(&inst.r#ref, None);
        let (_p, with_none) = build_install_command(&inst, &git_ref, false);
        let joined = with_none.join(" ");
        assert!(
            joined.contains(&inst.r#ref),
            "an unpinned install must use the brand default ref, got: {joined}"
        );
    }

    /// A target version carrying shell metacharacters is rejected and falls
    /// back to the default ref — the UI can never inject extra shell.
    #[test]
    fn resolve_ref_rejects_injection_and_falls_back() {
        let def = "develop";
        assert_eq!(resolve_ref_with(def, Some("v1.0.0; rm -rf /")), def);
        assert_eq!(resolve_ref_with(def, Some("$(whoami)")), def);
        assert_eq!(resolve_ref_with(def, Some("  ")), def);
        assert_eq!(resolve_ref_with(def, None), def);
        // A normal release tag passes through untouched.
        assert_eq!(resolve_ref_with(def, Some("v0.5.2")), "v0.5.2");
        assert_eq!(resolve_ref_with(def, Some("release/0.5")), "release/0.5");
    }

    /// The connect-mode default ships no installer: the convenience wrapper
    /// yields a harmless no-op command rather than panicking.
    #[test]
    fn connect_mode_install_command_is_noop() {
        // The embedded default brand is connect-mode (no install block).
        let (program, _args) = install_command_versioned(false, None);
        assert_eq!(program, "true", "connect-mode must not run a real installer");
    }
}

//! Brand-driven construction of the upstream installer command line.
//!
//! Only relevant for managed brands (those with a `backend.install` block);
//! the neutral connect-mode default ships no installer and never reaches here.

use crate::brand_backend::{brand_backend, BrandInstall};

/// A UI-supplied version or ref, trimmed and validated to a conservative charset
/// (alphanumerics plus `.`, `_`, `-`, `/`) so it can never inject extra shell.
fn safe_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let safe = !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
    safe.then(|| trimmed.to_string())
}

/// The installer's own options for this install, the ones its documentation shows.
///
/// A target version (from the version-badge update panel, a release tag like
/// `v0.5.2`) installs that release: `--version <tag>`. Otherwise a brand that pins
/// a source ref (`install.ref`) builds that ref: `--source --ref <ref>`; a brand
/// without one installs the latest stable release (no options). A value outside
/// the safe charset is ignored.
pub(crate) fn installer_args(install: &BrandInstall, target_version: Option<&str>) -> Vec<String> {
    if let Some(version) = target_version.and_then(safe_value) {
        return vec!["--version".to_string(), version];
    }
    match safe_value(&install.r#ref) {
        Some(git_ref) => vec!["--source".to_string(), "--ref".to_string(), git_ref],
        None => Vec::new(),
    }
}

/// The shell program + argument vector that runs the brand's UPSTREAM
/// installer for the current OS. This is the SAME script the manual error
/// card tells the user to copy-paste; the one-swoop flow just runs it for them
/// and streams the output. Pure (no spawn, no I/O) so the exact command line is
/// unit-testable per-OS.
///
/// Repair and install run the same command: running the installer again over a
/// release installation always rebuilds its environment (keeping the previous one
/// until the new one is in place), so no separate force switch is needed.
pub(crate) fn build_install_command(
    install: &BrandInstall,
    args: &[String],
) -> (String, Vec<String>) {
    let options = args.join(" ");
    if cfg!(windows) {
        let url = &install.windows_url;
        let script = if options.is_empty() {
            format!("irm {url} | iex")
        } else {
            format!("& ([scriptblock]::Create((irm {url}))) {options}")
        };
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
        let url = &install.unix_url;
        let script = if options.is_empty() {
            format!("curl -fsSL {url} | bash")
        } else {
            format!("curl -fsSL {url} | bash -s -- {options}")
        };
        ("bash".to_string(), vec!["-c".to_string(), script])
    }
}

/// Convenience over [`build_install_command`] that pulls the active brand's
/// installer descriptor. Only valid for managed brands; a connect-mode brand (no
/// `install`) yields a harmless no-op command rather than panicking -- the install
/// flow is never invoked for it. `force` (Repair) runs the same command; see
/// [`build_install_command`].
pub(crate) fn install_command_versioned(
    force: bool,
    target_version: Option<&str>,
) -> (String, Vec<String>) {
    let _ = force;
    let brand = brand_backend();
    install_command_for(brand.install.as_ref(), &brand.mode, target_version)
}

fn install_command_for(
    install: Option<&BrandInstall>,
    mode: &str,
    target_version: Option<&str>,
) -> (String, Vec<String>) {
    match install {
        Some(install) => build_install_command(install, &installer_args(install, target_version)),
        None => (
            "true".to_string(),
            vec![format!("connect-mode brand has no installer (mode={mode})")],
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
            unix_url: "https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh"
                .to_string(),
            repo_label: "github.com/iowarp/clio-agent".to_string(),
        }
    }

    fn joined(install: &BrandInstall, target: Option<&str>) -> String {
        let (_program, args) = build_install_command(install, &installer_args(install, target));
        args.join(" ")
    }

    /// The install command is the brand's upstream installer for the host OS: the
    /// right shell and the brand's installer URL. A brand with no source ref installs
    /// the latest stable release, with no options.
    #[test]
    fn install_command_targets_brand_installer() {
        let inst = BrandInstall {
            r#ref: String::new(),
            ..managed_install()
        };
        let (program, args) = build_install_command(&inst, &installer_args(&inst, None));
        let joined = args.join(" ");
        if cfg!(windows) {
            assert_eq!(program, "powershell");
            assert!(args.contains(&"-NoProfile".to_string()));
            assert_eq!(
                joined.split("-Command ").nth(1),
                Some(&*format!("irm {} | iex", inst.windows_url))
            );
        } else {
            assert_eq!(program, "bash");
            assert_eq!(args[0], "-c");
            assert_eq!(args[1], format!("curl -fsSL {} | bash", inst.unix_url));
        }
        assert!(!joined.contains("CLIO_REF") && !joined.contains("CLIO_FORCE"));
    }

    /// A chosen release is installed as that release, never built from source.
    #[test]
    fn a_target_version_installs_that_release() {
        let joined = joined(&managed_install(), Some("v0.5.2"));
        assert!(joined.contains("--version v0.5.2"), "got: {joined}");
        assert!(
            !joined.contains("--source") && !joined.contains("develop"),
            "got: {joined}"
        );
    }

    /// A brand that pins a source ref builds it with the installer's own options.
    #[test]
    fn a_brand_source_ref_builds_that_ref() {
        let joined = joined(&managed_install(), None);
        assert!(joined.contains("--source --ref develop"), "got: {joined}");
        if cfg!(windows) {
            assert!(joined.contains("[scriptblock]::Create"), "got: {joined}");
        } else {
            assert!(joined.contains("| bash -s -- --source"), "got: {joined}");
        }
    }

    /// Repair runs the same command as install: a re-run always rebuilds a release.
    #[test]
    fn repair_runs_the_same_installer() {
        let inst = managed_install();
        let target = Some("v0.5.2");
        let normal = build_install_command(&inst, &installer_args(&inst, target));
        assert_eq!(
            normal,
            install_command_for(Some(&inst), "managed", target),
            "install_command_for must build the same command"
        );
    }

    /// A target version or ref carrying shell metacharacters is ignored -- the UI can
    /// never inject extra shell.
    #[test]
    fn unsafe_values_are_ignored() {
        let inst = BrandInstall {
            r#ref: String::new(),
            ..managed_install()
        };
        for target in ["v1.0.0; rm -rf /", "$(whoami)", "  "] {
            assert!(installer_args(&inst, Some(target)).is_empty(), "{target}");
        }
        let unsafe_ref = BrandInstall {
            r#ref: "main; reboot".to_string(),
            ..managed_install()
        };
        assert!(installer_args(&unsafe_ref, None).is_empty());
        assert_eq!(
            installer_args(&inst, Some("release/0.5")),
            ["--version", "release/0.5"]
        );
    }

    /// A connect-mode brand ships no installer: command construction yields a
    /// harmless no-op rather than depending on whichever brand was generated
    /// for the current dev/test invocation.
    #[test]
    fn connect_mode_install_command_is_noop() {
        let (program, args) = install_command_for(None, "connect", None);
        assert_eq!(
            program, "true",
            "connect-mode must not run a real installer"
        );
        assert!(args[0].contains("mode=connect"));
    }
}

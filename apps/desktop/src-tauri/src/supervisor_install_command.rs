/// Git ref of clio-agent the upstream installer should check out. Matches
/// the `CLIO_REF=develop` the manual install hint uses.
const CLIO_INSTALL_REF: &str = "develop";

/// The shell program + argument vector that runs the UPSTREAM clio-agent
/// installer for the current OS. This is the SAME script the manual error
/// card tells the user to copy-paste; the one-swoop flow just runs it for
/// them and streams the output.
///
/// Extracted as a pure function (no spawn, no I/O) so the exact command line
/// is unit-testable per-OS.
///
/// `force` drives the Repair / reinstall flow: it sets `CLIO_FORCE=1` so the
/// upstream installer rebuilds a broken venv/runtime from scratch instead of
/// short-circuiting when it sees an existing (but broken) install. A normal
/// first-run install passes `force = false`.
///
/// - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -Command
///   "$env:CLIO_REF='develop'; [$env:CLIO_FORCE='1';] irm <install.ps1 url> | iex"`
/// - macOS/Linux: `bash -c "CLIO_REF=develop [CLIO_FORCE=1] curl -fsSL <install.sh url> | bash"`
pub(crate) fn install_command(force: bool) -> (String, Vec<String>) {
    if cfg!(windows) {
        let force_prefix = if force { "$env:CLIO_FORCE='1'; " } else { "" };
        let script = format!(
            "$env:CLIO_REF='{CLIO_INSTALL_REF}'; {force_prefix}\
             irm https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1 | iex"
        );
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
        let force_prefix = if force { "CLIO_FORCE=1 " } else { "" };
        let script = format!(
            "CLIO_REF={CLIO_INSTALL_REF} {force_prefix}\
             curl -fsSL https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh | bash"
        );
        ("bash".to_string(), vec!["-c".to_string(), script])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The install command is the upstream installer for the host OS. We
    /// assert the parts that matter: the right shell, the develop ref, and
    /// the upstream URL — the SAME one-liner the manual error card shows.
    #[test]
    fn install_command_targets_upstream_installer() {
        let (program, args) = install_command(false);
        let joined = args.join(" ");

        assert!(
            joined.contains("CLIO_REF"),
            "installer must pin the clio ref env var, got: {joined}"
        );
        assert!(
            joined.contains(CLIO_INSTALL_REF),
            "installer must check out the `{CLIO_INSTALL_REF}` ref, got: {joined}"
        );
        assert!(
            joined.contains("raw.githubusercontent.com/iowarp/clio-agent"),
            "installer must fetch from the upstream repo, got: {joined}"
        );

        if cfg!(windows) {
            assert_eq!(program, "powershell");
            assert!(args.contains(&"-NoProfile".to_string()));
            assert!(args.contains(&"-Command".to_string()));
            assert!(
                joined.contains("install.ps1") && joined.contains("iex"),
                "windows installer must pipe install.ps1 to iex, got: {joined}"
            );
        } else {
            assert_eq!(program, "bash");
            assert_eq!(args[0], "-c");
            assert!(
                joined.contains("install.sh") && joined.contains("curl") && joined.contains("bash"),
                "unix installer must curl install.sh into bash, got: {joined}"
            );
        }
    }

    /// A normal first-run install (force = false) must NOT set CLIO_FORCE,
    /// while a Repair (force = true) MUST — that env var is what makes the
    /// upstream installer rebuild a broken venv instead of short-circuiting.
    #[test]
    fn install_command_force_flag_toggles_clio_force() {
        let (_p, normal) = install_command(false);
        let normal = normal.join(" ");
        assert!(
            !normal.contains("CLIO_FORCE"),
            "first-run install must not force a reinstall, got: {normal}"
        );

        let (_p, repair) = install_command(true);
        let repair = repair.join(" ");
        assert!(
            repair.contains("CLIO_FORCE"),
            "repair must set CLIO_FORCE to rebuild a broken runtime, got: {repair}"
        );
        // Repair still targets the SAME upstream installer + ref as a normal
        // install — it only adds the force env, nothing else changes.
        assert!(
            repair.contains(CLIO_INSTALL_REF)
                && repair.contains("raw.githubusercontent.com/iowarp/clio-agent"),
            "repair must reuse the upstream installer, got: {repair}"
        );
        if cfg!(windows) {
            assert!(
                repair.contains("$env:CLIO_FORCE='1'"),
                "windows repair must set the force env via $env:, got: {repair}"
            );
        } else {
            assert!(
                repair.contains("CLIO_FORCE=1"),
                "unix repair must set CLIO_FORCE=1, got: {repair}"
            );
        }
    }
}

//! Post-update verification of the bundled CLIO runtime.
//!
//! An in-place `uv pip install` can report success while leaving a runtime
//! that cannot start: the 0.9.4.14 -> 0.9.4.15 update kept the previous
//! release's dependency bytecode, so the backend died on import and the app
//! only showed "launcher exited early" on reconnect. Verification therefore
//! runs the real entry point, not just a version probe: the update is reported
//! as done only when `python -m clio_agent.gact --help` imports the complete
//! application from the runtime directory, exactly as the launcher starts it.

use std::{
    path::{Path, PathBuf},
    process::Command,
};

use crate::supervisor_boot_log::boot_log_line;

/// One verification command and how to describe its failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct VerifyStep {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub failure: &'static str,
}

/// A failed verification step, ready for the `clio:install-failed` event.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct VerifyFailure {
    pub code: Option<i32>,
    pub tail: String,
}

/// Steps that prove an updated bundled runtime is the requested version AND
/// starts. `runtime_dir` is the directory holding `runtime.json`.
pub(crate) fn bundled_update_verify_steps(
    runtime_dir: &Path,
    python: &Path,
    version: &str,
) -> Vec<VerifyStep> {
    let python = python.to_string_lossy().into_owned();
    vec![
        VerifyStep {
            program: python.clone(),
            args: vec!["-c".to_string(), bundled_update_version_script(version)],
            cwd: None,
            failure: "CLIO update verification failed.",
        },
        VerifyStep {
            program: python,
            args: vec![
                "-m".to_string(),
                "clio_agent.gact".to_string(),
                "--help".to_string(),
            ],
            cwd: Some(runtime_dir.to_path_buf()),
            failure: "The updated CLIO service does not start.",
        },
    ]
}

/// Python check that exactly `version` of clio-agent is installed and loaded,
/// clearing clio-agent's own stale metadata and bytecode first.
pub(crate) fn bundled_update_version_script(version: &str) -> String {
    format!(
        "from pathlib import Path; import importlib.util as u,importlib.metadata as m,shutil,sys; spec=u.find_spec('clio_agent'); root=Path(spec.origin).parent if spec and spec.origin else None; metadata=list(root.parent.glob('clio_agent-*.dist-info')) if root else []; target=next((path for path in metadata if path.name.lower() == 'clio_agent-{version}.dist-info'),None); [shutil.rmtree(path,ignore_errors=True) for path in metadata if target and path != target]; [shutil.rmtree(path,ignore_errors=True) for path in root.rglob('__pycache__')] if root else None; import clio_agent; actual=str(getattr(clio_agent,'__version__','')); installed={{d.version for d in m.distributions(name='clio-agent')}}; print(actual); sys.exit(0 if target and actual == '{version}' and installed == {{'{version}'}} else 1)"
    )
}

fn verify_command(step: &VerifyStep) -> Command {
    let mut command = Command::new(&step.program);
    command.args(&step.args);
    if let Some(cwd) = &step.cwd {
        command.current_dir(cwd);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command
}

/// Run every step in order, copying each step's output into the boot log.
/// Returns the first failure, carrying the tail of that step's stderr (the
/// Python traceback when the service cannot import).
pub(crate) fn run_verify_steps(steps: &[VerifyStep]) -> Result<(), VerifyFailure> {
    for step in steps {
        let output = verify_command(step)
            .output()
            .map_err(|error| VerifyFailure {
                code: None,
                tail: format!("Could not verify the updated CLIO runtime: {error}"),
            })?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        for line in stderr.lines() {
            boot_log_line(line);
        }
        if !output.status.success() {
            return Err(VerifyFailure {
                code: output.status.code(),
                tail: format!("{} {}", step.failure, tail_lines(&stderr, 20)),
            });
        }
        if let Some(version) = stdout.lines().next().filter(|line| !line.trim().is_empty()) {
            if step.args.first().map(String::as_str) == Some("-c") {
                boot_log_line(&format!("verified managed CLIO runtime {}", version.trim()));
            }
        }
    }
    boot_log_line("verified the updated CLIO service imports and starts");
    Ok(())
}

fn tail_lines(text: &str, count: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(count);
    lines[start..].join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_starts_the_real_entry_point_from_the_runtime_dir() {
        let runtime = Path::new("C:/runtime/gact-runtime");
        let steps =
            bundled_update_verify_steps(runtime, &runtime.join("python/python.exe"), "0.9.4.16");

        assert_eq!(steps.len(), 2);
        assert!(steps[0].args[1].contains("installed == {'0.9.4.16'}"));
        assert_eq!(steps[1].args, ["-m", "clio_agent.gact", "--help"]);
        assert_eq!(steps[1].cwd.as_deref(), Some(runtime));
    }

    #[test]
    fn version_script_verifies_imported_code_and_unique_distribution() {
        let script = bundled_update_version_script("0.9.4.9");

        assert!(script.contains("target and path != target"));
        assert!(script.contains("root.rglob('__pycache__')"));
        assert!(script.contains("clio_agent,'__version__'"));
        assert!(script.contains("installed == {'0.9.4.9'}"));
    }

    #[cfg(windows)]
    const SHELL: (&str, &str) = ("cmd", "/C");
    #[cfg(not(windows))]
    const SHELL: (&str, &str) = ("sh", "-c");

    fn shell_step(script: &str, failure: &'static str) -> VerifyStep {
        VerifyStep {
            program: SHELL.0.to_string(),
            args: vec![SHELL.1.to_string(), script.to_string()],
            cwd: None,
            failure,
        }
    }

    #[test]
    fn a_service_that_cannot_start_fails_the_update_with_its_traceback() {
        let steps = vec![
            shell_step("exit 0", "first"),
            shell_step(
                "echo ImportError: cannot import name 1>&2 && exit 1",
                "The updated CLIO service does not start.",
            ),
        ];

        let failure = run_verify_steps(&steps).expect_err("second step must fail the update");

        assert_eq!(failure.code, Some(1));
        assert!(failure
            .tail
            .starts_with("The updated CLIO service does not start."));
        assert!(failure.tail.contains("ImportError: cannot import name"));
    }

    #[test]
    fn every_passing_step_verifies_the_update() {
        let steps = vec![
            shell_step("exit 0", "first"),
            shell_step("exit 0", "second"),
        ];

        assert_eq!(run_verify_steps(&steps), Ok(()));
    }

    #[test]
    fn a_missing_interpreter_is_reported_not_ignored() {
        let steps = vec![VerifyStep {
            program: "definitely-not-a-real-python-binary".to_string(),
            args: Vec::new(),
            cwd: None,
            failure: "unused",
        }];

        let failure = run_verify_steps(&steps).expect_err("spawn failure must fail the update");
        assert_eq!(failure.code, None);
        assert!(failure
            .tail
            .starts_with("Could not verify the updated CLIO runtime"));
    }
}

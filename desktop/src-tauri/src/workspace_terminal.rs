use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, PartialEq, Eq)]
struct TerminalCommand {
    program: &'static str,
    arguments: Vec<String>,
    working_directory: Option<PathBuf>,
}

fn terminal_commands(path: &Path) -> Vec<TerminalCommand> {
    #[cfg(target_os = "windows")]
    {
        vec![
            TerminalCommand {
                program: "wt.exe",
                arguments: vec!["-d".into(), path.display().to_string()],
                working_directory: None,
            },
            TerminalCommand {
                program: "powershell.exe",
                arguments: vec!["-NoLogo".into(), "-NoExit".into()],
                working_directory: Some(path.to_path_buf()),
            },
        ]
    }
    #[cfg(target_os = "macos")]
    {
        vec![TerminalCommand {
            program: "open",
            arguments: vec!["-a".into(), "Terminal".into(), path.display().to_string()],
            working_directory: None,
        }]
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        vec![
            TerminalCommand {
                program: "x-terminal-emulator",
                arguments: Vec::new(),
                working_directory: Some(path.to_path_buf()),
            },
            TerminalCommand {
                program: "gnome-terminal",
                arguments: Vec::new(),
                working_directory: Some(path.to_path_buf()),
            },
            TerminalCommand {
                program: "konsole",
                arguments: vec!["--workdir".into(), path.display().to_string()],
                working_directory: None,
            },
        ]
    }
}

/// Resolve a requested workspace path to a real, existing directory.
///
/// This is the one piece of validation the desktop actually has today for
/// "is this cwd a workspace the desktop knows about": the path must be
/// non-empty and canonicalize to a directory that exists. There is no
/// separate allow-listed roots table to consult — [`open_workspace_terminal`]
/// and the embedded PTY's `terminal_open` command (`terminal_pty.rs`) both
/// reject on this same check, so an embedded terminal can never be pointed
/// at a `cwd` the OS-terminal path would have refused.
pub(crate) fn resolve_workspace_dir(path: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(path.trim());
    if requested.as_os_str().is_empty() {
        return Err("The workspace path is empty.".into());
    }
    let workspace = requested
        .canonicalize()
        .map_err(|error| format!("The workspace path is unavailable: {error}"))?;
    if !workspace.is_dir() {
        return Err("The workspace path is not a directory.".into());
    }
    Ok(workspace)
}

/// Open an OS terminal rooted at an existing workspace directory.
#[tauri::command]
pub fn open_workspace_terminal(path: String) -> Result<String, String> {
    let workspace = resolve_workspace_dir(&path)?;

    let mut failures = Vec::new();
    for candidate in terminal_commands(&workspace) {
        let mut command = Command::new(candidate.program);
        command
            .args(&candidate.arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(directory) = candidate.working_directory {
            command.current_dir(directory);
        }
        match command.spawn() {
            Ok(_) => return Ok(workspace.display().to_string()),
            Err(error) => failures.push(format!("{}: {error}", candidate.program)),
        }
    }

    Err(format!(
        "No supported terminal could be started ({})",
        failures.join("; ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_candidates_preserve_paths_as_arguments_or_working_directories() {
        let path = PathBuf::from(r"C:\science data\Palm Springs");
        let candidates = terminal_commands(&path);

        assert!(!candidates.is_empty());
        assert!(candidates.iter().all(|candidate| {
            candidate.working_directory.as_deref() == Some(path.as_path())
                || candidate
                    .arguments
                    .iter()
                    .any(|argument| argument == &path.display().to_string())
        }));
    }
}

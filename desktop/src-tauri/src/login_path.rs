//! Give GUI launches the user's shell PATH (#739 C2).
//!
//! macOS starts Finder, Dock and Launchpad apps with launchd's minimal
//! `/usr/bin:/bin:/usr/sbin:/sbin`. Every child process inherits it: the agent,
//! its tools and plugins, and the integrated terminal. Homebrew, `uv` and
//! user-installed tools are then missing, and bare `git`/`python3` resolve to
//! the `/usr/bin` stubs that offer to install Xcode tools. Before any thread or
//! child starts, ask the user's shell for its PATH once, as Terminal would
//! see it, and fall back to the common tool folders when the shell cannot
//! answer in time.

use std::path::Path;
#[cfg(target_os = "macos")]
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use std::time::Duration;

const MARKER: &str = "__LOGIN_SHELL_PATH__";
#[cfg(target_os = "macos")]
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const LAUNCHD_DIRS: [&str; 4] = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];

#[cfg(target_os = "macos")]
static OUTCOME: OnceLock<String> = OnceLock::new();

/// Whether `path` only holds launchd's defaults, which means the app was not
/// started from a shell that already set up PATH.
fn is_launchd_path(path: &str) -> bool {
    path.split(':')
        .filter(|dir| !dir.is_empty())
        .all(|dir| LAUNCHD_DIRS.contains(&dir))
}

/// The PATH printed between the probe's markers, ignoring anything the
/// shell's startup files print around it.
fn extract_marked_path(output: &str) -> Option<&str> {
    let start = output.find(MARKER)? + MARKER.len();
    let rest = &output[start..];
    let path = rest[..rest.find(MARKER)?].trim();
    (!path.is_empty()).then_some(path)
}

/// `preferred` folders first, then the existing ones, without duplicates.
fn merge_path<'a>(preferred: impl IntoIterator<Item = &'a str>, existing: &'a str) -> String {
    let mut dirs: Vec<&str> = Vec::new();
    for dir in preferred.into_iter().chain(existing.split(':')) {
        if !dir.is_empty() && !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs.join(":")
}

/// Common tool folders, used when the login shell cannot report its PATH.
fn fallback_dirs(home: Option<&Path>, is_dir: impl Fn(&Path) -> bool) -> Vec<String> {
    let mut candidates: Vec<std::path::PathBuf> = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ]
    .iter()
    .map(Into::into)
    .collect();
    if let Some(home) = home {
        candidates.push(home.join(".local/bin"));
        candidates.push(home.join(".cargo/bin"));
    }
    candidates
        .into_iter()
        .filter(|dir| is_dir(dir))
        .filter_map(|dir| dir.to_str().map(str::to_owned))
        .collect()
}

/// Run the user's shell as an interactive login shell (so both profile and rc
/// files apply, as in Terminal) and read the PATH it prints. Reading stops at
/// the closing marker, so a background job started by a startup file and
/// still holding the pipe cannot stall the launch.
#[cfg(target_os = "macos")]
fn login_shell_path() -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::sync::mpsc;

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|shell| shell.starts_with('/'))
        .unwrap_or_else(|| "/bin/zsh".to_string());
    let script = format!("printf '{MARKER}%s{MARKER}' \"$PATH\"");
    let mut child = Command::new(&shell)
        .args(["-i", "-l", "-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("{shell} did not start: {error}"))?;
    let mut stdout = child.stdout.take().ok_or("no shell output pipe")?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            match stdout.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    output.extend_from_slice(&chunk[..read]);
                    if extract_marked_path(&String::from_utf8_lossy(&output)).is_some() {
                        break;
                    }
                }
            }
        }
        let _ = tx.send(String::from_utf8_lossy(&output).into_owned());
    });
    let output = rx.recv_timeout(PROBE_TIMEOUT);
    let _ = child.kill();
    let _ = child.wait();
    let output =
        output.map_err(|_| format!("{shell} did not report PATH within {PROBE_TIMEOUT:?}"))?;
    extract_marked_path(&output)
        .map(str::to_owned)
        .ok_or_else(|| format!("{shell} did not print PATH"))
}

/// Adopt the login shell's PATH when the app was started by launchd. Must run
/// before the app starts threads or children; [`outcome`] reports what
/// happened for the boot log.
#[cfg(target_os = "macos")]
pub(crate) fn adopt_login_shell_path() {
    let current = std::env::var("PATH").unwrap_or_default();
    if !is_launchd_path(&current) {
        let _ = OUTCOME.set("PATH inherited from the launching shell".to_string());
        return;
    }
    let started = std::time::Instant::now();
    let (path, outcome) = match login_shell_path() {
        Ok(login) => {
            let merged = merge_path(login.split(':'), &current);
            let note = format!(
                "PATH taken from the login shell in {} ms",
                started.elapsed().as_millis()
            );
            (merged, note)
        }
        Err(error) => {
            let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
            let extra = fallback_dirs(home.as_deref(), Path::is_dir);
            let merged = merge_path(extra.iter().map(String::as_str), &current);
            (merged, format!("{error}; added common tool folders to PATH"))
        }
    };
    std::env::set_var("PATH", &path);
    let _ = OUTCOME.set(outcome);
}

/// What [`adopt_login_shell_path`] did, for the boot log.
#[cfg(target_os = "macos")]
pub(crate) fn outcome() -> Option<&'static str> {
    OUTCOME.get().map(String::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn launchd_path_is_recognized_and_shell_paths_are_kept() {
        assert!(is_launchd_path("/usr/bin:/bin:/usr/sbin:/sbin"));
        assert!(is_launchd_path("/usr/bin:/bin"));
        assert!(is_launchd_path(""));
        assert!(!is_launchd_path("/opt/homebrew/bin:/usr/bin:/bin"));
        assert!(!is_launchd_path("/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"));
    }

    #[test]
    fn marked_path_ignores_startup_file_output() {
        let output =
            format!("Welcome!\n\x1b]0;title\x07{MARKER}/opt/homebrew/bin:/usr/bin{MARKER}bye");
        assert_eq!(
            extract_marked_path(&output),
            Some("/opt/homebrew/bin:/usr/bin")
        );
        assert_eq!(extract_marked_path(&format!("{MARKER}/usr/bin")), None);
        assert_eq!(extract_marked_path(&format!("{MARKER}{MARKER}")), None);
        assert_eq!(extract_marked_path("no markers"), None);
    }

    #[test]
    fn merged_path_puts_shell_folders_first_without_duplicates() {
        assert_eq!(
            merge_path(
                "/opt/homebrew/bin:/usr/bin:/bin".split(':'),
                "/usr/bin:/bin:/usr/sbin:/sbin"
            ),
            "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        );
        assert_eq!(merge_path(["", "/a"], "/a::/b"), "/a:/b");
    }

    #[test]
    fn fallback_keeps_only_existing_tool_folders() {
        let home = PathBuf::from("/Users/someone");
        let existing = [
            PathBuf::from("/opt/homebrew/bin"),
            home.join(".local/bin"),
        ];
        let dirs = fallback_dirs(Some(&home), |dir| existing.iter().any(|e| e == dir));
        let local_bin = home.join(".local/bin").to_string_lossy().into_owned();
        assert_eq!(dirs, vec!["/opt/homebrew/bin".to_owned(), local_bin]);
        assert!(fallback_dirs(None, |_| false).is_empty());
    }
}

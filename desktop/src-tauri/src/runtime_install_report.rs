//! Report a failed installer runtime preparation to the user.
//!
//! The native installer runs `clio-desktop --prepare-runtime` and, on a
//! non-zero exit, shows its captured stderr in the failure dialog. This module
//! owns what that failure leaves behind so the reason is never lost:
//!
//! - `data/runtime-install-error.log`: the error and where to report it. The user attaches this file to an issue.
//! - `data/runtime-install-issue-url.txt`: the brand's new-issue URL, read by
//!   the installer so its dialog can offer to open the issue page. Absent when
//!   the brand names no GitHub repository.
//!
//! A later successful preparation removes both files.

use std::fs;
use std::path::{Path, PathBuf};

use crate::brand_backend::brand_backend;

const ERROR_LOG_NAME: &str = "runtime-install-error.log";
const ISSUE_URL_NAME: &str = "runtime-install-issue-url.txt";

/// The new-issue URL for the brand's backend repository, when the brand names
/// a GitHub repository (`github.com/<owner>/<repo>`).
pub(crate) fn issue_url() -> Option<String> {
    let backend = brand_backend();
    let label = backend
        .install
        .as_ref()
        .map(|install| install.repo_label.clone())
        .or_else(|| backend.repo_label.clone())?;
    issue_url_for_repo_label(&label)
}

fn issue_url_for_repo_label(label: &str) -> Option<String> {
    let path = label
        .trim()
        .trim_end_matches('/')
        .strip_prefix("github.com/")?;
    let mut parts = path.split('/');
    let (Some(owner), Some(repo), None) = (parts.next(), parts.next(), parts.next()) else {
        return None;
    };
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(format!("https://github.com/{owner}/{repo}/issues/new"))
}

fn data_dir(install_dir: &Path) -> PathBuf {
    install_dir.join("data")
}

/// Write the failure log and the issue URL for the installer dialog, and
/// return the text the installer shows (printed to stderr by the caller).
pub(crate) fn record_failure(install_dir: &Path, error: &str, issue_url: Option<&str>) -> String {
    let data = data_dir(install_dir);
    let log_path = data.join(ERROR_LOG_NAME);
    let mut log = format!("Runtime installation failed.\n\nError: {error}\n");
    if let Some(url) = issue_url {
        log.push_str(&format!(
            "\nPlease open an issue at {url} and attach this file.\n"
        ));
    }
    // The dialog still shows the error when these writes fail, so a failed
    // write only loses the copy on disk, never the reason itself.
    let written = fs::create_dir_all(&data).and_then(|()| fs::write(&log_path, &log));
    let issue_path = data.join(ISSUE_URL_NAME);
    match issue_url {
        Some(url) => {
            let _ = fs::write(&issue_path, url);
        }
        None => {
            let _ = fs::remove_file(&issue_path);
        }
    }

    let mut message = error.to_string();
    match written {
        Ok(()) => message.push_str(&format!(
            "\n\nThe details are saved in {}",
            log_path.display()
        )),
        Err(write_error) => message.push_str(&format!(
            "\n\nThe details could not be saved to {}: {write_error}",
            log_path.display()
        )),
    }
    message
}

/// Remove what a previous failed preparation left behind.
pub(crate) fn clear_failure(install_dir: &Path) {
    let data = data_dir(install_dir);
    let _ = fs::remove_file(data.join(ERROR_LOG_NAME));
    let _ = fs::remove_file(data.join(ISSUE_URL_NAME));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_case(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("clio-runtime-report-{name}-{suffix}"))
    }

    #[test]
    fn issue_url_is_derived_only_from_a_github_repository_label() {
        assert_eq!(
            issue_url_for_repo_label("github.com/iowarp/clio-agent"),
            Some("https://github.com/iowarp/clio-agent/issues/new".to_string())
        );
        assert_eq!(
            issue_url_for_repo_label(" github.com/iowarp/clio-agent/ "),
            Some("https://github.com/iowarp/clio-agent/issues/new".to_string())
        );
        assert_eq!(issue_url_for_repo_label("gitlab.com/a/b"), None);
        assert_eq!(issue_url_for_repo_label("github.com/iowarp"), None);
        assert_eq!(issue_url_for_repo_label("github.com/a/b/c"), None);
        assert_eq!(issue_url_for_repo_label("the configured backend"), None);
    }

    #[test]
    fn failure_keeps_the_error_in_the_log_and_the_dialog_text() {
        let install_dir = temp_case("failure");
        let error = "activate prepared runtime: Access is denied. (os error 5)";
        let url = "https://github.com/iowarp/clio-agent/issues/new";

        let message = record_failure(&install_dir, error, Some(url));

        assert!(
            message.starts_with(error),
            "dialog text leads with the real error"
        );
        assert!(
            message.contains(ERROR_LOG_NAME),
            "dialog text names the log file"
        );
        let log = fs::read_to_string(install_dir.join("data").join(ERROR_LOG_NAME)).expect("log");
        assert!(log.contains(error));
        assert!(log.contains(url));
        let issue = fs::read_to_string(install_dir.join("data").join(ISSUE_URL_NAME)).expect("url");
        assert_eq!(issue, url);

        clear_failure(&install_dir);
        assert!(!install_dir.join("data").join(ERROR_LOG_NAME).exists());
        assert!(!install_dir.join("data").join(ISSUE_URL_NAME).exists());
        let _ = fs::remove_dir_all(&install_dir);
    }

    #[test]
    fn failure_without_a_repository_writes_no_issue_url() {
        let install_dir = temp_case("no-repo");
        fs::create_dir_all(install_dir.join("data")).expect("data dir");
        fs::write(install_dir.join("data").join(ISSUE_URL_NAME), "stale").expect("stale url");

        let message = record_failure(&install_dir, "disk full", None);

        assert!(message.starts_with("disk full"));
        assert!(!install_dir.join("data").join(ISSUE_URL_NAME).exists());
        let log = fs::read_to_string(install_dir.join("data").join(ERROR_LOG_NAME)).expect("log");
        assert!(!log.contains("open an issue"));
        let _ = fs::remove_dir_all(&install_dir);
    }
}

//! Remote-command steps parsed from the transport's own markers.
//!
//! Every command the transport runs is framed as
//! `__CLIO_BEGIN_<id>__ … output … __CLIO_END_<id>__:<exit code>`. This module
//! reads those frames back out of the raw pseudo-terminal output so the UI can
//! show which remote step is running, what the installer is doing right now
//! (its own `==>` lines), and how each step ended — from real output, not from
//! elapsed time.

use serde::Serialize;

use crate::ssh_transport_output::{clean_transport_log, last_meaningful_line};

const BEGIN_PREFIX: &str = "__CLIO_BEGIN_";
const END_PREFIX: &str = "__CLIO_END_";

/// One framed remote command found in transport output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkerBlock {
    pub id: String,
    /// Raw output between the frame markers (control sequences included).
    pub body: String,
    /// `None` while the command is still running.
    pub exit_code: Option<i32>,
}

/// Every framed command in `text`, in the order they began.
pub fn parse_marker_blocks(text: &str) -> Vec<MarkerBlock> {
    let mut blocks = Vec::new();
    let mut cursor = 0;
    while let Some(relative) = text[cursor..].find(BEGIN_PREFIX) {
        let id_start = cursor + relative + BEGIN_PREFIX.len();
        let Some(id_len) = text[id_start..].find("__") else {
            break;
        };
        let id = &text[id_start..id_start + id_len];
        let body_start = id_start + id_len + 2;
        let end_marker = format!("{END_PREFIX}{id}__:");
        match text[body_start..].find(&end_marker) {
            Some(end_relative) => {
                let body_end = body_start + end_relative;
                let status_start = body_end + end_marker.len();
                let status: String = text[status_start..]
                    .chars()
                    .take_while(|ch| ch.is_ascii_digit() || *ch == '-')
                    .collect();
                let exit_code = status.parse::<i32>().ok();
                blocks.push(MarkerBlock {
                    id: id.to_string(),
                    body: text[body_start..body_end].to_string(),
                    // A frame whose status has not fully arrived is still running.
                    exit_code,
                });
                cursor = status_start + status.len();
            }
            None => {
                blocks.push(MarkerBlock {
                    id: id.to_string(),
                    body: text[body_start..].to_string(),
                    exit_code: None,
                });
                break;
            }
        }
    }
    blocks
}

/// The installer's current step: its latest `==>` line, without the arrow.
pub fn latest_installer_step(body: &str) -> Option<String> {
    clean_transport_log(body)
        .lines()
        .rev()
        .filter_map(|line| line.trim_start().strip_prefix("==>"))
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(160).collect())
}

/// What a remote command does, for the deployment stage list.
///
/// Recognizes the commands CLIO's own deployment plan sends (the capability
/// probe, the release installer, the launcher's `start`); anything else is
/// `other` and is shown only in the log.
pub fn classify_command(program: &str, args: &[String]) -> &'static str {
    let script = args.join(" ");
    let is_shell = matches!(program, "sh" | "bash" | "powershell" | "pwsh");
    if !is_shell {
        return "other";
    }
    // CLIO's deploy steps name themselves with a `# clio-deploy:<step>` tag.
    if script.contains("# clio-deploy:claim") {
        return "claim";
    }
    if script.contains("# clio-deploy:teardown") {
        return "teardown";
    }
    if script.contains("uname -s") || script.contains("PROCESSOR_ARCHITECTURE") {
        "probe"
    } else if script.contains("install/install.sh") || script.contains("install/install.ps1") {
        "install"
    } else if script.trim_end().ends_with("clio\" start") || script.contains("clio\" start ") {
        "start"
    } else {
        "other"
    }
}

/// A step's progress, emitted as `clio:ssh-transport-step`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SshStepEvent {
    pub session_id: String,
    pub request_id: String,
    /// `probe`, `claim`, `install`, `start`, `teardown`, `tunnel`, or `other`.
    pub kind: &'static str,
    /// `running`, `done`, or `failed`.
    pub phase: &'static str,
    pub exit_code: Option<i32>,
    /// While running: the installer's current `==>` step. When failed: a
    /// one-line reason. Otherwise empty.
    pub detail: String,
}

/// The event a block's current state corresponds to.
pub fn step_event(
    session_id: &str,
    kind: &'static str,
    block: &MarkerBlock,
    allowed_exit_codes: &[i32],
) -> SshStepEvent {
    let (phase, detail) = match block.exit_code {
        None => (
            "running",
            latest_installer_step(&block.body).unwrap_or_default(),
        ),
        // The claim and teardown outcomes ("Stopped an old CLIO (pid N,
        // path)") are the point of those steps, so they stay visible.
        Some(code) if allowed_exit_codes.contains(&code) => (
            "done",
            if matches!(kind, "claim" | "teardown") {
                latest_installer_step(&block.body).unwrap_or_default()
            } else {
                String::new()
            },
        ),
        Some(code) => (
            "failed",
            last_meaningful_line(&block.body)
                .unwrap_or_else(|| format!("The remote command exited with status {code}.")),
        ),
    };
    SshStepEvent {
        session_id: session_id.to_string(),
        request_id: block.id.clone(),
        kind,
        phase,
        exit_code: block.exit_code,
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ARES_LOG: &str = include_str!("../tests/fixtures/ares-deploy-log.txt");

    #[test]
    fn parses_every_framed_step_of_the_real_ares_deployment() {
        let blocks = parse_marker_blocks(ARES_LOG);
        let ids: Vec<_> = blocks.iter().map(|block| block.id.as_str()).collect();
        assert_eq!(
            ids,
            ["acd03c1bfbc132de", "f19f84575c9cd6d8", "567b3598b4d3ec49"]
        );
        assert!(blocks.iter().all(|block| block.exit_code == Some(0)));
        assert!(blocks[0].body.contains("Linux|x86_64|none|1|1|1"));
        assert!(blocks[1].body.contains("Installing launcher"));
        assert!(blocks[2].body.contains("healthy (pid 3187536)"));
    }

    #[test]
    fn installer_substeps_come_from_its_own_arrow_lines() {
        let blocks = parse_marker_blocks(ARES_LOG);
        assert_eq!(latest_installer_step(&blocks[0].body), None);
        assert_eq!(
            latest_installer_step(&blocks[1].body).as_deref(),
            Some("Done.")
        );
        assert_eq!(
            latest_installer_step(&blocks[2].body).as_deref(),
            Some("healthy (pid 3187536)")
        );
        // Mid-install: the frame is open and the latest arrow line is current.
        let cut = ARES_LOG.find("Web UI bundle installed").unwrap();
        let partial = parse_marker_blocks(&ARES_LOG[..cut]);
        let installing = partial.last().unwrap();
        assert_eq!(installing.exit_code, None);
        assert_eq!(
            latest_installer_step(&installing.body).as_deref(),
            Some("Downloading clio-tui-linux-amd64 from clio-agent v0.9.4.17")
        );
    }

    #[test]
    fn stage_events_follow_the_frames() {
        let cut = ARES_LOG.find("Creating virtual environment").unwrap();
        let partial = parse_marker_blocks(&ARES_LOG[..cut]);
        let running = step_event("s", "install", partial.last().unwrap(), &[0]);
        assert_eq!(running.phase, "running");
        assert_eq!(
            running.detail,
            "Installing clio-agent[argonne]==0.9.4.17 from PyPI"
        );

        let complete = parse_marker_blocks(ARES_LOG);
        let done = step_event("s", "probe", &complete[0], &[0]);
        assert_eq!((done.phase, done.exit_code), ("done", Some(0)));

        let failing = "__CLIO_BEGIN_ff__\r\n\u{1b}[31merror:\u{1b}[m disk quota exceeded\r\n__CLIO_END_ff__:7\r\n$ ";
        let failed = step_event("s", "install", &parse_marker_blocks(failing)[0], &[0]);
        assert_eq!((failed.phase, failed.exit_code), ("failed", Some(7)));
        assert_eq!(failed.detail, "error: disk quota exceeded");
    }

    #[test]
    fn a_frame_without_its_status_yet_is_still_running() {
        let blocks = parse_marker_blocks("__CLIO_BEGIN_ab__\r\nwork\r\n__CLIO_END_ab__:");
        assert_eq!(blocks[0].exit_code, None);
    }

    #[test]
    fn classifies_the_deployment_plan_commands() {
        let args = |script: &str| vec!["-lc".to_string(), script.to_string()];
        assert_eq!(
            classify_command("sh", &args("os=$(uname -s); arch=$(uname -m); printf ...")),
            "probe"
        );
        assert_eq!(
            classify_command(
                "bash",
                &args("curl -fsSL https://raw.githubusercontent.com/iowarp/clio-agent/v0.9.4.17/install/install.sh | bash; true")
            ),
            "install"
        );
        assert_eq!(
            classify_command("bash", &args("root=\"$1\"; \"$bin/clio\" start")),
            "start"
        );
        assert_eq!(
            classify_command("bash", &args("root=\"$1\"; \"$bin/clio\" status")),
            "other"
        );
        assert_eq!(classify_command("docker", &["ps".to_string()]), "other");
        assert_eq!(
            classify_command("bash", &args("# clio-deploy:claim\nroot=\"$1\"")),
            "claim"
        );
        assert_eq!(
            classify_command("bash", &args("# clio-deploy:teardown\nroot=\"$1\"")),
            "teardown"
        );
    }

    #[test]
    fn claim_and_teardown_keep_their_outcome_when_done() {
        let claim = "__CLIO_BEGIN_c1__\r\n\u{1b}[32m==>\u{1b}[m Stopped an old CLIO (pid 1036897, /mnt/common/a/clio-ui-acceptance-0941)\r\nclio-deploy result=stopped existing_root=1 pid=1036897\r\n__CLIO_END_c1__:0\r\n";
        let block = &parse_marker_blocks(claim)[0];
        let done = step_event("s", "claim", block, &[0]);
        assert_eq!(done.phase, "done");
        assert_eq!(
            done.detail,
            "Stopped an old CLIO (pid 1036897, /mnt/common/a/clio-ui-acceptance-0941)"
        );
        assert_eq!(step_event("s", "install", block, &[0]).detail, "");
    }
}

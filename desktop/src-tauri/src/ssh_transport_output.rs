//! Terminal-output hygiene for the interactive OpenSSH transport.
//!
//! OpenSSH runs inside a pseudo-terminal (ConPTY on Windows), so everything it
//! prints arrives wrapped in terminal control sequences: colors, cursor
//! moves, title (OSC) updates, and — on Windows — ConPTY's habit of repainting
//! with absolute cursor positioning instead of newlines. This module turns that
//! byte stream into text a person can read, and decides whether OpenSSH is
//! currently waiting for an authentication answer.

use serde::Serialize;

/// Markers the transport injects around every remote command, plus the one
/// that announces the remote shell is ready. They are protocol, not output.
const MARKER_PREFIXES: [&str; 3] = ["__CLIO_BEGIN_", "__CLIO_END_", "__CLIO_SSH_READY__"];

/// An OpenSSH authentication question the user must answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SshPrompt {
    /// `password`, `passphrase`, `host_key`, or `keyboard_interactive`
    /// (Duo, one-time codes, and any other server-driven challenge).
    pub kind: &'static str,
    /// The prompt line exactly as OpenSSH showed it, without control sequences.
    pub text: String,
    /// The last lines OpenSSH printed up to and including the prompt, cleaned
    /// (a Duo prompt lists its options on the lines before the question).
    pub context: String,
}

/// How many cleaned lines of context accompany a prompt.
const PROMPT_CONTEXT_LINES: usize = 10;

/// Remove terminal control sequences.
///
/// With `positioning_breaks_lines`, an absolute cursor move (`CSI row;col H`)
/// becomes a newline and a relative forward move (`CSI n C`) becomes spaces —
/// how ConPTY encodes line breaks and runs of blanks when it repaints. Without
/// it those moves are simply dropped, which is what prompt detection needs:
/// ConPTY may park the cursor after a prompt, and that must not look like the
/// prompt line was finished.
pub fn strip_terminal_sequences(text: &str, positioning_breaks_lines: bool) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\u{1b}' => match chars.peek().copied() {
                Some('[') => {
                    chars.next();
                    let mut params = String::new();
                    let mut final_byte = None;
                    for next in chars.by_ref() {
                        if ('\u{40}'..='\u{7e}').contains(&next) {
                            final_byte = Some(next);
                            break;
                        }
                        params.push(next);
                    }
                    if positioning_breaks_lines {
                        match final_byte {
                            Some('H') | Some('f') => out.push('\n'),
                            Some('C') => {
                                let count = params.parse::<usize>().unwrap_or(1).min(256);
                                out.extend(std::iter::repeat(' ').take(count));
                            }
                            _ => {}
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    // OSC runs until BEL or the ST sequence ESC '\'.
                    while let Some(next) = chars.next() {
                        if next == '\u{7}' {
                            break;
                        }
                        if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some('(') | Some(')') => {
                    chars.next();
                    chars.next();
                }
                Some(_) => {
                    chars.next();
                }
                None => {}
            },
            '\r' => {
                if chars.peek() != Some(&'\n') {
                    out.push('\n');
                }
            }
            '\n' | '\t' => out.push(ch),
            ch if ch.is_control() => {}
            ch => out.push(ch),
        }
    }
    out
}

/// Whether a cleaned line is only protocol or an idle shell prompt.
fn is_noise_line(line: &str) -> bool {
    let trimmed = line.trim();
    matches!(trimmed, "$" | "#" | ">" | "%" | "ssh>")
}

/// Remove every transport marker token from already-stripped text.
fn remove_marker_tokens(line: &str) -> String {
    let mut rest = line.to_string();
    for prefix in MARKER_PREFIXES {
        while let Some(start) = rest.find(prefix) {
            let after = &rest[start + prefix.len()..];
            // A marker ends at its closing `__`, optionally followed by `:<exit>`.
            let body_end = if prefix == "__CLIO_SSH_READY__" {
                0
            } else {
                after
                    .find("__")
                    .map(|index| index + 2)
                    .unwrap_or(after.len())
            };
            let mut end = start + prefix.len() + body_end;
            if rest[end..].starts_with(':') {
                end += 1 + rest[end + 1..]
                    .chars()
                    .take_while(|ch| ch.is_ascii_digit() || *ch == '-')
                    .count();
            }
            rest.replace_range(start..end, "");
        }
    }
    rest
}

/// The transport log a person reads: control sequences stripped, markers and
/// idle shell prompts removed, trailing blanks trimmed, and runs of empty
/// lines collapsed to one.
pub fn clean_transport_log(raw: &str) -> String {
    let stripped = strip_terminal_sequences(raw, true);
    let mut lines: Vec<String> = Vec::new();
    for line in stripped.split('\n') {
        let line = remove_marker_tokens(line);
        let line = line.trim_end();
        if is_noise_line(line) {
            continue;
        }
        if line.is_empty() && lines.last().map_or(true, |last| last.is_empty()) {
            continue;
        }
        lines.push(line.to_string());
    }
    while lines.last().is_some_and(|last| last.is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}

/// The last meaningful line of `raw`, for a one-line failure reason.
pub fn last_meaningful_line(raw: &str) -> Option<String> {
    clean_transport_log(raw)
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(240).collect())
}

/// Classify what OpenSSH is waiting for, from its raw output so far.
///
/// Only a real OpenSSH authentication question qualifies: a password or
/// key-passphrase prompt, a host-key confirmation, or a keyboard-interactive
/// challenge (Duo, OTP, "Verification code:"). The question must be the
/// unfinished last line — once answered, OpenSSH prints a newline. The
/// escape-command prompt `ssh>` and any shell prompt (`$`, `#`, `>`, `%`) are
/// never questions for the user.
pub fn classify_prompt(raw: &str) -> Option<SshPrompt> {
    let stripped = strip_terminal_sequences(raw, false);
    let line = stripped.rsplit('\n').next().unwrap_or("").trim();
    if line.is_empty() {
        return None;
    }
    let lower = line.to_ascii_lowercase();
    let kind = if lower.contains("(yes/no") && line.ends_with('?') {
        "host_key"
    } else if !line.ends_with(':') {
        return None;
    } else if lower.contains("passphrase")
        || lower.contains(" pin for ")
        || lower.starts_with("enter pin")
    {
        "passphrase"
    } else if lower.contains("password") {
        "password"
    } else {
        "keyboard_interactive"
    };
    let cleaned = clean_transport_log(raw);
    let lines: Vec<&str> = cleaned
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    let context = lines[lines.len().saturating_sub(PROMPT_CONTEXT_LINES)..].join(
        "
",
    );
    Some(SshPrompt {
        kind,
        text: line.to_string(),
        context,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ARES_LOG: &str = include_str!("../tests/fixtures/ares-deploy-log.txt");

    #[test]
    fn password_prompts_are_detected() {
        let prompt = classify_prompt("banner\r\nalice@ares.example.edu's password: ").unwrap();
        assert_eq!(prompt.kind, "password");
        assert_eq!(prompt.text, "alice@ares.example.edu's password:");
        assert_eq!(
            classify_prompt("(alice@ares) Password: \u{1b}[?25h")
                .unwrap()
                .kind,
            "password"
        );
    }

    #[test]
    fn passphrase_and_pin_prompts_are_detected() {
        assert_eq!(
            classify_prompt("Enter passphrase for key 'C:\\Users\\a\\.ssh\\id_ed25519': ")
                .unwrap()
                .kind,
            "passphrase"
        );
        assert_eq!(
            classify_prompt("Enter PIN for ED25519-SK key /home/a/.ssh/id_sk: ")
                .unwrap()
                .kind,
            "passphrase"
        );
    }

    #[test]
    fn duo_keyboard_interactive_prompts_are_detected() {
        let duo = "Duo two-factor login for alice\r\n\r\nEnter a passcode or select one of the following options:\r\n\r\n 1. Duo Push to XXX-XXX-1234\r\n\r\nPasscode or option (1-1): ";
        let prompt = classify_prompt(duo).unwrap();
        assert_eq!(prompt.kind, "keyboard_interactive");
        assert_eq!(prompt.text, "Passcode or option (1-1):");
        assert!(prompt.context.contains("1. Duo Push to XXX-XXX-1234"));
        assert!(prompt.context.ends_with("Passcode or option (1-1):"));
        assert_eq!(
            classify_prompt("Verification code: ").unwrap().kind,
            "keyboard_interactive"
        );
    }

    #[test]
    fn host_key_confirmation_is_detected() {
        let text = "The authenticity of host 'ares (1.2.3.4)' can't be established.\r\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ";
        assert_eq!(classify_prompt(text).unwrap().kind, "host_key");
    }

    #[test]
    fn escape_and_shell_prompts_are_never_auth_prompts() {
        assert_eq!(classify_prompt("\r\nssh>\u{1b}[1C"), None);
        assert_eq!(classify_prompt("\r\nssh> "), None);
        assert_eq!(classify_prompt("__CLIO_SSH_READY__\r\n$ "), None);
        assert_eq!(classify_prompt("root@node:~# "), None);
        assert_eq!(classify_prompt("PS C:\\> "), None);
        assert_eq!(classify_prompt("% "), None);
        // An answered prompt is followed by a newline and no longer waits.
        assert_eq!(classify_prompt("alice@ares's password: \r\n"), None);
        // The owner's real failing transcript ends in `ssh>`: not a prompt.
        assert_eq!(classify_prompt(ARES_LOG), None);
    }

    #[test]
    fn strips_csi_osc_and_conpty_positioning() {
        let raw = "\u{1b}[?9001h\u{1b}[?1004h\u{1b}[?25l\u{1b}[2J\u{1b}[m\u{1b}[H__CLIO_SSH_READY__\r\n\u{1b}]0;C:\\WINDOWS\\System32\\OpenSSH\\ssh.EXE\u{7}\u{1b}[?25h$ ";
        assert_eq!(
            strip_terminal_sequences(raw, true),
            "\n__CLIO_SSH_READY__\n$ "
        );
        assert_eq!(
            strip_terminal_sequences("a\u{1b}[6;1Hb\u{1b}[3Cc\u{1b}]2;title\u{1b}\\d", true),
            "a\nb   cd"
        );
        assert_eq!(
            strip_terminal_sequences("a\u{1b}[6;1Hb\u{1b}[3Cc", false),
            "abc"
        );
    }

    #[test]
    fn cleaned_ares_log_has_no_escapes_markers_or_prompt_noise() {
        let cleaned = clean_transport_log(ARES_LOG);
        assert!(!cleaned.contains('\u{1b}'), "escape left in {cleaned}");
        assert!(!cleaned.contains("__CLIO_"), "marker left in {cleaned}");
        assert!(!cleaned.contains("ssh>"));
        assert!(!cleaned.lines().any(|line| line.trim() == "$"));
        assert!(cleaned.contains("==> Installing clio-agent[argonne]==0.9.4.17 from PyPI"));
        assert!(cleaned.contains("Linux|x86_64|none|1|1|1"));
        assert!(cleaned.contains("==> Starting CLIO server on :17800"));
        assert!(!cleaned.contains("\n\n\n"));
    }

    #[test]
    fn last_meaningful_line_skips_markers_and_blanks() {
        assert_eq!(
            last_meaningful_line(
                "\u{1b}[31merror: no space left\u{1b}[m\r\n\r\n__CLIO_END_ab__:1\r\n$ "
            ),
            Some("error: no space left".to_string())
        );
        assert_eq!(last_meaningful_line("\r\n$ \r\n"), None);
    }
}

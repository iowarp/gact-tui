//! CLIO-owned OpenSSH `Host` blocks: read what CLIO itself declared, and
//! rewrite only the route of a block.
//!
//! A profile CLIO saved must round-trip exactly what the user entered. `ssh -G`
//! reports OpenSSH's *effective* values instead, which include defaults the
//! user never set (the first default `IdentityFile`, the local user name).
//! Re-saving those would pin them into the profile, and pinning an identity
//! disables OpenSSH's own default-key search.

use std::collections::BTreeSet;
use std::path::Path;

/// The directives a CLIO-owned block declares; `None` means not declared.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct DeclaredProfile {
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub jump_hosts: Vec<String>,
}

/// Split an OpenSSH directive in either `Key value` or `Key=value` form.
fn directive(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    let split = line.find(|character: char| character.is_whitespace() || character == '=')?;
    let (key, rest) = line.split_at(split);
    let value =
        rest.trim_start_matches(|character: char| character.is_whitespace() || character == '=');
    Some((key, value.trim()))
}

/// Remove OpenSSH double quotes around a value.
fn unquote(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|inner| inner.strip_suffix('"'))
        .unwrap_or(value)
}

/// Render a value OpenSSH reads back unchanged: quoted when it has whitespace.
pub fn quoted(value: &str) -> String {
    if value.chars().any(char::is_whitespace) {
        format!("\"{value}\"")
    } else {
        value.to_string()
    }
}

/// Read the directives a CLIO-rendered `Host` block declares.
pub fn declared_profile(block: &str) -> DeclaredProfile {
    let mut declared = DeclaredProfile::default();
    for line in block.lines().skip(1) {
        let Some((key, value)) = directive(line) else {
            continue;
        };
        let value = unquote(value);
        match key.to_ascii_lowercase().as_str() {
            "hostname" => declared.hostname = Some(value.to_string()),
            "user" => declared.user = Some(value.to_string()),
            "port" => declared.port = value.parse().ok(),
            "identityfile" => declared.identity_file = Some(value.to_string()),
            "proxyjump" if !value.eq_ignore_ascii_case("none") => {
                declared.jump_hosts = value
                    .split(',')
                    .map(str::trim)
                    .filter(|jump| !jump.is_empty())
                    .map(str::to_string)
                    .collect();
            }
            _ => {}
        }
    }
    declared
}

/// Replace only the `ProxyJump` directive of a block, keeping every other line.
pub fn with_jump_hosts(block: &str, jump_hosts: &[String]) -> String {
    let mut lines: Vec<String> = block
        .lines()
        .filter(|line| {
            !directive(line).is_some_and(|(key, _)| key.eq_ignore_ascii_case("proxyjump"))
        })
        .map(str::to_string)
        .collect();
    if !jump_hosts.is_empty() {
        lines.push(format!("  ProxyJump {}", jump_hosts.join(",")));
    }
    lines.join("\n")
}

/// Validate one ProxyJump step. Any form OpenSSH accepts is allowed (an
/// alias, `[user@]host[:port]`, `ssh://user@host:port`, IPv6, `%` tokens);
/// only what would corrupt the shared OpenSSH configuration is refused:
/// whitespace (a fatal "garbage at end of line" for every ssh command on the
/// machine), a comma (silently splits one step into two), a quote or `#`.
pub fn validate_jump_host(jump: &str) -> Result<(), String> {
    let valid = !jump.is_empty()
        && !jump.chars().any(|character| {
            character.is_whitespace() || character.is_control() || ",\"#".contains(character)
        });
    if valid {
        Ok(())
    } else {
        Err(format!(
            "SSH jump host \"{jump}\" must be one OpenSSH destination, without spaces, commas, quotes or #."
        ))
    }
}

/// Validate a directive value CLIO writes into the shared OpenSSH
/// configuration. `allow_spaces` values are written quoted; a double quote can
/// never be written safely (OpenSSH has no escape for it).
pub fn validate_directive_value(
    label: &str,
    value: &str,
    allow_spaces: bool,
) -> Result<(), String> {
    if value
        .chars()
        .any(|character| character.is_control() || character == '"')
    {
        return Err(format!(
            "SSH {label} cannot contain quotes or control characters."
        ));
    }
    if !allow_spaces && value.chars().any(char::is_whitespace) {
        return Err(format!("SSH {label} cannot contain spaces."));
    }
    Ok(())
}

/// A free alias for a new CLIO computer: `requested`, or `requested-N` when
/// the name is taken by any alias, including hidden or imported ones. CLIO's
/// include file is read first, so reusing a name would override that entry.
pub fn unique_alias(requested: &str, taken: &BTreeSet<String>) -> String {
    let lower = |value: &str| value.to_ascii_lowercase();
    if !taken.contains(&lower(requested)) {
        return requested.to_string();
    }
    (2..)
        .map(|suffix| format!("{requested}-{suffix}"))
        .find(|candidate| !taken.contains(&lower(candidate)))
        .expect("an unbounded suffix range always yields a free alias")
}

/// The key file a save leaves CLIO owning: a newly pasted key, or the key CLIO
/// already stored when the save keeps that exact path. Anything else (a key the
/// user chose, or no key) is never CLIO's to delete.
pub fn owned_identity_after_save(
    pasted_identity: Option<&str>,
    previously_owned: Option<&str>,
    saved_identity: &str,
) -> Option<String> {
    pasted_identity
        .or(previously_owned.filter(|owned| *owned == saved_identity))
        .map(str::to_string)
}

/// Whether `candidate` is a file inside CLIO's own SSH identity directory.
pub fn is_inside_identity_directory(candidate: &Path, identity_directory: &Path) -> bool {
    match (candidate.canonicalize(), identity_directory.canonicalize()) {
        (Ok(file), Ok(directory)) => file != directory && file.starts_with(&directory),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BLOCK: &str =
        "Host utah\n  HostName login.utah.edu\n  Port 2222\n  User alice\n  ProxyJump gw,bastion";

    #[test]
    fn reads_only_what_the_block_declares() {
        let declared = declared_profile("Host gw\n  HostName gw.utah.edu\n  Port 22");
        assert_eq!(declared.hostname.as_deref(), Some("gw.utah.edu"));
        assert_eq!(declared.user, None);
        assert_eq!(declared.identity_file, None);
        assert!(declared.jump_hosts.is_empty());
        assert_eq!(declared_profile(BLOCK).jump_hosts, vec!["gw", "bastion"]);
    }

    #[test]
    fn rewrites_only_the_route() {
        let reordered = with_jump_hosts(BLOCK, &["bastion".into(), "gw".into()]);
        assert_eq!(
            reordered,
            "Host utah\n  HostName login.utah.edu\n  Port 2222\n  User alice\n  ProxyJump bastion,gw"
        );
        assert_eq!(
            with_jump_hosts(BLOCK, &[]),
            "Host utah\n  HostName login.utah.edu\n  Port 2222\n  User alice"
        );
    }

    #[test]
    fn reads_equals_form_and_quoted_values_and_rewrites_them() {
        let block = "Host utah\n  HostName=login.utah.edu\n  IdentityFile \"C:\\Users\\John Doe\\key\"\n  ProxyJump=gw";
        let declared = declared_profile(block);
        assert_eq!(declared.hostname.as_deref(), Some("login.utah.edu"));
        assert_eq!(
            declared.identity_file.as_deref(),
            Some("C:\\Users\\John Doe\\key")
        );
        assert_eq!(declared.jump_hosts, vec!["gw"]);
        assert!(!with_jump_hosts(block, &["bastion".into()]).contains("ProxyJump=gw"));
        assert_eq!(
            quoted("C:\\Users\\John Doe\\key"),
            "\"C:\\Users\\John Doe\\key\""
        );
    }

    #[test]
    fn rejects_jump_hosts_that_would_corrupt_the_config() {
        assert!(validate_jump_host("alice@gw.example.edu:2222").is_ok());
        assert!(validate_jump_host("alice@[2001:db8::1]:22").is_ok());
        assert!(validate_jump_host("ssh://alice@gw.example.edu:2222").is_ok());
        assert!(validate_jump_host("DOMAIN\\alice@gw").is_ok());
        assert!(validate_jump_host("gw\"x").is_err());
        assert!(validate_jump_host("gw bastion").is_err());
        assert!(validate_jump_host("alice@gw -p 2222").is_err());
        assert!(validate_jump_host("gw,bastion").is_err());
        assert!(validate_jump_host("").is_err());
    }

    #[test]
    fn directive_values_never_corrupt_the_config() {
        assert!(validate_directive_value("hostname", "login.utah.edu", false).is_ok());
        assert!(validate_directive_value("hostname", "login utah.edu", false).is_err());
        assert!(validate_directive_value("user", "alice smith", true).is_ok());
        assert!(validate_directive_value("identity file", "C:\\a \"b\" c", true).is_err());
        assert!(validate_directive_value("user", "alice\nProxyCommand x", true).is_err());
    }

    #[test]
    fn a_new_alias_never_takes_an_existing_name() {
        let taken: BTreeSet<String> = ["utah".to_string(), "utah-2".to_string()].into();
        assert_eq!(unique_alias("Utah", &taken), "Utah-3");
        assert_eq!(unique_alias("gateway", &taken), "gateway");
    }

    #[test]
    fn owns_only_a_pasted_key_or_the_unchanged_stored_key() {
        assert_eq!(
            owned_identity_after_save(Some("/clio/k1"), None, "/clio/k1").as_deref(),
            Some("/clio/k1")
        );
        assert_eq!(
            owned_identity_after_save(None, Some("/clio/k1"), "/clio/k1").as_deref(),
            Some("/clio/k1")
        );
        assert_eq!(
            owned_identity_after_save(None, Some("/clio/k1"), "~/.ssh/id_ed25519"),
            None
        );
        assert_eq!(
            owned_identity_after_save(None, None, "~/.ssh/id_ed25519"),
            None
        );
    }

    #[test]
    fn only_files_inside_the_identity_directory_are_deletable() {
        let root = std::env::temp_dir().join(format!("clio-ssh-blocks-{}", std::process::id()));
        let identities = root.join("ssh-identities");
        std::fs::create_dir_all(&identities).unwrap();
        let owned = identities.join("key");
        let outside = root.join("id_ed25519");
        std::fs::write(&owned, "k").unwrap();
        std::fs::write(&outside, "k").unwrap();
        assert!(is_inside_identity_directory(&owned, &identities));
        assert!(!is_inside_identity_directory(&outside, &identities));
        assert!(!is_inside_identity_directory(
            &identities.join("../id_ed25519"),
            &identities
        ));
        std::fs::remove_dir_all(&root).unwrap();
    }
}

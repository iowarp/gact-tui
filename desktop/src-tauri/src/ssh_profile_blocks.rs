//! CLIO-owned OpenSSH `Host` blocks: read what CLIO itself declared, and
//! rewrite only the route of a block.
//!
//! A profile CLIO saved must round-trip exactly what the user entered. `ssh -G`
//! reports OpenSSH's *effective* values instead, which include defaults the
//! user never set (the first default `IdentityFile`, the local user name).
//! Re-saving those would pin them into the profile, and pinning an identity
//! disables OpenSSH's own default-key search.

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

/// Read the directives a CLIO-rendered `Host` block declares.
pub fn declared_profile(block: &str) -> DeclaredProfile {
    let mut declared = DeclaredProfile::default();
    for line in block.lines().skip(1) {
        let Some((key, value)) = line.trim().split_once(char::is_whitespace) else {
            continue;
        };
        let value = value.trim();
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
            !line
                .trim()
                .split_once(char::is_whitespace)
                .is_some_and(|(key, _)| key.eq_ignore_ascii_case("proxyjump"))
        })
        .map(str::to_string)
        .collect();
    if !jump_hosts.is_empty() {
        lines.push(format!("  ProxyJump {}", jump_hosts.join(",")));
    }
    lines.join("\n")
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

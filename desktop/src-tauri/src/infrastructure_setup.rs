//! Assisted setup primitives for optional CLIO infrastructure.
//!
//! The desktop shell owns local process access and the user's SSH inventory, so
//! these operations intentionally live here instead of in the browser bundle.

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};

const WEB_SEARCH_IMAGE: &str = "ghcr.io/iowarp/clio-web-search:0.3.0";
const WEB_SEARCH_CONTAINER: &str = "clio-web-search";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SshProfile {
    pub name: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WebSearchDeployRequest {
    pub target: String,
    pub ssh_profile: Option<String>,
    pub contact_email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WebSearchDeployResult {
    pub action: String,
    pub target: String,
}

/// Return concrete OpenSSH host aliases from the current user's config.
#[tauri::command]
pub fn infrastructure_ssh_profiles() -> Result<Vec<SshProfile>, String> {
    let path =
        ssh_config_path().ok_or_else(|| "The current user has no home directory.".to_string())?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    Ok(parse_ssh_profiles(&contents))
}

/// Start or create the published CLIO Web Search container locally or through SSH.
#[tauri::command]
pub fn infrastructure_deploy_web_search(
    request: WebSearchDeployRequest,
) -> Result<WebSearchDeployResult, String> {
    validate_optional_email(request.contact_email.as_deref())?;
    let (program, prefix, target) = match request.target.as_str() {
        "local" => (
            "docker".to_string(),
            Vec::new(),
            "This computer".to_string(),
        ),
        "ssh" => {
            let profile = request
                .ssh_profile
                .as_deref()
                .ok_or_else(|| "Choose an SSH profile.".to_string())?;
            validate_ssh_profile(profile)?;
            (
                "ssh".to_string(),
                vec![profile.to_string()],
                profile.to_string(),
            )
        }
        _ => return Err("Deployment target must be local or ssh.".to_string()),
    };

    let inspected = run_target(
        &program,
        &prefix,
        &["docker", "inspect", WEB_SEARCH_CONTAINER],
    )?;
    let action = if inspected.status.success() {
        let running = run_target(
            &program,
            &prefix,
            &[
                "docker",
                "inspect",
                "--format",
                "{{.State.Running}}",
                WEB_SEARCH_CONTAINER,
            ],
        )?;
        if running.status.success() && String::from_utf8_lossy(&running.stdout).trim() == "true" {
            "already_running"
        } else {
            checked_target(
                &program,
                &prefix,
                &["docker", "start", WEB_SEARCH_CONTAINER],
            )?;
            "started"
        }
    } else {
        let bind_address = if request.target == "local" {
            "127.0.0.1"
        } else {
            "0.0.0.0"
        };
        let http_publish = format!("{bind_address}:8089:8080");
        let valkey_publish = format!("{bind_address}:8090:6379");
        let mut args = vec![
            "docker".to_string(),
            "run".to_string(),
            "--detach".to_string(),
            "--name".to_string(),
            WEB_SEARCH_CONTAINER.to_string(),
            "--restart".to_string(),
            "unless-stopped".to_string(),
            "--publish".to_string(),
            http_publish,
            "--publish".to_string(),
            valkey_publish,
            "--volume".to_string(),
            "clio-web-search-data:/var/lib/clio-web-search".to_string(),
        ];
        if let Some(email) = request
            .contact_email
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            args.extend([
                "--env".to_string(),
                format!("CLIO_WEB_SEARCH_CONTACT_EMAIL={email}"),
            ]);
        }
        args.push(WEB_SEARCH_IMAGE.to_string());
        let borrowed = args.iter().map(String::as_str).collect::<Vec<_>>();
        checked_target(&program, &prefix, &borrowed)?;
        "created"
    };

    Ok(WebSearchDeployResult {
        action: action.to_string(),
        target,
    })
}

fn run_target(program: &str, prefix: &[String], args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new(program);
    let target_args = if program == "docker" && args.first() == Some(&"docker") {
        &args[1..]
    } else {
        args
    };
    command.args(prefix).args(target_args);
    command.output().map_err(|error| {
        if program == "docker" {
            format!("Docker could not be started: {error}")
        } else {
            format!("SSH could not be started: {error}")
        }
    })
}

fn checked_target(program: &str, prefix: &[String], args: &[&str]) -> Result<Output, String> {
    let output = run_target(program, prefix, args)?;
    if output.status.success() {
        return Ok(output);
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if detail.is_empty() {
        "The deployment command did not complete successfully.".to_string()
    } else {
        detail
    })
}

fn ssh_config_path() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .map(|home| home.join(".ssh").join("config"))
}

fn parse_ssh_profiles(contents: &str) -> Vec<SshProfile> {
    let mut profiles = Vec::new();
    let mut current: Vec<SshProfile> = Vec::new();
    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut fields = line.split_whitespace();
        let Some(key) = fields.next() else { continue };
        let values = fields.collect::<Vec<_>>();
        if key.eq_ignore_ascii_case("host") {
            profiles.append(&mut current);
            current = values
                .into_iter()
                .filter(|name| !name.contains(['*', '?', '!']))
                .map(|name| SshProfile {
                    name: name.to_string(),
                    hostname: None,
                    user: None,
                })
                .collect();
        } else if key.eq_ignore_ascii_case("hostname") {
            if let Some(value) = values.first() {
                for profile in &mut current {
                    profile.hostname = Some((*value).to_string());
                }
            }
        } else if key.eq_ignore_ascii_case("user") {
            if let Some(value) = values.first() {
                for profile in &mut current {
                    profile.user = Some((*value).to_string());
                }
            }
        }
    }
    profiles.append(&mut current);
    profiles.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    profiles.dedup_by(|left, right| left.name.eq_ignore_ascii_case(&right.name));
    profiles
}

fn validate_ssh_profile(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || value.starts_with('-')
        || !value.chars().all(is_safe_remote_argument_character)
    {
        return Err("The SSH profile name is not valid.".to_string());
    }
    Ok(())
}

fn validate_optional_email(value: Option<&str>) -> Result<(), String> {
    let Some(value) = value.filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    if value.len() > 254
        || !value.contains('@')
        || !value.chars().all(is_safe_remote_argument_character)
    {
        return Err("The contact email is not valid.".to_string());
    }
    Ok(())
}

fn is_safe_remote_argument_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || "._-@".contains(character)
}

#[cfg(test)]
mod tests {
    use super::{parse_ssh_profiles, validate_optional_email, validate_ssh_profile};

    #[test]
    fn parses_concrete_profiles_and_ignores_patterns() {
        let profiles = parse_ssh_profiles(
            r#"
            Host *
              ServerAliveInterval 30
            Host homelab
              HostName 10.0.0.102
              User scientist
            Host ares login-alias
              HostName login.example.edu
            Host *.internal
              User ignored
            "#,
        );
        assert_eq!(profiles.len(), 3);
        assert_eq!(profiles[0].name, "ares");
        assert_eq!(profiles[0].hostname.as_deref(), Some("login.example.edu"));
        assert_eq!(profiles[1].name, "homelab");
        assert_eq!(profiles[1].user.as_deref(), Some("scientist"));
    }

    #[test]
    fn refuses_option_shaped_or_shell_shaped_profiles() {
        assert!(validate_ssh_profile("homelab").is_ok());
        assert!(validate_ssh_profile("-oProxyCommand=bad").is_err());
        assert!(validate_ssh_profile("host;bad").is_err());
        assert!(validate_ssh_profile("two hosts").is_err());
    }

    #[test]
    fn restricts_contact_email_to_the_safe_remote_argument_charset() {
        assert!(validate_optional_email(Some("scientist@example.org")).is_ok());
        assert!(validate_optional_email(None).is_ok());
        assert!(validate_optional_email(Some("a@example.org;touch-pwned")).is_err());
        assert!(validate_optional_email(Some("a@example.org|whoami")).is_err());
        assert!(validate_optional_email(Some("a@example.org$(whoami)")).is_err());
        assert!(validate_optional_email(Some("a+tag@example.org")).is_err());
    }
}

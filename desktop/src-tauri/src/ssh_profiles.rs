//! Non-secret SSH target configuration owned by CLIO Desktop.
//!
//! Authentication remains entirely inside system OpenSSH. Desktop writes only
//! ordinary host metadata to an included OpenSSH file and keeps imported-host
//! visibility preferences in its app configuration directory.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

use crate::ssh_profile_blocks::{
    declared_profile, is_inside_identity_directory, owned_identity_after_save, quoted,
    unique_alias, validate_directive_value, validate_jump_host, with_jump_hosts,
};
use crate::supervisor_boot_log::boot_log_line;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const INCLUDE_MARKER: &str = "Include clio/config";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SshProfile {
    pub name: String,
    pub label: Option<String>,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: u16,
    pub identity_file: Option<String>,
    pub jump_hosts: Vec<String>,
    pub platform: String,
    pub install_root: Option<String>,
    pub managed: bool,
    /// Never true from `ssh_profiles_list`, which already filters hidden
    /// profiles out; only `ssh_profiles_list_all` (the hosts manager) reports it.
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaveSshProfileRequest {
    pub name: String,
    #[serde(default)]
    pub label: String,
    pub hostname: String,
    #[serde(default)]
    pub user: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub identity_file: String,
    #[serde(default)]
    pub jump_hosts: Vec<String>,
    #[serde(default = "default_platform")]
    pub platform: String,
    #[serde(default)]
    pub install_root: String,
    #[serde(default)]
    pub managed_identity: bool,
    /// Edit the CLIO computer named `name` in place. Otherwise this saves a new
    /// computer and `name` is only the requested alias: a taken alias gets a
    /// free `-N` suffix, and the saved profile reports the name used.
    #[serde(default)]
    pub replace_existing: bool,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ProfilePreferences {
    #[serde(default)]
    hidden: BTreeSet<String>,
    #[serde(default)]
    metadata: BTreeMap<String, ProfileMetadata>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ProfileMetadata {
    label: String,
    platform: String,
    install_root: String,
    /// Pre-`owned_identity` metadata: CLIO stored a pasted key, path unknown.
    #[serde(default)]
    managed_identity: bool,
    /// The exact pasted-key file CLIO stored for this profile, and the only
    /// file deleting the profile may remove.
    #[serde(default)]
    owned_identity: Option<String>,
}

impl ProfileMetadata {
    /// The key CLIO owns: the recorded path, or for older metadata the key the
    /// CLIO-owned block itself declares (never an OpenSSH-effective default).
    fn owned_identity(&self, block: Option<&str>) -> Option<String> {
        self.owned_identity.clone().or_else(|| {
            self.managed_identity
                .then(|| block.and_then(|value| declared_profile(value).identity_file))
                .flatten()
        })
    }
}

fn default_port() -> u16 {
    22
}

fn default_platform() -> String {
    "auto".into()
}

#[tauri::command]
pub fn ssh_profiles_list(app: tauri::AppHandle) -> Result<Vec<SshProfile>, String> {
    let paths = profile_paths(&app)?;
    let preferences = read_preferences(&paths.preferences)?;
    let profiles = resolve_all_profiles(&paths, &preferences)?;
    Ok(profiles
        .into_iter()
        .filter(|profile| !profile.hidden)
        .collect())
}

/// Every alias CLIO or the user's own OpenSSH configuration declares, managed
/// and imported alike, with each one's hidden preference attached — the truth
/// the hosts manager needs, and what `ssh_profiles_list` filters hidden ones
/// out of for every other picker.
#[tauri::command]
pub fn ssh_profiles_list_all(app: tauri::AppHandle) -> Result<Vec<SshProfile>, String> {
    let paths = profile_paths(&app)?;
    let preferences = read_preferences(&paths.preferences)?;
    resolve_all_profiles(&paths, &preferences)
}

fn resolve_all_profiles(
    paths: &ProfilePaths,
    preferences: &ProfilePreferences,
) -> Result<Vec<SshProfile>, String> {
    let managed_names = read_aliases(&paths.managed_include)?;
    let mut names = read_aliases(&paths.user_config)?;
    names.extend(managed_names.iter().cloned());
    names.sort_by_key(|value| value.to_ascii_lowercase());
    names.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    let managed_blocks = read_managed_blocks(&paths.managed_include)?;
    // What OpenSSH reports for a host no configuration matches: its defaults.
    let defaults = resolve_profile(OPENSSH_DEFAULTS_PROBE, false, None).ok();
    names
        .into_iter()
        .map(|name| {
            let hidden = preferences.hidden.contains(&name.to_ascii_lowercase());
            let metadata = preferences.metadata.get(&name.to_ascii_lowercase());
            let profile = match managed_block(&managed_blocks, &name) {
                Some(block) => managed_profile(&name, block, metadata),
                None => without_openssh_defaults(
                    resolve_profile(&name, false, metadata)?,
                    defaults.as_ref(),
                ),
            };
            Ok(SshProfile { hidden, ..profile })
        })
        .collect()
}

/// Rewrite only the ordered jump route of a profile CLIO saved.
#[tauri::command]
pub fn ssh_profile_set_route(
    app: tauri::AppHandle,
    name: String,
    jump_hosts: Vec<String>,
) -> Result<SshProfile, String> {
    validate_alias(&name)?;
    for jump in &jump_hosts {
        validate_jump_host(jump)?;
    }
    let paths = profile_paths(&app)?;
    let mut blocks = read_managed_blocks(&paths.managed_include)?;
    let Some(block) = blocks
        .iter_mut()
        .find(|block| block_name(block).is_some_and(|value| value.eq_ignore_ascii_case(&name)))
    else {
        return Err(format!(
            "{name} is an imported OpenSSH profile; CLIO does not modify it."
        ));
    };
    *block = with_jump_hosts(block, &jump_hosts);
    let updated = block.clone();
    write_atomic(
        &paths.managed_include,
        &format!("{}\n", blocks.join("\n\n")),
    )?;
    let preferences = read_preferences(&paths.preferences)?;
    Ok(managed_profile(
        &name,
        &updated,
        preferences.metadata.get(&name.to_ascii_lowercase()),
    ))
}

#[tauri::command]
pub fn ssh_profile_save(
    app: tauri::AppHandle,
    request: SaveSshProfileRequest,
) -> Result<SshProfile, String> {
    validate_profile(&request)?;
    let paths = profile_paths(&app)?;
    ensure_include(&paths.user_config, &paths.managed_include)?;
    let mut blocks = read_managed_blocks(&paths.managed_include)?;
    let mut request = request;
    if request.replace_existing {
        if managed_block(&blocks, &request.name).is_none() {
            return Err(format!(
                "{} is not a computer CLIO saved, so CLIO does not modify it.",
                request.name
            ));
        }
    } else {
        // Every alias counts, including hidden and imported ones.
        let mut taken: BTreeSet<String> = read_aliases(&paths.user_config)?
            .into_iter()
            .chain(read_aliases(&paths.managed_include)?)
            .map(|alias| alias.to_ascii_lowercase())
            .collect();
        taken.extend(read_preferences(&paths.preferences)?.hidden.iter().cloned());
        request.name = unique_alias(&request.name, &taken);
    }
    // A re-save that does not paste a new key (a label change, an edited
    // address) keeps ownership of the key CLIO stored, as long as the profile
    // still uses that exact file; otherwise CLIO owns no key for it.
    let previously_owned = read_preferences(&paths.preferences)?
        .metadata
        .get(&request.name.to_ascii_lowercase())
        .and_then(|metadata| metadata.owned_identity(managed_block(&blocks, &request.name)));
    let owned_identity = owned_identity_after_save(
        request
            .managed_identity
            .then_some(request.identity_file.as_str()),
        previously_owned.as_deref(),
        &request.identity_file,
    );
    let orphaned_identity =
        previously_owned.filter(|previous| owned_identity.as_deref() != Some(previous.as_str()));
    blocks.retain(|block| {
        !block_name(block).is_some_and(|name| name.eq_ignore_ascii_case(&request.name))
    });
    blocks.push(render_profile(&request));
    write_atomic(
        &paths.managed_include,
        &format!("{}\n", blocks.join("\n\n")),
    )?;
    let mut preferences = read_preferences(&paths.preferences)?;
    preferences
        .hidden
        .remove(&request.name.to_ascii_lowercase());
    preferences.metadata.insert(
        request.name.to_ascii_lowercase(),
        ProfileMetadata {
            label: request.label.clone(),
            platform: request.platform.clone(),
            install_root: request.install_root.clone(),
            managed_identity: owned_identity.is_some(),
            owned_identity,
        },
    );
    write_preferences(&paths.preferences, &preferences)?;
    if let Some(previous) = orphaned_identity {
        // Only after the profile is written: it no longer uses the key CLIO
        // stored for it (a new key was pasted, or the user chose their own).
        remove_unreferenced_identity(&previous, &blocks, &paths.identity_directory)?;
    }
    Ok(managed_profile(
        &request.name,
        &render_profile(&request),
        preferences.metadata.get(&request.name.to_ascii_lowercase()),
    ))
}

#[tauri::command]
pub fn ssh_profile_set_hidden(
    app: tauri::AppHandle,
    name: String,
    hidden: bool,
) -> Result<(), String> {
    validate_alias(&name)?;
    let paths = profile_paths(&app)?;
    let mut preferences = read_preferences(&paths.preferences)?;
    if hidden {
        preferences.hidden.insert(name.to_ascii_lowercase());
    } else {
        preferences.hidden.remove(&name.to_ascii_lowercase());
    }
    write_preferences(&paths.preferences, &preferences)
}

#[tauri::command]
pub fn ssh_profile_delete(app: tauri::AppHandle, name: String) -> Result<(), String> {
    validate_alias(&name)?;
    let paths = profile_paths(&app)?;
    let mut blocks = read_managed_blocks(&paths.managed_include)?;
    let owned_identity = read_preferences(&paths.preferences)?
        .metadata
        .get(&name.to_ascii_lowercase())
        .and_then(|metadata| metadata.owned_identity(managed_block(&blocks, &name)));
    let before = blocks.len();
    blocks
        .retain(|block| !block_name(block).is_some_and(|value| value.eq_ignore_ascii_case(&name)));
    if blocks.len() == before {
        return Err("Imported OpenSSH profiles can be hidden but not deleted by CLIO.".into());
    }
    let contents = if blocks.is_empty() {
        String::new()
    } else {
        format!("{}\n", blocks.join("\n\n"))
    };
    write_atomic(&paths.managed_include, &contents)?;
    let mut preferences = read_preferences(&paths.preferences)?;
    preferences.metadata.remove(&name.to_ascii_lowercase());
    preferences.hidden.remove(&name.to_ascii_lowercase());
    write_preferences(&paths.preferences, &preferences)?;
    if let Some(identity) = owned_identity {
        remove_unreferenced_identity(&identity, &blocks, &paths.identity_directory)?;
    }
    Ok(())
}

/// Delete a stored key only when no remaining CLIO computer still declares it
/// (another profile may have been pointed at the same stored file).
fn remove_unreferenced_identity(
    identity: &str,
    remaining_blocks: &[String],
    identity_directory: &Path,
) -> Result<(), String> {
    let still_used = remaining_blocks
        .iter()
        .any(|block| declared_profile(block).identity_file.as_deref() == Some(identity));
    if still_used {
        boot_log_line(&format!(
            "ssh-profile: kept key {identity}: reason=still_used_by_another_profile"
        ));
        return Ok(());
    }
    remove_owned_identity(identity, identity_directory)
}

/// Delete a key CLIO stored, and only a file inside CLIO's identity directory:
/// a user's own key that a profile happens to reference is never deleted.
fn remove_owned_identity(identity: &str, identity_directory: &Path) -> Result<(), String> {
    if !is_inside_identity_directory(Path::new(identity), identity_directory) {
        boot_log_line(&format!(
            "ssh-profile: kept key {identity}: reason=outside_clio_identity_directory"
        ));
        return Ok(());
    }
    match fs::remove_file(identity) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove pasted SSH key {identity}: {error}"
        )),
    }
}

struct ProfilePaths {
    user_config: PathBuf,
    managed_include: PathBuf,
    preferences: PathBuf,
    identity_directory: PathBuf,
}

fn profile_paths(app: &tauri::AppHandle) -> Result<ProfilePaths, String> {
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or("The current user has no home directory.")?;
    let app_config = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Could not resolve the CLIO configuration directory: {error}"))?;
    Ok(ProfilePaths {
        user_config: home.join(".ssh").join("config"),
        managed_include: home.join(".ssh").join("clio").join("config"),
        preferences: app_config.join("ssh-profile-preferences.json"),
        identity_directory: app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("Could not locate CLIO's private data directory: {error}"))?
            .join("ssh-identities"),
    })
}

fn ensure_include(user_config: &Path, managed_include: &Path) -> Result<(), String> {
    if let Some(parent) = managed_include.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    let contents = fs::read_to_string(user_config).unwrap_or_default();
    let included = contents
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case(INCLUDE_MARKER));
    if included {
        return Ok(());
    }
    let suffix = if contents.is_empty() || contents.starts_with('\n') {
        contents
    } else {
        format!("\n{contents}")
    };
    write_atomic(user_config, &format!("{INCLUDE_MARKER}\n{suffix}"))
}

fn read_aliases(path: &Path) -> Result<Vec<String>, String> {
    let mut visited = BTreeSet::new();
    let ssh_root = path.parent().unwrap_or_else(|| Path::new("."));
    read_aliases_recursive(path, ssh_root, &mut visited)
}

fn read_aliases_recursive(
    path: &Path,
    ssh_root: &Path,
    visited: &mut BTreeSet<PathBuf>,
) -> Result<Vec<String>, String> {
    let identity = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    if !visited.insert(identity) {
        return Ok(Vec::new());
    }
    let contents = match fs::read_to_string(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Could not read {}: {error}", path.display())),
    };
    let mut aliases = Vec::new();
    for raw in contents.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else {
            continue;
        };
        if key.eq_ignore_ascii_case("host") {
            aliases.extend(
                parts
                    .filter(|name| !name.contains(['*', '?', '!']))
                    .map(str::to_string),
            );
            continue;
        }
        if !key.eq_ignore_ascii_case("include") {
            continue;
        }
        for pattern in parts {
            let expanded = expand_include(pattern, ssh_root);
            let pattern_text = expanded.to_string_lossy();
            let entries = glob::glob(&pattern_text)
                .map_err(|error| format!("Invalid OpenSSH Include {pattern}: {error}"))?;
            for entry in entries.flatten().filter(|entry| entry.is_file()) {
                aliases.extend(read_aliases_recursive(&entry, ssh_root, visited)?);
            }
        }
    }
    Ok(aliases)
}

fn expand_include(pattern: &str, ssh_root: &Path) -> PathBuf {
    if let Some(relative) = pattern
        .strip_prefix("~/")
        .or_else(|| pattern.strip_prefix("~\\"))
    {
        return ssh_root.parent().unwrap_or(ssh_root).join(relative);
    }
    let path = PathBuf::from(pattern);
    if path.is_absolute() {
        path
    } else {
        ssh_root.join(path)
    }
}

/// A name no `Host` block matches (`.invalid` is reserved), so `ssh -G` for it
/// reports OpenSSH's defaults rather than anything the user configured.
const OPENSSH_DEFAULTS_PROBE: &str = "clio-openssh-defaults.invalid";

/// Drop effective values an imported profile only has because OpenSSH fills
/// them in by default (the first default IdentityFile, the local user name),
/// so configuring it as a CLIO computer never pins them.
fn without_openssh_defaults(mut profile: SshProfile, defaults: Option<&SshProfile>) -> SshProfile {
    let Some(defaults) = defaults else {
        return profile;
    };
    if profile.user.is_some() && profile.user == defaults.user {
        profile.user = None;
    }
    if profile.identity_file.is_some() && profile.identity_file == defaults.identity_file {
        profile.identity_file = None;
    }
    profile
}

fn managed_block<'a>(blocks: &'a [String], name: &str) -> Option<&'a str> {
    blocks
        .iter()
        .find(|block| block_name(block).is_some_and(|value| value.eq_ignore_ascii_case(name)))
        .map(String::as_str)
}

/// A CLIO-saved profile exactly as CLIO declared it (see `ssh_profile_blocks`).
fn managed_profile(name: &str, block: &str, metadata: Option<&ProfileMetadata>) -> SshProfile {
    let declared = declared_profile(block);
    SshProfile {
        name: name.into(),
        label: metadata.and_then(|value| some_value(&value.label)),
        hostname: declared.hostname,
        user: declared.user,
        port: declared.port.unwrap_or_else(default_port),
        identity_file: declared.identity_file,
        jump_hosts: declared.jump_hosts,
        platform: metadata
            .and_then(|value| some_value(&value.platform))
            .unwrap_or_else(default_platform),
        install_root: metadata.and_then(|value| some_value(&value.install_root)),
        managed: true,
        hidden: false,
    }
}

fn resolve_profile(
    name: &str,
    managed: bool,
    metadata: Option<&ProfileMetadata>,
) -> Result<SshProfile, String> {
    let mut command = Command::new("ssh");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .args(["-G", name])
        .output()
        .map_err(|error| format!("Could not inspect OpenSSH profile {name}: {error}"))?;
    if !output.status.success() {
        return Err(format!("OpenSSH could not resolve profile {name}."));
    }
    let mut hostname = None;
    let mut user = None;
    let mut port = 22;
    let mut identity_file = None;
    let mut jump_hosts = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        let value = value.trim();
        match key {
            "hostname" => hostname = some_value(value),
            "user" => user = some_value(value),
            "port" => port = value.parse().unwrap_or(22),
            "identityfile" if identity_file.is_none() => identity_file = some_value(value),
            "proxyjump" if value != "none" => {
                jump_hosts = value
                    .split(',')
                    .map(str::trim)
                    .map(str::to_string)
                    .collect()
            }
            _ => {}
        }
    }
    Ok(SshProfile {
        name: name.into(),
        label: metadata.and_then(|value| some_value(&value.label)),
        hostname,
        user,
        port,
        identity_file,
        jump_hosts,
        platform: metadata
            .and_then(|value| some_value(&value.platform))
            .unwrap_or_else(default_platform),
        install_root: metadata.and_then(|value| some_value(&value.install_root)),
        managed,
        hidden: false,
    })
}

fn some_value(value: &str) -> Option<String> {
    (!value.is_empty() && value != "none").then(|| value.to_string())
}

fn validate_profile(request: &SaveSshProfileRequest) -> Result<(), String> {
    validate_alias(&request.name)?;
    validate_value("label", &request.label)?;
    validate_directive_value("hostname", &request.hostname, false)?;
    validate_directive_value("user", &request.user, true)?;
    validate_directive_value("identity file", &request.identity_file, true)?;
    validate_value("install root", &request.install_root)?;
    if request.port == 0 {
        return Err("SSH port must be between 1 and 65535.".into());
    }
    if !matches!(request.platform.as_str(), "auto" | "linux" | "windows") {
        return Err("Remote platform must be auto, linux, or windows.".into());
    }
    for jump in &request.jump_hosts {
        validate_jump_host(jump)?;
    }
    Ok(())
}

fn validate_alias(value: &str) -> Result<(), String> {
    if value.is_empty()
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
    {
        return Err(
            "SSH profile names may contain only letters, numbers, dot, dash, and underscore."
                .into(),
        );
    }
    Ok(())
}

fn validate_value(label: &str, value: &str) -> Result<(), String> {
    if value.contains(['\r', '\n', '\0']) {
        return Err(format!("SSH {label} contains invalid control characters."));
    }
    Ok(())
}

fn render_profile(request: &SaveSshProfileRequest) -> String {
    let mut lines = vec![
        format!("Host {}", request.name),
        format!("  HostName {}", request.hostname),
        format!("  Port {}", request.port),
    ];
    if !request.user.is_empty() {
        lines.push(format!("  User {}", quoted(&request.user)));
    }
    if !request.identity_file.is_empty() {
        lines.push(format!("  IdentityFile {}", quoted(&request.identity_file)));
    }
    if !request.jump_hosts.is_empty() {
        lines.push(format!("  ProxyJump {}", request.jump_hosts.join(",")));
    }
    lines.join("\n")
}

fn read_managed_blocks(path: &Path) -> Result<Vec<String>, String> {
    let contents = match fs::read_to_string(path) {
        Ok(value) => value.replace("\r\n", "\n"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("Could not read {}: {error}", path.display())),
    };
    Ok(contents
        .split("\n\n")
        .map(str::trim)
        .filter(|block| !block.is_empty())
        .map(str::to_string)
        .collect())
}

fn block_name(block: &str) -> Option<&str> {
    let line = block.lines().next()?.trim();
    let (key, value) = line.split_once(char::is_whitespace)?;
    key.eq_ignore_ascii_case("host").then(|| value.trim())
}

fn read_preferences(path: &Path) -> Result<ProfilePreferences, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| format!("Could not parse {}: {error}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Default::default()),
        Err(error) => Err(format!("Could not read {}: {error}", path.display())),
    }
}

fn write_preferences(path: &Path, value: &ProfilePreferences) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Could not encode SSH profile preferences: {error}"))?;
    write_atomic(path, &format!("{contents}\n"))
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Configuration path has no parent directory.")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    let temporary = path.with_extension("clio.tmp");
    fs::write(&temporary, contents)
        .map_err(|error| format!("Could not write {}: {error}", temporary.display()))?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not replace {}: {error}", path.display()))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| format!("Could not replace {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_ordered_proxy_jump_without_secrets() {
        let request = SaveSshProfileRequest {
            name: "utah".into(),
            label: "Utah cluster".into(),
            hostname: "login.utah.edu".into(),
            user: "alice".into(),
            port: 22,
            identity_file: String::new(),
            jump_hosts: vec!["gateway".into(), "bastion".into()],
            platform: "linux".into(),
            install_root: "/mnt/common/alice/clio".into(),
            managed_identity: false,
            replace_existing: false,
        };
        assert_eq!(
            render_profile(&request),
            "Host utah\n  HostName login.utah.edu\n  Port 22\n  User alice\n  ProxyJump gateway,bastion"
        );
    }

    /// `resolve_all_profiles` reports every managed alias's hidden preference
    /// (what the hosts manager lists), while `ssh_profiles_list` filters
    /// hidden ones out (what every other picker gets). Both managed aliases
    /// here so the test never shells out to real `ssh -G` resolution.
    #[test]
    fn reports_hidden_preference_for_every_managed_alias() {
        let dir = env::temp_dir().join(format!("clio-ssh-profiles-test-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let managed_include = dir.join("clio-managed-config");
        fs::write(
            &managed_include,
            "Host visible-host\n  HostName visible.example.edu\n  Port 22\n\nHost hidden-host\n  HostName hidden.example.edu\n  Port 22",
        )
        .expect("write managed include");
        let paths = ProfilePaths {
            user_config: dir.join("user-config-does-not-exist"),
            managed_include,
            preferences: dir.join("preferences.json"),
            identity_directory: dir.join("identities"),
        };
        let mut preferences = ProfilePreferences::default();
        preferences.hidden.insert("hidden-host".into());

        let all = resolve_all_profiles(&paths, &preferences).expect("resolve all profiles");
        let hidden: BTreeMap<_, _> = all
            .iter()
            .map(|profile| (profile.name.clone(), profile.hidden))
            .collect();
        assert_eq!(hidden.get("visible-host"), Some(&false));
        assert_eq!(hidden.get("hidden-host"), Some(&true));

        let listed = ssh_profiles_list_names(&paths, &preferences);
        assert_eq!(listed, vec!["visible-host".to_string()]);

        let _ = fs::remove_dir_all(&dir);
    }

    /// The same filtering `ssh_profiles_list` applies, without needing a
    /// `tauri::AppHandle` to resolve `ProfilePaths`.
    fn ssh_profiles_list_names(
        paths: &ProfilePaths,
        preferences: &ProfilePreferences,
    ) -> Vec<String> {
        resolve_all_profiles(paths, preferences)
            .expect("resolve all profiles")
            .into_iter()
            .filter(|profile| !profile.hidden)
            .map(|profile| profile.name)
            .collect()
    }

    #[test]
    fn rejects_config_injection() {
        let request = SaveSshProfileRequest {
            name: "unsafe".into(),
            label: String::new(),
            hostname: "host\nProxyCommand bad".into(),
            user: String::new(),
            port: 22,
            identity_file: String::new(),
            jump_hosts: Vec::new(),
            platform: "auto".into(),
            install_root: String::new(),
            managed_identity: false,
            replace_existing: false,
        };
        assert!(validate_profile(&request).is_err());
    }
}

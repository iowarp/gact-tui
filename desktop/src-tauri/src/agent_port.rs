//! The port a machine's agent serves on, read from the agent's own configuration (#739 B7).
//!
//! The brand's `portConfig` names the agent config key (`gact.port`), its env override
//! (`CLIO_PORT`) and the default. One server runs per machine, so only the user config root
//! counts, never a workspace layer: the agent's resolver module when a Python is at hand,
//! else `gact.port` in `<config root>/config.yaml` (roots per the agent's clio-paths.yaml),
//! else the env var, else the brand default. Brands without a port config keep the default.

use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::brand_backend::{brand_backend, PortConfig};

/// The agent resolver is a tiny import; anything slower is treated as missing.
const RESOLVER_TIMEOUT: Duration = Duration::from_secs(3);

/// The agent address the desktop attaches to and offers as the default connection.
pub(crate) fn agent_endpoint() -> String {
    let bb = brand_backend();
    if let Some(url) = std::env::var(&bb.attach_url_env)
        .ok()
        .map(|url| url.trim().trim_end_matches('/').to_string())
        .filter(|url| !url.is_empty())
    {
        return url;
    }
    format!(
        "http://127.0.0.1:{}",
        configured_port(agent_python().as_deref())
    )
}

/// The interpreter of an agent runtime named by the bundled-runtime env var, if any.
fn agent_python() -> Option<PathBuf> {
    let runtime = std::env::var_os(crate::sidecar_setup::BUNDLED_RUNTIME_ENV)?;
    crate::execution_install::bundled_python(Path::new(&runtime)).ok()
}

/// Resolve the configured port, asking `python` (an interpreter with the agent installed)
/// first when one is given.
pub(crate) fn configured_port(python: Option<&Path>) -> u16 {
    let config = &brand_backend().port_config;
    let env = |name: &str| std::env::var(name).ok();
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    python
        .and_then(|python| resolver_port(config, python))
        .unwrap_or_else(|| port_from_sources(config, home.as_deref(), env))
}

/// The configured port from the user config file, the env override, then the default.
fn port_from_sources(
    config: &PortConfig,
    home: Option<&Path>,
    env: impl Fn(&str) -> Option<String>,
) -> u16 {
    let from_file = config.key.as_deref().and_then(|key| {
        let product = config.product.as_deref()?;
        user_config_files(product, home?, &env)
            .into_iter()
            .find(|path| path.is_file())
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|text| port_in_yaml(&text, key))
    });
    from_file
        .or_else(|| {
            config
                .env
                .as_deref()
                .and_then(&env)
                .and_then(|value| parse_port(&value))
        })
        .unwrap_or(config.default)
}

/// Run `python -m <resolver>` outside any workspace, so only the user layer applies.
fn resolver_port(config: &PortConfig, python: &Path) -> Option<u16> {
    let module = config.resolver.as_deref()?;
    let mut command = Command::new(python);
    command
        .args(["-I", "-B", "-m", module])
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    let mut child = command.spawn().ok()?;
    let deadline = Instant::now() + RESOLVER_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let mut output = String::new();
    std::io::Read::read_to_string(&mut child.stdout.take()?, &mut output).ok()?;
    parse_port(output.trim())
}

/// The agent's user `config.yaml`, then the legacy XDG location the agent still honours.
/// Mirrors `clio_agent.paths.resolve_root("config")`.
fn user_config_files(
    product: &str,
    home: &Path,
    env: &impl Fn(&str) -> Option<String>,
) -> Vec<PathBuf> {
    let absolute = |name: &str| {
        env(name)
            .map(|value| PathBuf::from(value.trim()))
            .filter(|path| path.is_absolute())
    };
    let prefix = product.to_ascii_uppercase().replace('-', "_");
    if let Some(dir) = absolute(&format!("{prefix}_CONFIG_DIR")) {
        return vec![dir.join("config.yaml")];
    }
    if let Some(dir) = absolute(&format!("{prefix}_HOME")) {
        return vec![dir.join("config").join("config.yaml")];
    }
    if let Some(dir) = absolute("CLIO_USER_DIR") {
        return vec![dir.join("config.yaml")];
    }
    let xdg = absolute("XDG_CONFIG_HOME").unwrap_or_else(|| home.join(".config"));
    let native = if cfg!(windows) {
        absolute("APPDATA")
            .unwrap_or_else(|| home.join("AppData/Roaming"))
            .join(product)
            .join("config")
    } else if cfg!(target_os = "macos") {
        home.join("Library/Application Support")
            .join(product)
            .join("config")
    } else {
        xdg.join(product)
    };
    let legacy = xdg.join(product);
    let mut files = vec![native.join("config.yaml")];
    if legacy != native && !native.exists() {
        files.push(legacy.join("config.yaml"));
    }
    files
}

/// A dotted key (`gact.port`) from a YAML document: nested block mappings or one flat key.
fn port_in_yaml(text: &str, key: &str) -> Option<u16> {
    let parts: Vec<&str> = key.split('.').collect();
    let lines: Vec<(usize, &str)> = text
        .lines()
        .map(|line| line.split(" #").next().unwrap_or(""))
        .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with('#'))
        .map(|line| (line.len() - line.trim_start().len(), line.trim()))
        .collect();
    if let Some(value) = lines
        .iter()
        .filter(|(indent, _)| *indent == 0)
        .find_map(|(_, line)| mapping_value(line, key))
    {
        return parse_port(value);
    }
    let mut parent_indent: Option<usize> = None;
    let mut child_indent: Option<usize> = None;
    let mut depth = 0;
    for (indent, line) in lines {
        if let Some(parent) = parent_indent {
            if indent <= parent {
                return None;
            }
            if *child_indent.get_or_insert(indent) != indent {
                continue;
            }
        } else if indent != 0 {
            continue;
        }
        let Some(value) = mapping_value(line, parts[depth]) else {
            continue;
        };
        if depth + 1 == parts.len() {
            return parse_port(value);
        }
        if !value.is_empty() {
            return None;
        }
        parent_indent = Some(indent);
        child_indent = None;
        depth += 1;
    }
    None
}

fn mapping_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(key)?.trim_start();
    Some(rest.strip_prefix(':')?.trim())
}

fn parse_port(value: &str) -> Option<u16> {
    value
        .trim_matches(|ch| ch == '"' || ch == '\'')
        .parse::<u16>()
        .ok()
        .filter(|port| *port > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::fs;

    fn clio() -> PortConfig {
        PortConfig {
            key: Some("gact.port".into()),
            env: Some("CLIO_PORT".into()),
            default: 17800,
            product: Some("clio-agent".into()),
            resolver: Some("clio_agent.server_port".into()),
        }
    }

    fn config_home(name: &str, yaml: Option<&str>) -> PathBuf {
        let home = std::env::temp_dir().join(format!("clio-port-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        let dir = home.join("agent-home").join("config");
        fs::create_dir_all(&dir).expect("config dir");
        if let Some(yaml) = yaml {
            fs::write(dir.join("config.yaml"), yaml).expect("config file");
        }
        home
    }

    fn env_with(home: &Path, port_env: Option<&str>) -> impl Fn(&str) -> Option<String> {
        let mut vars = HashMap::new();
        vars.insert(
            "CLIO_AGENT_HOME".to_string(),
            home.join("agent-home").to_string_lossy().into_owned(),
        );
        if let Some(port) = port_env {
            vars.insert("CLIO_PORT".to_string(), port.to_string());
        }
        move |name: &str| vars.get(name).cloned()
    }

    #[test]
    fn the_user_config_file_sets_the_port_over_the_env_override() {
        let home = config_home(
            "file",
            Some("model: x\ngact:\n  host: 0.0.0.0\n  port: 18123 # local\n"),
        );
        assert_eq!(
            port_from_sources(&clio(), Some(&home), env_with(&home, Some("19000"))),
            18123
        );
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn the_env_override_then_the_brand_default_apply_without_a_config_key() {
        let home = config_home("env", Some("gact:\n  host: 0.0.0.0\n"));
        assert_eq!(
            port_from_sources(&clio(), Some(&home), env_with(&home, Some("19000"))),
            19000
        );
        assert_eq!(
            port_from_sources(&clio(), Some(&home), env_with(&home, None)),
            17800
        );
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn a_brand_without_a_port_config_uses_its_default() {
        let neutral = PortConfig {
            key: None,
            env: None,
            default: 17800,
            product: None,
            resolver: None,
        };
        let home = config_home("neutral", Some("gact:\n  port: 18123\n"));
        assert_eq!(
            port_from_sources(&neutral, Some(&home), env_with(&home, Some("19000"))),
            17800
        );
        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn yaml_keys_are_read_nested_or_flat_and_never_from_another_section() {
        assert_eq!(
            port_in_yaml("gact.port: \"18001\"\n", "gact.port"),
            Some(18001)
        );
        assert_eq!(
            port_in_yaml("gact:\n\n  # port: 1\n  port: 18002\n", "gact.port"),
            Some(18002)
        );
        assert_eq!(
            port_in_yaml("other:\n  port: 18003\ngact:\n  host: x\n", "gact.port"),
            None
        );
        assert_eq!(
            port_in_yaml("gact:\n  tls:\n    port: 443\n  port: 18004\n", "gact.port"),
            Some(18004)
        );
        assert_eq!(port_in_yaml("gact:\n  port: 99999\n", "gact.port"), None);
    }

    #[test]
    fn the_config_root_follows_the_agent_path_overrides() {
        let home = std::env::temp_dir().join("clio-port-home");
        let home = home.as_path();
        let etc = std::env::temp_dir().join("clio-port-etc");
        let etc_text = etc.to_string_lossy().into_owned();
        let direct = move |name: &str| (name == "CLIO_AGENT_CONFIG_DIR").then(|| etc_text.clone());
        assert_eq!(
            user_config_files("clio-agent", home, &direct),
            vec![etc.join("config.yaml")]
        );
        let none = |_: &str| None;
        let native = &user_config_files("clio-agent", home, &none)[0];
        assert!(native.ends_with("config.yaml"), "{native:?}");
        assert!(
            native.to_string_lossy().contains("clio-agent"),
            "{native:?}"
        );
    }

    #[test]
    fn a_missing_resolver_falls_back() {
        assert_eq!(
            resolver_port(&clio(), Path::new("/definitely/not/python")),
            None
        );
    }
}

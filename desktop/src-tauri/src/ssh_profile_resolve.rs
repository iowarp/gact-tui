//! `ssh -G` resolution of imported OpenSSH hosts, in parallel and cached.
//!
//! Resolving a host means asking OpenSSH itself (`ssh -G <alias>`), which
//! spawns one process per alias. Doing that sequentially for every alias on
//! every list made the hosts manager lag on each hide/unhide. Results are
//! cached keyed by a fingerprint of every OpenSSH configuration file involved
//! (path, size, and modification time), so the cache is only an accelerator:
//! any edit to any of those files changes the fingerprint and drops it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// At most this many `ssh -G` processes run at once.
const MAX_PARALLEL: usize = 8;

/// What OpenSSH reports for one alias.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResolvedHost {
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: u16,
    pub identity_file: Option<String>,
    pub jump_hosts: Vec<String>,
}

/// Identity of the configuration a resolution was computed from.
pub type ConfigFingerprint = Vec<(PathBuf, Option<u64>, Option<SystemTime>)>;

#[derive(Default)]
struct Cache {
    fingerprint: ConfigFingerprint,
    entries: HashMap<String, ResolvedHost>,
}

fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Cache::default()))
}

/// Fingerprint the given configuration files plus OpenSSH's system-wide file.
pub fn fingerprint(files: impl IntoIterator<Item = PathBuf>) -> ConfigFingerprint {
    let mut paths: Vec<PathBuf> = files.into_iter().collect();
    paths.push(system_config_path());
    paths.sort();
    paths.dedup();
    paths
        .into_iter()
        .map(|path| {
            let metadata = std::fs::metadata(&path).ok();
            let size = metadata.as_ref().map(std::fs::Metadata::len);
            let modified = metadata.and_then(|value| value.modified().ok());
            (path, size, modified)
        })
        .collect()
}

fn system_config_path() -> PathBuf {
    #[cfg(windows)]
    {
        let root = std::env::var_os("PROGRAMDATA").unwrap_or_else(|| "C:\\ProgramData".into());
        Path::new(&root).join("ssh").join("ssh_config")
    }
    #[cfg(not(windows))]
    {
        PathBuf::from("/etc/ssh/ssh_config")
    }
}

/// Resolve every alias with real `ssh -G`, reusing cached results for an
/// unchanged configuration.
pub fn resolve_hosts(
    names: &[String],
    fingerprint: ConfigFingerprint,
) -> HashMap<String, Result<ResolvedHost, String>> {
    resolve_hosts_with(names, fingerprint, cache(), resolve_with_openssh)
}

fn resolve_hosts_with(
    names: &[String],
    fingerprint: ConfigFingerprint,
    cache: &Mutex<Cache>,
    resolve: impl Fn(&str) -> Result<ResolvedHost, String> + Sync,
) -> HashMap<String, Result<ResolvedHost, String>> {
    let mut results = HashMap::new();
    let missing: Vec<String> = {
        let mut guard = cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.fingerprint != fingerprint {
            guard.entries.clear();
            guard.fingerprint = fingerprint.clone();
        }
        names
            .iter()
            .filter(|name| match guard.entries.get(name.as_str()) {
                Some(hit) => {
                    results.insert((*name).clone(), Ok(hit.clone()));
                    false
                }
                None => true,
            })
            .cloned()
            .collect()
    };
    if missing.is_empty() {
        return results;
    }
    let chunk = missing.len().div_ceil(MAX_PARALLEL).max(1);
    let resolved: Vec<(String, Result<ResolvedHost, String>)> = std::thread::scope(|scope| {
        let workers: Vec<_> = missing
            .chunks(chunk)
            .map(|names| {
                let resolve = &resolve;
                scope.spawn(move || {
                    names
                        .iter()
                        .map(|name| (name.clone(), resolve(name)))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        workers
            .into_iter()
            .flat_map(|worker| worker.join().unwrap_or_default())
            .collect()
    });
    let mut guard = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for (name, result) in resolved {
        // Failures are never cached: OpenSSH may simply not be installed yet.
        if let (Ok(host), true) = (&result, guard.fingerprint == fingerprint) {
            guard.entries.insert(name.clone(), host.clone());
        }
        results.insert(name, result);
    }
    results
}

fn resolve_with_openssh(name: &str) -> Result<ResolvedHost, String> {
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
    Ok(parse_resolution(&String::from_utf8_lossy(&output.stdout)))
}

/// Parse the `key value` lines `ssh -G` prints.
pub fn parse_resolution(text: &str) -> ResolvedHost {
    let mut host = ResolvedHost {
        port: 22,
        ..ResolvedHost::default()
    };
    for line in text.lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        let value = value.trim();
        let some = || (!value.is_empty() && value != "none").then(|| value.to_string());
        match key {
            "hostname" => host.hostname = some(),
            "user" => host.user = some(),
            "port" => host.port = value.parse().unwrap_or(22),
            "identityfile" if host.identity_file.is_none() => host.identity_file = some(),
            "proxyjump" if value != "none" => {
                host.jump_hosts = value
                    .split(',')
                    .map(str::trim)
                    .map(str::to_string)
                    .collect()
            }
            _ => {}
        }
    }
    host
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn names(count: usize) -> Vec<String> {
        (0..count).map(|index| format!("host-{index}")).collect()
    }

    fn fake(name: &str) -> Result<ResolvedHost, String> {
        Ok(ResolvedHost {
            hostname: Some(format!("{name}.example.edu")),
            port: 22,
            ..ResolvedHost::default()
        })
    }

    #[test]
    fn unchanged_configuration_is_resolved_once() {
        let cache = Mutex::new(Cache::default());
        let calls = AtomicUsize::new(0);
        let counted = |name: &str| {
            calls.fetch_add(1, Ordering::SeqCst);
            fake(name)
        };
        let print = vec![(PathBuf::from("config"), Some(10), None)];
        let first = resolve_hosts_with(&names(20), print.clone(), &cache, counted);
        assert_eq!(first.len(), 20);
        assert_eq!(calls.load(Ordering::SeqCst), 20);
        // A visibility change re-lists every host: nothing is re-resolved.
        let second = resolve_hosts_with(&names(20), print, &cache, counted);
        assert_eq!(second, first);
        assert_eq!(calls.load(Ordering::SeqCst), 20);
    }

    #[test]
    fn an_edited_config_file_drops_the_cache() {
        let cache = Mutex::new(Cache::default());
        let calls = AtomicUsize::new(0);
        let counted = |name: &str| {
            calls.fetch_add(1, Ordering::SeqCst);
            fake(name)
        };
        resolve_hosts_with(
            &names(3),
            vec![(PathBuf::from("c"), Some(1), None)],
            &cache,
            counted,
        );
        resolve_hosts_with(
            &names(3),
            vec![(PathBuf::from("c"), Some(2), None)],
            &cache,
            counted,
        );
        assert_eq!(calls.load(Ordering::SeqCst), 6);
    }

    #[test]
    fn failures_are_reported_and_never_cached() {
        let cache = Mutex::new(Cache::default());
        let calls = AtomicUsize::new(0);
        let failing = |_: &str| {
            calls.fetch_add(1, Ordering::SeqCst);
            Err("OpenSSH could not resolve profile".to_string())
        };
        let print = ConfigFingerprint::new();
        assert!(resolve_hosts_with(&names(2), print.clone(), &cache, failing)["host-0"].is_err());
        resolve_hosts_with(&names(2), print, &cache, failing);
        assert_eq!(calls.load(Ordering::SeqCst), 4);
    }

    #[test]
    fn resolution_runs_in_parallel() {
        let cache = Mutex::new(Cache::default());
        let running = AtomicUsize::new(0);
        let peak = AtomicUsize::new(0);
        let slow = |name: &str| {
            let now = running.fetch_add(1, Ordering::SeqCst) + 1;
            peak.fetch_max(now, Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(30));
            running.fetch_sub(1, Ordering::SeqCst);
            fake(name)
        };
        resolve_hosts_with(&names(16), ConfigFingerprint::new(), &cache, slow);
        assert!(peak.load(Ordering::SeqCst) > 1);
        assert!(peak.load(Ordering::SeqCst) <= MAX_PARALLEL);
    }

    #[test]
    fn fingerprint_tracks_size_and_mtime() {
        let dir = std::env::temp_dir().join(format!("clio-ssh-fp-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("config");
        std::fs::write(&file, "Host a\n").unwrap();
        let before = fingerprint([file.clone()]);
        std::fs::write(&file, "Host a\nHost b\n").unwrap();
        assert_ne!(fingerprint([file.clone()]), before);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_ssh_g_output() {
        let host = parse_resolution(
            "hostname ares.example.edu\nuser alice\nport 2222\nidentityfile ~/.ssh/id_a\nidentityfile ~/.ssh/id_b\nproxyjump gw1,gw2\n",
        );
        assert_eq!(host.hostname.as_deref(), Some("ares.example.edu"));
        assert_eq!(host.port, 2222);
        assert_eq!(host.identity_file.as_deref(), Some("~/.ssh/id_a"));
        assert_eq!(host.jump_hosts, ["gw1", "gw2"]);
        assert!(parse_resolution("proxyjump none\n").jump_hosts.is_empty());
    }
}

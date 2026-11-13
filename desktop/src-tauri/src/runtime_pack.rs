//! Installation of the compressed runtime shipped by bundled Windows builds.
//!
//! NSIS is deliberately not asked to expand the Python distribution one file
//! at a time. It copies one archive and one manifest; the desktop then expands
//! the archive into its writable app-data directory on a worker thread before
//! starting the managed backend. The archive is read once: it is hashed while
//! it is unpacked, and the staged runtime is activated only if the hash matches.

use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::{
    fs,
    sync::{Arc, Mutex},
    time::Instant,
};

#[cfg(windows)]
use serde::Deserialize;

use crate::sidecar_setup::bundled_runtime_dir;

#[cfg(windows)]
use crate::installer_dir_swap;
#[cfg(windows)]
use crate::installer_runtime_stop;

const PACK_MANIFEST_NAME: &str = "gact-runtime.pack.json";

/// A bundled installation must launch its own matching runtime, not silently
/// adopt a different independently running CLIO on the conventional port.
pub(crate) fn has_bundled_runtime(resource_dir: &Path, app_local_data_dir: &Path) -> bool {
    has_runtime_payload(resource_dir)
        || app_local_data_dir
            .join("bundled-runtime/gact-runtime/runtime.json")
            .is_file()
}

/// Signed app updates already replace this payload; no parallel pip upgrade is needed.
pub(crate) fn has_runtime_payload(resource_dir: &Path) -> bool {
    resource_dir.join(PACK_MANIFEST_NAME).is_file() || bundled_runtime_dir(resource_dir).is_some()
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
struct RuntimePackManifest {
    schema: u8,
    archive: String,
    sha256: String,
    #[serde(default)]
    runtime_files: Option<u64>,
    /// Size of the archive; required to read a download still in progress.
    #[serde(default)]
    archive_bytes: Option<u64>,
    /// Release asset name of an archive the setup does not carry. `install.ps1`
    /// downloads it into `CLIO_INSTALL_DOWNLOADS` as `NAME.part`, then `NAME`.
    #[serde(default)]
    asset: Option<String>,
    /// Where to fetch that asset when no installer download supplies it.
    #[serde(default)]
    url: Option<String>,
}

/// Where the pack's bytes come from, in the order they are tried.
#[cfg(windows)]
enum PackOrigin {
    Resource(PathBuf),
    Download {
        directory: PathBuf,
        name: String,
        bytes: u64,
    },
    Url {
        url: String,
        bytes: u64,
    },
}

#[cfg(windows)]
fn pack_origins(resource: PathBuf, manifest: &RuntimePackManifest) -> Vec<PackOrigin> {
    if resource.is_file() {
        return vec![PackOrigin::Resource(resource)];
    }
    let mut origins = Vec::new();
    let bytes = manifest.archive_bytes.unwrap_or(0);
    let name = manifest.asset.as_deref().filter(|name| {
        !name.is_empty()
            && !name.starts_with('.')
            && name
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || "._+-".contains(ch))
    });
    if let (Some(name), Some(directory), true) =
        (name, std::env::var_os("CLIO_INSTALL_DOWNLOADS"), bytes > 0)
    {
        origins.push(PackOrigin::Download {
            directory: PathBuf::from(directory),
            name: name.to_owned(),
            bytes,
        });
    }
    if let Some(url) = manifest.url.as_deref().filter(|url| !url.is_empty()) {
        origins.push(PackOrigin::Url {
            url: url.to_owned(),
            bytes,
        });
    }
    origins
}

/// A download `install.ps1` is still writing. Reads wait for more bytes until
/// the manifest's size has been read; the caller's hash decides validity.
#[cfg(windows)]
struct GrowingDownload {
    file: fs::File,
    read: u64,
    bytes: u64,
    finished: PathBuf,
    partial: PathBuf,
    last_growth: Instant,
}

#[cfg(windows)]
impl std::io::Read for GrowingDownload {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        const STALL: std::time::Duration = std::time::Duration::from_secs(90);
        if self.read >= self.bytes || buf.is_empty() {
            return Ok(0);
        }
        let limit = buf.len().min((self.bytes - self.read) as usize);
        loop {
            let count = self.file.read(&mut buf[..limit])?;
            if count > 0 {
                self.read += count as u64;
                self.last_growth = Instant::now();
                return Ok(count);
            }
            // install.ps1 removes a download whose hash it refused.
            if !self.finished.exists() && !self.partial.exists() {
                return Err(std::io::Error::other("the runtime download was abandoned"));
            }
            if self.last_growth.elapsed() > STALL {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "the runtime download stopped arriving",
                ));
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    }
}

#[cfg(windows)]
fn open_pack(origin: &PackOrigin) -> Result<crate::runtime_unpack::PackSource, String> {
    use crate::runtime_unpack::PackSource;
    use std::os::windows::fs::OpenOptionsExt;
    const SHARE_ALL: u32 = 0x1 | 0x2 | 0x4; // read, write (curl), delete (rename)
    match origin {
        PackOrigin::Resource(path) => Ok(PackSource::File(path.clone())),
        PackOrigin::Download {
            directory,
            name,
            bytes,
        } => {
            let finished = directory.join(name);
            let partial = directory.join(format!("{name}.part"));
            let deadline = Instant::now() + std::time::Duration::from_secs(30);
            loop {
                for path in [&finished, &partial] {
                    if let Ok(file) = fs::OpenOptions::new()
                        .read(true)
                        .share_mode(SHARE_ALL)
                        .open(path)
                    {
                        return Ok(PackSource::Stream {
                            reader: Box::new(GrowingDownload {
                                file,
                                read: 0,
                                bytes: *bytes,
                                finished: finished.clone(),
                                partial: partial.clone(),
                                last_growth: Instant::now(),
                            }),
                            bytes: *bytes,
                        });
                    }
                }
                if Instant::now() > deadline {
                    return Err(format!("the installer is not downloading {name}"));
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
        PackOrigin::Url { url, bytes } => {
            let agent = ureq::AgentBuilder::new()
                .timeout_connect(std::time::Duration::from_secs(30))
                .timeout_read(std::time::Duration::from_secs(90))
                .build();
            let response = agent
                .get(url)
                .call()
                .map_err(|error| format!("download the CLIO runtime from {url}: {error}"))?;
            Ok(PackSource::Stream {
                reader: response.into_reader(),
                bytes: *bytes,
            })
        }
    }
}

/// Resolve the runtime used by a managed backend, installing a compressed
/// Windows pack when this bundle carries one. Non-Windows bundles retain the
/// existing exploded-resource layout.
pub(crate) fn prepare_bundled_runtime(
    resource_dir: &Path,
    app_local_data_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    #[cfg(windows)]
    {
        return prepare_windows_runtime(resource_dir, app_local_data_dir, &|_| {});
    }

    #[cfg(not(windows))]
    {
        let _ = app_local_data_dir;
        Ok(bundled_runtime_dir(resource_dir))
    }
}

#[cfg(windows)]
fn prepare_windows_runtime(
    resource_dir: &Path,
    app_local_data_dir: &Path,
    progress: &dyn Fn(&str),
) -> Result<Option<PathBuf>, String> {
    let manifest_path = resource_dir.join(PACK_MANIFEST_NAME);
    if !manifest_path.is_file() {
        let installed = app_local_data_dir.join("bundled-runtime/gact-runtime");
        return Ok(installed
            .join("runtime.json")
            .is_file()
            .then_some(installed)
            .or_else(|| bundled_runtime_dir(resource_dir)));
    }

    let manifest_bytes = fs::read(&manifest_path)
        .map_err(|error| format!("read runtime pack manifest {manifest_path:?}: {error}"))?;
    let manifest: RuntimePackManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("parse runtime pack manifest {manifest_path:?}: {error}"))?;
    if manifest.schema != 1 {
        return Err(format!(
            "unsupported runtime pack manifest schema {}",
            manifest.schema
        ));
    }
    if manifest.archive != "gact-runtime.tar.zst" {
        return Err(format!(
            "runtime pack manifest names an unsupported archive {:?}",
            manifest.archive
        ));
    }
    let expected_hash = manifest.sha256.trim().to_ascii_lowercase();
    if expected_hash.len() != 64 || !expected_hash.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("runtime pack manifest contains an invalid SHA-256".into());
    }

    let install_root = app_local_data_dir.join("bundled-runtime");
    let runtime_dir = install_root.join("gact-runtime");
    let receipt_path = install_root.join("pack.sha256");
    if runtime_dir.join("runtime.json").is_file()
        && fs::read_to_string(&receipt_path)
            .ok()
            .is_some_and(|value| value.trim().eq_ignore_ascii_case(&expected_hash))
    {
        progress("The bundled CLIO runtime is already prepared.");
        return Ok(Some(runtime_dir));
    }

    let archive_path = resource_dir.join(&manifest.archive);
    let origins = pack_origins(archive_path.clone(), &manifest);
    if origins.is_empty() {
        return Err(format!(
            "the bundled runtime is incomplete: {:?} is missing",
            archive_path
        ));
    }
    // The app is single-instance, so stable names are sufficient and let a
    // later launch or the uninstaller clean a directory left by a power loss.
    // No managed process ever runs from the staging directory.
    let staging_root = app_local_data_dir.join("bundled-runtime.installing");
    let previous_root = app_local_data_dir.join("bundled-runtime.previous");
    progress("Preparing the runtime installation directory...");
    remove_dir_if_present(&staging_root)?;
    fs::create_dir_all(&staging_root)
        .map_err(|error| format!("create runtime staging directory {staging_root:?}: {error}"))?;
    // Files unpacked under an already granted directory inherit the sandbox
    // users' access as they are created, instead of the agent rewriting every
    // file's permissions after the unpack.
    let pregrant = runtime_grants_sandbox_access(&runtime_dir);
    let granted = std::cell::Cell::new(pregrant && grant_sandbox_access(&staging_root));

    let install_result = (|| -> Result<(), String> {
        progress("Unpacking and checking the bundled CLIO runtime...");
        let started = Instant::now();
        // Stop every CLIO-managed process under the install root BEFORE touching
        // the installed runtime or its backup. The shared clio-core daemon
        // (`clio_run.exe`) deliberately survives an ordinary app quit (it breaks
        // away from our Job Object so independent CLIO clients can keep using it
        // — see `supervisor_shutdown`), so a user who closed CLIO Desktop right
        // before this runs can still have it sitting on the directory this
        // function renames. The sweep (clean `stop`, then TerminateProcess and a
        // wait on the handle) runs while the pack unpacks into staging.
        let (unpacked, stopped) = std::thread::scope(|scope| {
            let stopping = scope.spawn(|| {
                let started = Instant::now();
                installer_runtime_stop::stop_and_log(resource_dir, "prepare-runtime");
                started.elapsed().as_secs_f64()
            });
            let unpacked = (|| {
                let mut failures = Vec::new();
                for (index, origin) in origins.iter().enumerate() {
                    if index > 0 {
                        remove_dir_if_present(&staging_root)?;
                        fs::create_dir_all(&staging_root).map_err(|error| {
                            format!("create runtime staging directory {staging_root:?}: {error}")
                        })?;
                        granted.set(pregrant && grant_sandbox_access(&staging_root));
                    }
                    progress(match origin {
                        PackOrigin::Resource(_) => "Reading the bundled CLIO runtime...",
                        PackOrigin::Download { .. } => {
                            "Unpacking the CLIO runtime while it downloads..."
                        }
                        PackOrigin::Url { .. } => "Downloading and unpacking the CLIO runtime...",
                    });
                    let attempt = open_pack(origin).and_then(|source| {
                        crate::runtime_unpack::unpack_runtime(
                            source,
                            &staging_root,
                            manifest.runtime_files,
                            progress,
                        )
                    });
                    match attempt {
                        Ok(report) if report.sha256 == expected_hash => return Ok(report),
                        Ok(report) => failures.push(format!(
                            "the CLIO runtime archive failed its integrity check \
                             (expected {expected_hash}, got {})",
                            report.sha256
                        )),
                        Err(error) => failures.push(error),
                    }
                    if let Some(failure) = failures.last() {
                        if index + 1 < origins.len() {
                            progress(&format!("{failure}; trying the release download instead."));
                        }
                    }
                }
                Err(failures.join("; "))
            })();
            (unpacked, stopping.join())
        });
        let report = unpacked?;
        let stop_seconds =
            stopped.map_err(|_| "stopping the managed CLIO processes panicked".to_string())?;
        progress(&format!(
            "Unpacked and hashed {} files, {} MB ({:.1}s; managed processes stopped in {stop_seconds:.1}s).",
            report.files,
            report.bytes / (1024 * 1024),
            started.elapsed().as_secs_f64()
        ));
        let files = report.files;

        progress("Checking and activating the unpacked CLIO runtime...");
        let staged_runtime = staging_root.join("gact-runtime");
        if !staged_runtime.join("runtime.json").is_file() {
            return Err("runtime archive did not contain gact-runtime/runtime.json".into());
        }
        fs::write(
            staging_root.join("pack.sha256"),
            format!("{expected_hash}\n"),
        )
        .map_err(|error| format!("write runtime installation receipt: {error}"))?;
        if granted.get() {
            // Without the marker the agent simply applies the grant itself.
            let marker = serde_json::json!({
                "schema": 1,
                "runtime": "gact-runtime",
                "users": SANDBOX_USERS,
            });
            let _ = fs::write(staging_root.join(ACCESS_MARKER), marker.to_string());
        }

        remove_dir_if_present(&previous_root)?;
        if install_root.exists() {
            installer_dir_swap::rename_with_retry(
                &install_root,
                &previous_root,
                &format!("move previous runtime {install_root:?} to {previous_root:?}"),
            )?;
        }
        if let Err(error) = installer_dir_swap::rename_with_retry(
            &staging_root,
            &install_root,
            &format!("activate prepared runtime {staging_root:?} as {install_root:?}"),
        ) {
            if previous_root.exists() {
                let _ = fs::rename(&previous_root, &install_root);
            }
            return Err(error);
        }
        // Activation has succeeded; stale backup cleanup must not turn a
        // usable runtime into a reported startup failure.
        let _ = remove_dir_if_present(&previous_root);
        progress(&format!(
            "Bundled CLIO runtime is ready ({files} files, {:.1}s).",
            started.elapsed().as_secs_f64()
        ));
        Ok(())
    })();

    if install_result.is_err() {
        let _ = fs::remove_dir_all(&staging_root);
    }
    install_result?;
    prescan_office(&runtime_dir);

    // The signed installer can restore this payload during repair and a newer
    // updater supplies a fresh one. Keeping it after a successful extraction
    // would waste roughly another 300 MiB on every user's machine.
    let _ = fs::remove_file(&archive_path);
    Ok(Some(runtime_dir))
}

/// The protected-execution sandbox users (clio-agent's `CODEX_SANDBOX_USERS`).
#[cfg(windows)]
const SANDBOX_USERS: [&str; 2] = ["CodexSandboxOffline", "CodexSandboxOnline"];
/// Tells the agent's protected-execution step that the runtime was unpacked
/// into a directory that already gave the sandbox users their access.
#[cfg(windows)]
const ACCESS_MARKER: &str = "runtime-access.json";

#[cfg(windows)]
fn icacls(args: &[&std::ffi::OsStr]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("icacls")
        .args(args)
        .stdin(std::process::Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).to_ascii_lowercase())
}

/// Whether `runtime` gives every sandbox user read access that its files
/// inherit. The agent grants it only on hosts whose protected execution runs
/// as those users, so a runtime replacing this one would receive it anyway.
#[cfg(windows)]
fn runtime_grants_sandbox_access(runtime: &Path) -> bool {
    runtime.is_dir()
        && icacls(&[runtime.as_os_str()]).is_some_and(|acl| {
            SANDBOX_USERS.iter().all(|user| {
                let user = user.to_ascii_lowercase();
                acl.contains(&format!("\\{user}:(oi)(ci)(rx)"))
                    || acl.contains(&format!("\\{user}:(i)(oi)(ci)(rx)"))
            })
        })
}

/// Grant the sandbox users inherited read access on the empty `dir`.
#[cfg(windows)]
fn grant_sandbox_access(dir: &Path) -> bool {
    use std::ffi::OsStr;
    let grants: Vec<String> = SANDBOX_USERS
        .iter()
        .map(|user| format!("{user}:(OI)(CI)(RX)"))
        .collect();
    let mut args = vec![dir.as_os_str(), OsStr::new("/grant")];
    args.extend(grants.iter().map(OsStr::new));
    args.push(OsStr::new("/Q"));
    icacls(&args).is_some()
}

/// Read the files the Office renderer loads, several at once, in the background.
///
/// Defender scans each new file again when it is first opened, so the first
/// `soffice` start after an install takes about 12 s instead of 3 s while it loads
/// 344 MB of libraries one by one. Reading them in parallel while the agent starts
/// moves that scan off the Office check. Reading runs nothing, and the process may
/// exit before it finishes.
#[cfg(windows)]
fn prescan_office(runtime_dir: &Path) {
    use std::io::Read;
    let office = runtime_dir.join("documents").join("office");
    let program = office.join("program");
    let mut files: Vec<PathBuf> = Vec::new();
    let mut walk = vec![
        office.join("share").join("registry"),
        program.join("services"),
        program.join("types"),
    ];
    if let Ok(entries) = fs::read_dir(&program) {
        for entry in entries.flatten() {
            let path = entry.path();
            let native = path.extension().and_then(|e| e.to_str()).is_some_and(|e| {
                ["dll", "exe", "bin", "com"]
                    .iter()
                    .any(|n| e.eq_ignore_ascii_case(n))
            });
            if native && entry.file_type().is_ok_and(|t| t.is_file()) {
                files.push(path);
            }
        }
    }
    while let Some(dir) = walk.pop() {
        for entry in fs::read_dir(&dir).into_iter().flatten().flatten() {
            match entry.file_type() {
                Ok(t) if t.is_dir() => walk.push(entry.path()),
                Ok(t) if t.is_file() => files.push(entry.path()),
                _ => {}
            }
        }
    }
    if files.is_empty() {
        return;
    }
    // Largest first, so the long scans start at once rather than last.
    files.sort_by_cached_key(|path| {
        std::cmp::Reverse(fs::metadata(path).map(|m| m.len()).unwrap_or(0))
    });
    let files = std::sync::Arc::new(files);
    let next = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    for _ in 0..8 {
        let (files, next) = (files.clone(), next.clone());
        let _ = std::thread::Builder::new()
            .name("office-prescan".into())
            .spawn(move || {
                let mut buffer = vec![0u8; 1 << 20];
                loop {
                    let index = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let Some(path) = files.get(index) else { break };
                    if let Ok(mut file) = fs::File::open(path) {
                        while matches!(file.read(&mut buffer), Ok(n) if n > 0) {}
                    }
                }
            });
    }
}

/// Report actual installer phases and extracted file counts to the NSIS log
/// and the timed installer record (`install_log`).
#[cfg(windows)]
pub(crate) fn prepare_runtime_for_installer(
    resource_dir: &Path,
    app_local_data_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    prepare_windows_runtime(resource_dir, app_local_data_dir, &crate::install_log::line)
}

#[cfg(windows)]
fn remove_dir_if_present(path: &Path) -> Result<(), String> {
    if path.exists() {
        installer_dir_swap::remove_dir_all_with_retry(path, &format!("remove directory {path:?}"))?;
    }
    Ok(())
}

/// Remove the large generated trees that live below a managed Windows
/// installation.
///
/// NSIS' recursive directory instruction reports and interprets every Python
/// file itself, which makes uninstall look frozen for minutes. Split the
/// bundled Python tree across a small worker set, then let NSIS remove the now
/// empty/small outer directories. All roots are derived from the executable's
/// own directory; no caller-provided deletion target is accepted.
#[cfg(windows)]
pub(crate) fn remove_managed_install_storage(resource_dir: &Path) -> Result<(), String> {
    for runtime_root in [
        resource_dir.join("gact-runtime"),
        resource_dir.join("data/bundled-runtime/gact-runtime"),
        resource_dir.join("data/bundled-runtime.installing/gact-runtime"),
        resource_dir.join("data/bundled-runtime.previous/gact-runtime"),
    ] {
        remove_runtime_tree_parallel(&runtime_root)?;
    }

    for generated_root in [
        resource_dir.join("data/bundled-runtime"),
        resource_dir.join("data/bundled-runtime.installing"),
        resource_dir.join("data/bundled-runtime.previous"),
        resource_dir.join("data/clio-user/data/cte"),
        resource_dir.join("data/clio-user/cache"),
        resource_dir.join("data/clio-agent/data/cte"),
        resource_dir.join("data/clio-agent/cache"),
        resource_dir.join("data/huggingface"),
    ] {
        remove_dir_if_present(&generated_root)?;
    }
    Ok(())
}

#[cfg(windows)]
fn remove_runtime_tree_parallel(runtime_root: &Path) -> Result<(), String> {
    if !runtime_root.exists() {
        return Ok(());
    }
    let python_root = runtime_root.join("python");
    if python_root.is_dir() {
        let entries = fs::read_dir(&python_root)
            .map_err(|error| format!("read runtime directory {python_root:?}: {error}"))?
            .map(|entry| {
                entry
                    .map(|value| value.path())
                    .map_err(|error| format!("read runtime entry in {python_root:?}: {error}"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let queue = Arc::new(Mutex::new(entries));
        let errors = Arc::new(Mutex::new(Vec::<String>::new()));
        let workers = std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(4)
            .clamp(2, 8);
        std::thread::scope(|scope| {
            for _ in 0..workers {
                let queue = Arc::clone(&queue);
                let errors = Arc::clone(&errors);
                scope.spawn(move || loop {
                    let next = queue.lock().expect("runtime deletion queue").pop();
                    let Some(path) = next else { break };
                    let result = if path.is_dir() {
                        fs::remove_dir_all(&path)
                    } else {
                        fs::remove_file(&path)
                    };
                    if let Err(error) = result {
                        errors
                            .lock()
                            .expect("runtime deletion errors")
                            .push(format!("remove runtime entry {path:?}: {error}"));
                    }
                });
            }
        });
        let errors = errors.lock().expect("runtime deletion errors");
        if !errors.is_empty() {
            return Err(errors.join("; "));
        }
    }
    remove_dir_if_present(runtime_root)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::cell::RefCell;
    use std::fs::File;
    use std::io::Write;
    use std::os::windows::fs::OpenOptionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_case(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("clio-runtime-pack-{name}-{suffix}"))
    }

    fn write_test_pack(resource_dir: &Path) -> String {
        fs::create_dir_all(resource_dir).expect("resource dir");
        let archive_path = resource_dir.join("gact-runtime.tar.zst");
        let archive_file = File::create(&archive_path).expect("archive file");
        let encoder = zstd::stream::write::Encoder::new(archive_file, 1).expect("encoder");
        let mut builder = tar::Builder::new(encoder);

        let content = br#"{"schema":1,"exec":["python/python.exe"]}
"#;
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "gact-runtime/runtime.json", content.as_slice())
            .expect("append runtime manifest");
        let encoder = builder.into_inner().expect("finish tar");
        encoder.finish().expect("finish zstd");

        let hash = format!(
            "{:x}",
            Sha256::digest(fs::read(&archive_path).expect("read pack"))
        );
        let manifest = serde_json::json!({
            "schema": 1,
            "archive": "gact-runtime.tar.zst",
            "sha256": hash,
            "runtime_files": 1,
            "runtime_bytes": content.len(),
            "archive_bytes": fs::metadata(&archive_path).expect("archive metadata").len(),
        });
        let mut file = File::create(resource_dir.join(PACK_MANIFEST_NAME)).expect("pack manifest");
        writeln!(file, "{manifest}").expect("write pack manifest");
        hash
    }

    #[test]
    fn installs_pack_atomically_and_reuses_receipted_runtime() {
        let root = temp_case("install");
        let resources = root.join("resources");
        let app_data = root.join("data");
        let hash = write_test_pack(&resources);

        let stages = RefCell::new(Vec::new());
        let progress = |message: &str| stages.borrow_mut().push(message.to_owned());
        let runtime = prepare_windows_runtime(&resources, &app_data, &progress)
            .expect("prepare runtime")
            .expect("packed runtime");
        assert_eq!(runtime, app_data.join("bundled-runtime/gact-runtime"));
        assert!(runtime.join("runtime.json").is_file());
        assert_eq!(
            fs::read_to_string(app_data.join("bundled-runtime/pack.sha256"))
                .expect("receipt")
                .trim(),
            hash
        );
        assert!(
            !resources.join("gact-runtime.tar.zst").exists(),
            "archive should be reclaimed after successful installation"
        );
        let recorded = stages.borrow();
        assert_eq!(
            recorded[0],
            "Preparing the runtime installation directory..."
        );
        assert!(recorded
            .iter()
            .any(|line| line == "Unpacking and checking the bundled CLIO runtime..."));
        assert!(recorded
            .last()
            .expect("completion")
            .starts_with("Bundled CLIO runtime is ready (1 files,"));
        drop(recorded);
        stages.borrow_mut().clear();

        let reused = prepare_windows_runtime(&resources, &app_data, &progress)
            .expect("reuse runtime")
            .expect("receipted runtime");
        assert_eq!(reused, runtime);
        assert_eq!(
            *stages.borrow(),
            ["The bundled CLIO runtime is already prepared."]
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    /// Reproduces the reported failure end to end: an existing installed
    /// runtime (`bundled-runtime`) has a file inside it held open with a
    /// share mode that denies everything — standing in for a straggling
    /// `clio_run.exe` handle `installer_runtime_stop`'s sweep did not reach —
    /// right as a second `prepare_bundled_runtime` call needs to rename that
    /// directory out of the way. Before the retry/backoff added in #I1, this
    /// failed immediately with "Access is denied. (os error 5)"; now the
    /// rename must retry until the lock clears and the reinstall succeeds.
    #[test]
    fn upgrade_survives_a_transient_lock_on_the_previously_installed_runtime() {
        let root = temp_case("upgrade-locked");
        let resources = root.join("resources");
        let app_data = root.join("data");
        write_test_pack(&resources);

        let runtime = prepare_bundled_runtime(&resources, &app_data)
            .expect("first install")
            .expect("packed runtime");

        // Force the second call down the full reinstall path (not the
        // matching-receipt short-circuit) by invalidating the receipt, then
        // regenerate the archive the first install already reclaimed.
        fs::write(app_data.join("bundled-runtime/pack.sha256"), "stale\n")
            .expect("invalidate receipt");
        write_test_pack(&resources);

        let locked_file = runtime.join("runtime.json");
        let handle = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0) // deny ALL sharing, including delete
            .open(&locked_file)
            .expect("hold the installed runtime file open");
        let release_after = std::time::Duration::from_millis(700);
        let releaser = std::thread::spawn(move || {
            std::thread::sleep(release_after);
            drop(handle);
        });

        let started = std::time::Instant::now();
        let reinstalled = prepare_bundled_runtime(&resources, &app_data)
            .expect("reinstall must survive the transient lock and eventually succeed")
            .expect("packed runtime");
        let elapsed = started.elapsed();
        releaser.join().expect("releaser thread must not panic");

        assert_eq!(reinstalled, runtime);
        assert!(
            elapsed >= release_after,
            "must not have succeeded before the lock actually cleared (elapsed {elapsed:?})"
        );
        assert!(
            elapsed < std::time::Duration::from_secs(20),
            "a lock that cleared quickly must not burn anywhere near the full retry budget \
             (elapsed {elapsed:?})"
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn lightweight_desktop_update_reuses_the_existing_managed_runtime() {
        let root = temp_case("lite-update");
        let resources = root.join("resources");
        let app_data = root.join("data");
        let runtime = app_data.join("bundled-runtime/gact-runtime");
        fs::create_dir_all(&runtime).expect("runtime directory");
        fs::create_dir_all(&resources).expect("resource directory");
        fs::write(runtime.join("runtime.json"), b"{}\n").expect("runtime manifest");

        assert_eq!(
            prepare_bundled_runtime(&resources, &app_data).expect("reuse installed runtime"),
            Some(runtime)
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_a_pack_that_fails_its_integrity_check() {
        let root = temp_case("bad-hash");
        let resources = root.join("resources");
        let app_data = root.join("data");
        write_test_pack(&resources);
        let manifest_path = resources.join(PACK_MANIFEST_NAME);
        let mut manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest_path).expect("read manifest"))
                .expect("parse manifest");
        manifest["sha256"] = serde_json::Value::String("0".repeat(64));
        fs::write(&manifest_path, format!("{manifest}\n")).expect("replace manifest");

        let stages = RefCell::new(Vec::new());
        let error = prepare_windows_runtime(&resources, &app_data, &|message| {
            stages.borrow_mut().push(message.to_owned());
        })
        .expect_err("hash must fail");
        assert!(error.contains("failed its integrity check"), "{error}");
        assert_eq!(
            stages.borrow()[..2],
            [
                "Preparing the runtime installation directory...",
                "Unpacking and checking the bundled CLIO runtime..."
            ]
        );
        assert!(!app_data.join("bundled-runtime").exists());
        assert!(!app_data.join("bundled-runtime.installing").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn unpacks_and_hashes_runtime_pack_on_a_small_windows_helper_stack() {
        // The installer helper's main thread has a 1 MiB stack: no bulk buffer
        // in the single read-and-hash pass may live on it.
        let root = temp_case("small-stack-hash");
        let resources = root.join("resources");
        let hash = write_test_pack(&resources);
        let staging = root.join("staging");
        fs::create_dir_all(&staging).expect("staging directory");

        let archive_path = resources.join("gact-runtime.tar.zst");
        let report = std::thread::Builder::new()
            .name("installer-helper-stack".into())
            .stack_size(256 * 1024)
            .spawn(move || {
                crate::runtime_unpack::unpack_runtime(
                    crate::runtime_unpack::PackSource::File(archive_path),
                    &staging,
                    Some(1),
                    &|_| {},
                )
            })
            .expect("small-stack thread")
            .join()
            .expect("unpack thread must not overflow")
            .expect("unpack archive");

        assert_eq!(report.sha256, hash);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn removes_generated_runtime_and_cte_storage() {
        let root = temp_case("remove");
        for path in [
            root.join("data/bundled-runtime/gact-runtime/python/Lib/site-packages/demo.py"),
            root.join("data/bundled-runtime/gact-runtime/bin/clio-agent.exe"),
            root.join("data/clio-user/data/cte/run/state.json"),
            root.join("data/huggingface/hub/model.bin"),
        ] {
            fs::create_dir_all(path.parent().expect("test path parent")).expect("test directory");
            fs::write(path, b"test").expect("test file");
        }

        remove_managed_install_storage(&root).expect("remove generated storage");
        assert!(!root.join("data/bundled-runtime").exists());
        assert!(!root.join("data/clio-user/data/cte").exists());
        assert!(!root.join("data/huggingface").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }
}

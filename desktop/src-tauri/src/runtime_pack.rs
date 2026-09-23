//! Installation of the compressed runtime shipped by bundled Windows builds.
//!
//! NSIS is deliberately not asked to expand the Python distribution one file
//! at a time. It copies one archive and one manifest; the desktop then expands
//! the archive into its writable app-data directory on a worker thread before
//! starting the managed backend.

use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::{
    fs::{self, File},
    io::{BufReader, Read},
    sync::{Arc, Mutex},
};

#[cfg(windows)]
use serde::Deserialize;
#[cfg(windows)]
use sha2::{Digest, Sha256};

use crate::sidecar_setup::bundled_runtime_dir;

const PACK_MANIFEST_NAME: &str = "gact-runtime.pack.json";

#[cfg(windows)]
#[derive(Debug, Deserialize)]
struct RuntimePackManifest {
    schema: u8,
    archive: String,
    sha256: String,
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
        return prepare_windows_runtime(resource_dir, app_local_data_dir);
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
        return Ok(Some(runtime_dir));
    }

    let archive_path = resource_dir.join(&manifest.archive);
    if !archive_path.is_file() {
        return Err(format!(
            "the bundled runtime is incomplete: {:?} is missing",
            archive_path
        ));
    }
    let actual_hash = sha256_file(&archive_path)?;
    if actual_hash != expected_hash {
        return Err(format!(
            "the bundled runtime archive failed its integrity check (expected {expected_hash}, got {actual_hash})"
        ));
    }

    // The app is single-instance, so stable names are sufficient and let a
    // later launch or the uninstaller clean a directory left by a power loss.
    let staging_root = app_local_data_dir.join("bundled-runtime.installing");
    let previous_root = app_local_data_dir.join("bundled-runtime.previous");
    remove_dir_if_present(&staging_root)?;
    remove_dir_if_present(&previous_root)?;
    fs::create_dir_all(&staging_root)
        .map_err(|error| format!("create runtime staging directory {staging_root:?}: {error}"))?;

    let install_result = (|| -> Result<(), String> {
        let archive_file = File::open(&archive_path)
            .map_err(|error| format!("open runtime archive {archive_path:?}: {error}"))?;
        let decoder = zstd::stream::read::Decoder::new(BufReader::new(archive_file))
            .map_err(|error| format!("open compressed runtime archive: {error}"))?;
        let mut archive = tar::Archive::new(decoder);
        let entries = archive
            .entries()
            .map_err(|error| format!("read runtime archive entries: {error}"))?;
        for entry in entries {
            let mut entry =
                entry.map_err(|error| format!("read runtime archive entry: {error}"))?;
            let path = entry
                .path()
                .map_err(|error| format!("read runtime archive path: {error}"))?
                .into_owned();
            let unpacked = entry
                .unpack_in(&staging_root)
                .map_err(|error| format!("extract runtime entry {path:?}: {error}"))?;
            if !unpacked {
                return Err(format!(
                    "runtime archive entry {path:?} attempted to leave its staging directory"
                ));
            }
        }

        let staged_runtime = staging_root.join("gact-runtime");
        if !staged_runtime.join("runtime.json").is_file() {
            return Err("runtime archive did not contain gact-runtime/runtime.json".into());
        }
        fs::write(
            staging_root.join("pack.sha256"),
            format!("{expected_hash}\n"),
        )
        .map_err(|error| format!("write runtime installation receipt: {error}"))?;

        if install_root.exists() {
            fs::rename(&install_root, &previous_root).map_err(|error| {
                format!("move previous runtime {install_root:?} to {previous_root:?}: {error}")
            })?;
        }
        if let Err(error) = fs::rename(&staging_root, &install_root) {
            if previous_root.exists() {
                let _ = fs::rename(&previous_root, &install_root);
            }
            return Err(format!(
                "activate prepared runtime {staging_root:?} as {install_root:?}: {error}"
            ));
        }
        // Activation has succeeded; stale backup cleanup must not turn a
        // usable runtime into a reported startup failure.
        let _ = remove_dir_if_present(&previous_root);
        Ok(())
    })();

    if install_result.is_err() {
        let _ = fs::remove_dir_all(&staging_root);
    }
    install_result?;

    // The signed installer can restore this payload during repair and a newer
    // updater supplies a fresh one. Keeping it after a successful extraction
    // would waste roughly another 300 MiB on every user's machine.
    let _ = fs::remove_file(&archive_path);
    Ok(Some(runtime_dir))
}

#[cfg(windows)]
fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|error| format!("open {path:?} for hashing: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    // Keep the bulk I/O buffer off the Windows process main-thread stack.
    // The native installer invokes this code through a small helper mode and
    // Windows gives that thread a 1 MiB stack by default; a 1 MiB local array
    // overflowed before extraction could even create its staging directory.
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("hash runtime archive {path:?}: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(windows)]
fn remove_dir_if_present(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| format!("remove directory {path:?}: {error}"))?;
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
    use std::io::Write;
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

        let hash = sha256_file(&archive_path).expect("hash pack");
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

        let runtime = prepare_bundled_runtime(&resources, &app_data)
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

        let reused = prepare_bundled_runtime(&resources, &app_data)
            .expect("reuse runtime")
            .expect("receipted runtime");
        assert_eq!(reused, runtime);
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

        let error = prepare_bundled_runtime(&resources, &app_data).expect_err("hash must fail");
        assert!(error.contains("failed its integrity check"), "{error}");
        assert!(!app_data.join("bundled-runtime").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn hashes_runtime_pack_on_a_small_windows_helper_stack() {
        let root = temp_case("small-stack-hash");
        fs::create_dir_all(&root).expect("test directory");
        let archive_path = root.join("runtime.pack");
        fs::write(&archive_path, vec![0x5a_u8; 2 * 1024 * 1024]).expect("test archive");

        let hash_path = archive_path.clone();
        let hash = std::thread::Builder::new()
            .name("installer-helper-stack".into())
            .stack_size(256 * 1024)
            .spawn(move || sha256_file(&hash_path))
            .expect("small-stack thread")
            .join()
            .expect("hash thread must not overflow")
            .expect("hash archive");

        assert_eq!(hash.len(), 64);
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

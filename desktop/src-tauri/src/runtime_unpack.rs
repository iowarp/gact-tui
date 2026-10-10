//! Bounded extraction of Windows runtime packs into a new staging directory.
//!
//! Packs contain only ordinary files and directories. One reader decompresses
//! the stream while a bounded worker pool creates files. Small entries use
//! bounded queues; large entries stream directly, never becoming a large Vec.
//! Build timestamps and Unix modes have no runtime meaning on Windows: Python
//! startup bytecode uses checked hashes, and executable extensions select apps.

use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, BufReader, Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

const WRITERS: usize = 8;
const BUFFER_LIMIT: u64 = 1024 * 1024;

#[cfg(test)]
#[path = "runtime_unpack_tests.rs"]
mod tests;

struct PendingFile {
    path: PathBuf,
    contents: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct UnpackReport {
    pub files: u64,
    pub bytes: u64,
}

/// Extract a verified Windows pack. The staging directory must be newly made
/// and empty; the caller owns cleanup and activation after this succeeds.
pub(crate) fn unpack_runtime(
    archive_path: &Path,
    staging: &Path,
    expected_files: Option<u64>,
    progress: &dyn Fn(&str),
) -> Result<UnpackReport, String> {
    unpack_runtime_with_workers(archive_path, staging, expected_files, progress, WRITERS)
}

pub(crate) fn unpack_runtime_with_workers(
    archive_path: &Path,
    staging: &Path,
    expected_files: Option<u64>,
    progress: &dyn Fn(&str),
    workers: usize,
) -> Result<UnpackReport, String> {
    if !(1..=32).contains(&workers) {
        return Err("runtime extraction needs between 1 and 32 workers".into());
    }
    if fs::read_dir(staging)
        .map_err(|error| format!("read runtime staging directory: {error}"))?
        .next()
        .is_some()
    {
        return Err("runtime extraction requires an empty staging directory".into());
    }
    let file = File::open(archive_path)
        .map_err(|error| format!("open runtime archive {archive_path:?}: {error}"))?;
    let decoder = zstd::stream::read::Decoder::new(BufReader::new(file))
        .map_err(|error| format!("open compressed runtime archive: {error}"))?;
    let mut archive = tar::Archive::new(decoder);
    let completed = AtomicU64::new(0);
    thread::scope(|scope| {
        let (sender, receiver) = mpsc::sync_channel::<PendingFile>(workers * 2);
        let receiver = Arc::new(Mutex::new(receiver));
        let mut writers = Vec::new();
        for index in 0..workers {
            // Dynamic dispatch avoids waiting on one busy writer while others idle.
            // Queued + active + reader buffers are bounded by (3 * workers + 1) MiB.
            let receiver = Arc::clone(&receiver);
            let completed = &completed;
            writers.push(
                thread::Builder::new()
                    .name(format!("runtime-writer-{index}"))
                    .spawn_scoped(scope, move || -> Result<(), String> {
                        loop {
                            let pending = receiver
                                .lock()
                                .map_err(|_| "runtime work queue lock poisoned".to_owned())?
                                .recv();
                            let Ok(pending) = pending else { break };
                            write_file(&pending.path, &pending.contents)?;
                            completed.fetch_add(1, Ordering::Relaxed);
                        }
                        Ok(())
                    })
                    .map_err(|error| format!("start runtime file writer: {error}"))?,
            );
        }
        // Only workers retain the receiver, so failed writers disconnect the sender.
        drop(receiver);

        let result = (|| {
            let mut directories = HashSet::from([staging.to_path_buf()]);
            let mut files = 0_u64;
            let mut bytes = 0_u64;
            let mut last_progress = Instant::now();
            for entry in archive
                .entries()
                .map_err(|e| format!("read runtime archive: {e}"))?
            {
                let mut entry = entry.map_err(|e| format!("read runtime entry: {e}"))?;
                let relative = entry
                    .path()
                    .map_err(|e| format!("read runtime path: {e}"))?
                    .into_owned();
                let destination = checked_destination(staging, &relative)?;
                let kind = entry.header().entry_type();
                if kind.is_dir() {
                    make_directory(&destination, &mut directories)?;
                    continue;
                }
                if !kind.is_file() {
                    return Err(format!(
                        "runtime pack contains a link or special entry: {relative:?}"
                    ));
                }
                make_directory(
                    destination.parent().ok_or("runtime file has no parent")?,
                    &mut directories,
                )?;
                let size = entry.size();
                if size <= BUFFER_LIMIT {
                    let mut contents = Vec::with_capacity(size as usize);
                    entry
                        .read_to_end(&mut contents)
                        .map_err(|e| format!("read runtime file {relative:?}: {e}"))?;
                    if contents.len() as u64 != size {
                        return Err(format!("runtime file {relative:?} is truncated"));
                    }
                    sender
                        .send(PendingFile {
                            path: destination,
                            contents,
                        })
                        .map_err(|_| {
                            "runtime file writer stopped before extraction completed".to_owned()
                        })?;
                } else {
                    let mut output = create_file(&destination)?;
                    let copied = io::copy(&mut entry, &mut output)
                        .map_err(|e| format!("extract runtime file {relative:?}: {e}"))?;
                    if copied != size {
                        return Err(format!("runtime file {relative:?} is truncated"));
                    }
                    completed.fetch_add(1, Ordering::Relaxed);
                }
                files += 1;
                bytes += size;
                if last_progress.elapsed() >= Duration::from_secs(3) {
                    let done = completed.load(Ordering::Relaxed);
                    progress(&match expected_files {
                        Some(total) => {
                            format!("Unpacking CLIO runtime: {done} of {total} files...")
                        }
                        None => format!("Unpacking CLIO runtime: {done} files..."),
                    });
                    last_progress = Instant::now();
                }
            }
            if expected_files.is_some_and(|expected| expected != files) {
                return Err(format!(
                    "runtime pack file count mismatch: expected {expected_files:?}, read {files}"
                ));
            }
            Ok(UnpackReport { files, bytes })
        })();
        // Always close and join ALL writers, including on a malformed archive
        // or I/O error, before the caller can remove the staging directory.
        drop(sender);
        let mut writer_error = None;
        for writer in writers {
            match writer.join() {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    writer_error.get_or_insert(error);
                }
                Err(_) => {
                    writer_error.get_or_insert("runtime file writer panicked".into());
                }
            }
        }
        if let Some(error) = writer_error {
            return Err(error);
        }
        result
    })
}

fn checked_destination(staging: &Path, relative: &Path) -> Result<PathBuf, String> {
    let mut destination = staging.to_path_buf();
    let mut components = relative.components().peekable();
    if components.peek() != Some(&Component::Normal("gact-runtime".as_ref())) {
        return Err(format!(
            "runtime entry is outside gact-runtime: {relative:?}"
        ));
    }
    for component in components {
        let Component::Normal(name) = component else {
            return Err(format!("invalid runtime archive path: {relative:?}"));
        };
        let text = name.to_string_lossy();
        let stem = text.split('.').next().unwrap_or("").to_ascii_uppercase();
        if text.contains([':', '\\'])
            || text.ends_with(['.', ' '])
            || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        {
            return Err(format!(
                "invalid Windows runtime archive path: {relative:?}"
            ));
        }
        destination.push(name);
    }
    Ok(destination)
}

fn make_directory(directory: &Path, created: &mut HashSet<PathBuf>) -> Result<(), String> {
    if created.contains(directory) {
        return Ok(());
    }
    let parent = directory
        .parent()
        .ok_or("runtime directory has no parent")?;
    make_directory(parent, created)?;
    fs::create_dir(directory)
        .map_err(|e| format!("create runtime directory {directory:?}: {e}"))?;
    created.insert(directory.to_path_buf());
    Ok(())
}

fn create_file(path: &Path) -> Result<File, String> {
    // create_new also rejects duplicate/case-alias entries and avoids following
    // an existing link. No archive entry can create a link in the staging tree.
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| format!("create runtime file {path:?}: {e}"))
}

fn write_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    create_file(path)?
        .write_all(contents)
        .map_err(|e| format!("write runtime file {path:?}: {e}"))
}

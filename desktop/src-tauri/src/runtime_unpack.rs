//! Bounded extraction of Windows runtime packs into a new staging directory.
//!
//! The archive is read once: its SHA-256 is computed from the bytes the
//! decompressor reads, so checking the pack costs no second pass over it. The
//! caller compares that hash before activating anything it extracted.
//!
//! Packs contain only ordinary files and directories. On Windows this process
//! decompresses and checks every entry while the inbox `tar.exe` creates the
//! files (see `system_tar`). Otherwise, or when `CLIO_RUNTIME_UNPACK=builtin`,
//! one reader decompresses the stream while a bounded worker pool creates
//! files. Small entries use
//! bounded queues; large entries stream directly, never becoming a large Vec.
//! Build timestamps and Unix modes have no runtime meaning on Windows: Python
//! startup bytecode uses checked hashes, and executable extensions select apps.

use sha2::{Digest, Sha256};
use std::{
    cell::{Cell, RefCell},
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    rc::Rc,
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
    /// SHA-256 of the whole archive file, lowercase hex.
    pub sha256: String,
}

/// Hashes every byte the decompressor reads from the archive file.
struct HashingReader {
    inner: File,
    hasher: Rc<RefCell<Sha256>>,
    consumed: Rc<Cell<u64>>,
}

impl Read for HashingReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let read = self.inner.read(buf)?;
        self.hasher.borrow_mut().update(&buf[..read]);
        self.consumed.set(self.consumed.get() + read as u64);
        Ok(read)
    }
}

/// Hash what the decompressor left unread (the tar and zstd trailers).
fn finish_hash(path: &Path, hasher: &RefCell<Sha256>, consumed: u64) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("reopen runtime archive {path:?}: {e}"))?;
    file.seek(SeekFrom::Start(consumed))
        .map_err(|e| format!("seek runtime archive {path:?}: {e}"))?;
    let mut hasher = hasher.borrow().clone();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("hash runtime archive {path:?}: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Extract a verified Windows pack. The staging directory must be newly made
/// and empty; the caller owns cleanup and activation after this succeeds.
pub(crate) fn unpack_runtime(
    archive_path: &Path,
    staging: &Path,
    expected_files: Option<u64>,
    progress: &dyn Fn(&str),
) -> Result<UnpackReport, String> {
    #[cfg(windows)]
    if let Some(tar) = system_tar() {
        return unpack_runtime_with_system_tar(
            &tar,
            archive_path,
            staging,
            expected_files,
            progress,
        );
    }
    unpack_runtime_with_workers(archive_path, staging, expected_files, progress, WRITERS)
}

/// The inbox Windows bsdtar. Real-time antivirus scans every new file; files
/// created by this Microsoft-signed process are scanned about 3.5x faster than
/// the same files created by the (unsigned) desktop binary itself, so it does
/// the writing while this process still hashes and checks every entry.
#[cfg(windows)]
fn system_tar() -> Option<PathBuf> {
    if std::env::var_os("CLIO_RUNTIME_UNPACK").is_some_and(|value| value == "builtin") {
        return None;
    }
    let tar = PathBuf::from(std::env::var_os("SystemRoot")?)
        .join("System32")
        .join("tar.exe");
    tar.is_file().then_some(tar)
}

/// Passes every byte the tar reader consumes on to the extracting process.
#[cfg(windows)]
struct TeeReader<R: Read, W: Write> {
    inner: R,
    sink: W,
}

#[cfg(windows)]
impl<R: Read, W: Write> Read for TeeReader<R, W> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let read = self.inner.read(buf)?;
        self.sink.write_all(&buf[..read])?;
        Ok(read)
    }
}

/// Decompress and check the pack here, and stream the checked tar bytes to
/// `tar.exe` which creates the files. Entry checks match the built-in writer:
/// only plain files and directories under `gact-runtime/` with valid Windows
/// names, no duplicates, and the manifest's file count. bsdtar additionally
/// refuses absolute and `..` paths on its own. As with the built-in writer,
/// the caller compares the hash before activating, and removes the staging
/// directory on any error.
#[cfg(windows)]
fn unpack_runtime_with_system_tar(
    tar_exe: &Path,
    archive_path: &Path,
    staging: &Path,
    expected_files: Option<u64>,
    progress: &dyn Fn(&str),
) -> Result<UnpackReport, String> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    if fs::read_dir(staging)
        .map_err(|error| format!("read runtime staging directory: {error}"))?
        .next()
        .is_some()
    {
        return Err("runtime extraction requires an empty staging directory".into());
    }
    let file = File::open(archive_path)
        .map_err(|error| format!("open runtime archive {archive_path:?}: {error}"))?;
    let archive_bytes = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let hasher = Rc::new(RefCell::new(Sha256::new()));
    let consumed = Rc::new(Cell::new(0_u64));
    let reader = HashingReader {
        inner: file,
        hasher: Rc::clone(&hasher),
        consumed: Rc::clone(&consumed),
    };
    let decoder = zstd::stream::read::Decoder::new(reader)
        .map_err(|error| format!("open compressed runtime archive: {error}"))?;

    // -m: modification times have no runtime meaning (see the module notes).
    let mut child = Command::new(tar_exe)
        .args(["-x", "-m", "-f", "-", "-C"])
        .arg(staging)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| format!("start {tar_exe:?}: {error}"))?;
    let stdin = child.stdin.take().ok_or("tar.exe has no input pipe")?;
    let mut stderr = child.stderr.take().ok_or("tar.exe has no error pipe")?;
    let stderr_reader = thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });

    let mut archive = tar::Archive::new(TeeReader {
        inner: decoder,
        sink: io::BufWriter::with_capacity(1024 * 1024, stdin),
    });
    let scanned = (|| -> Result<(u64, u64), String> {
        let mut seen = HashSet::new();
        let mut files = 0_u64;
        let mut bytes = 0_u64;
        let mut last_progress = Instant::now();
        for entry in archive
            .entries()
            .map_err(|e| format!("read runtime archive: {e}"))?
        {
            let entry = entry.map_err(|e| format!("read runtime entry: {e}"))?;
            let relative = entry
                .path()
                .map_err(|e| format!("read runtime path: {e}"))?
                .into_owned();
            checked_destination(staging, &relative)?;
            let kind = entry.header().entry_type();
            if kind.is_dir() {
                continue;
            }
            if !kind.is_file() {
                return Err(format!(
                    "runtime pack contains a link or special entry: {relative:?}"
                ));
            }
            if !seen.insert(relative.to_string_lossy().to_lowercase()) {
                return Err(format!("runtime pack repeats the file {relative:?}"));
            }
            files += 1;
            bytes += entry.size();
            if last_progress.elapsed() >= Duration::from_secs(3) {
                let read_mb = consumed.get() / (1024 * 1024);
                let total_mb = archive_bytes / (1024 * 1024);
                progress(&match expected_files {
                    Some(total) => format!(
                        "Unpacking and checking CLIO runtime: {files} of {total} files, \
                         {read_mb} of {total_mb} MB read..."
                    ),
                    None => format!(
                        "Unpacking and checking CLIO runtime: {files} files, \
                         {read_mb} of {total_mb} MB read..."
                    ),
                });
                last_progress = Instant::now();
            }
        }
        if expected_files.is_some_and(|expected| expected != files) {
            return Err(format!(
                "runtime pack file count mismatch: expected {expected_files:?}, read {files}"
            ));
        }
        Ok((files, bytes))
    })();
    let mut tee = archive.into_inner();
    // Forward the end-of-archive blocks, then close tar.exe's input.
    let forwarded = scanned.and_then(|counts| {
        io::copy(&mut tee, &mut io::sink())
            .and_then(|_| tee.sink.flush())
            .map(|_| counts)
            .map_err(|e| format!("send runtime archive to tar.exe: {e}"))
    });
    drop(tee);
    if forwarded.is_err() {
        let _ = child.kill();
    }
    let status = child
        .wait()
        .map_err(|error| format!("wait for tar.exe: {error}"))?;
    let tar_errors = stderr_reader.join().unwrap_or_default();
    let (files, bytes) = forwarded.map_err(|error| match tar_errors.trim() {
        "" => error,
        detail => format!("{error} ({detail})"),
    })?;
    if !status.success() {
        return Err(format!(
            "tar.exe failed to unpack the runtime ({status}): {}",
            tar_errors.trim()
        ));
    }
    let sha256 = finish_hash(archive_path, &hasher, consumed.get())?;
    Ok(UnpackReport {
        files,
        bytes,
        sha256,
    })
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
    let archive_bytes = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let hasher = Rc::new(RefCell::new(Sha256::new()));
    let consumed = Rc::new(Cell::new(0_u64));
    let reader = HashingReader {
        inner: file,
        hasher: Rc::clone(&hasher),
        consumed: Rc::clone(&consumed),
    };
    // Decoder::new adds its own buffer, below which every read is hashed.
    let decoder = zstd::stream::read::Decoder::new(reader)
        .map_err(|error| format!("open compressed runtime archive: {error}"))?;
    let mut archive = tar::Archive::new(decoder);
    let completed = AtomicU64::new(0);
    let (files, bytes) = thread::scope(|scope| {
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
                    let read_mb = consumed.get() / (1024 * 1024);
                    let total_mb = archive_bytes / (1024 * 1024);
                    progress(&match expected_files {
                        Some(total) => format!(
                            "Unpacking and checking CLIO runtime: {done} of {total} files, \
                             {read_mb} of {total_mb} MB read..."
                        ),
                        None => format!(
                            "Unpacking and checking CLIO runtime: {done} files, \
                             {read_mb} of {total_mb} MB read..."
                        ),
                    });
                    last_progress = Instant::now();
                }
            }
            if expected_files.is_some_and(|expected| expected != files) {
                return Err(format!(
                    "runtime pack file count mismatch: expected {expected_files:?}, read {files}"
                ));
            }
            Ok((files, bytes))
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
    })?;
    drop(archive);
    let sha256 = finish_hash(archive_path, &hasher, consumed.get())?;
    Ok(UnpackReport {
        files,
        bytes,
        sha256,
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

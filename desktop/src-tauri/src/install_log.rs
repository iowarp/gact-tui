//! The `--prepare-runtime` progress record, on every OS.
//!
//! Each line goes to stdout, as before, and is also appended, prefixed with
//! the seconds since the step started, to:
//!
//! - the file named by `CLIO_INSTALL_LOG`, which the install scripts set so an
//!   unattended install (Windows NSIS `/S` shows no output at all) can show
//!   and time the step live;
//! - on Windows, `data/runtime-install.log` below the install folder, so a
//!   timed installation can be read back after the setup has closed.
//!
//! Before [`start`] runs (an ordinary launch) a line only goes to stdout.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

struct Sink {
    started: Instant,
    files: Vec<File>,
}

static SINK: OnceLock<Mutex<Sink>> = OnceLock::new();

/// Begin the record. `saved` is truncated: it holds only the latest run.
pub(crate) fn start(saved: Option<&Path>) {
    let mut files = Vec::new();
    if let Some(path) = saved {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(file) = File::create(path) {
            files.push(file);
        }
    }
    if let Some(path) = std::env::var_os("CLIO_INSTALL_LOG").filter(|path| !path.is_empty()) {
        if let Ok(file) = OpenOptions::new().create(true).append(true).open(path) {
            files.push(file);
        }
    }
    let _ = SINK.set(Mutex::new(Sink {
        started: Instant::now(),
        files,
    }));
}

/// Print a progress line and record it.
pub(crate) fn line(message: &str) {
    println!("{message}");
    record(message);
}

/// Record a line without printing it (the child's stderr, kept for timing).
pub(crate) fn record(message: &str) {
    let Some(sink) = SINK.get() else { return };
    let Ok(mut sink) = sink.lock() else { return };
    let stamped = format!("{:7.2} {message}\n", sink.started.elapsed().as_secs_f64());
    for file in sink.files.iter_mut() {
        let _ = file.write_all(stamped.as_bytes());
        let _ = file.flush();
    }
}

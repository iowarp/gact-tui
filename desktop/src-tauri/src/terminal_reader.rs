//! Blocking PTY read loop shared by every embedded terminal.
//!
//! Mirrors `sse_stream.rs`'s shape: generic over the sink so the loop is
//! testable with an in-memory `Read` instead of a real pty, and production
//! passes a closure that forwards to a Tauri event emit. This loop ONLY
//! reads and hands off data — it has no opinion on why the read ended
//! (EOF, error, or `stop`) and never decides the child's exit code or
//! whether an exit event should fire. On Windows, ConPTY keeps the output
//! pipe open until `ClosePseudoConsole` runs, so a shell that exits on its
//! own does NOT make this loop's `read` return — that detection is the
//! waiter thread's job (`terminal_pty.rs`), which watches `child.wait()`
//! (the real process, not the pipe) and drops the pty's master to unblock
//! this loop once the child is confirmed dead.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};

/// One chunk read from a pty's output.
pub(crate) struct TerminalChunk {
    pub bytes: Vec<u8>,
}

/// Reason a read chunk was dropped instead of reaching its consumer — always
/// logged with this typed reason rather than silently discarded (the
/// no-silent-fallback rule: a degraded/aborted path must say why).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum TerminalDropReason {
    /// `terminal_close` (or app shutdown) already tore this terminal down;
    /// the frontend explicitly asked to stop listening, so the chunk that
    /// raced the close is dropped rather than emitted into a closed session.
    ConsumerClosed,
}

/// Read from `reader` until EOF, a transport error, or `stop` is set,
/// handing each chunk to `emit`.
///
/// On the Rust side, the loop never issues another `read` until the
/// current chunk has been handed to `emit` — so at most one chunk is ever
/// "in flight" between a `read` and its hand-off here. That is NOT a
/// backpressure guarantee end to end: in production `emit` posts a Tauri
/// event (`AppHandle::emit`), which returns once the event is queued for
/// the webview, not once the frontend has actually processed it, and
/// Tauri's IPC channel can still buffer faster than the renderer drains
/// it. This bound only prevents the PTY-READ SIDE from racing ahead of
/// itself; it says nothing about frontend consumption.
///
/// `on_drop` is called (instead of `emit`) for a chunk read after `stop`
/// was already flipped, so the caller can log the typed reason — see
/// [`TerminalDropReason`] — instead of the chunk vanishing silently.
pub(crate) fn run_terminal_reader<R, E, D>(
    id: &str,
    mut reader: R,
    stop: &AtomicBool,
    mut emit: E,
    mut on_drop: D,
) where
    R: Read,
    E: FnMut(TerminalChunk),
    D: FnMut(&str, TerminalDropReason, usize),
{
    let mut buf = [0u8; 8192];
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        match reader.read(&mut buf) {
            Ok(0) => break, // EOF — the pty's master side was closed (see module docs).
            Ok(n) => {
                if stop.load(Ordering::Relaxed) {
                    on_drop(id, TerminalDropReason::ConsumerClosed, n);
                    break;
                }
                emit(TerminalChunk {
                    bytes: buf[..n].to_vec(),
                });
            }
            Err(_) => break, // Transport error: nothing more to read reliably.
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn emits_every_chunk_until_eof() {
        let data = b"hello pty".to_vec();
        let reader = Cursor::new(data.clone());
        let stop = AtomicBool::new(false);
        let mut collected = Vec::new();

        run_terminal_reader(
            "1",
            reader,
            &stop,
            |chunk| collected.extend_from_slice(&chunk.bytes),
            |_, _, _| panic!("no drop expected"),
        );

        assert_eq!(collected, data);
    }

    #[test]
    fn stops_immediately_when_stop_is_already_set() {
        let reader = Cursor::new(b"never read".to_vec());
        let stop = AtomicBool::new(true);
        let mut emitted = false;

        run_terminal_reader("2", reader, &stop, |_| emitted = true, |_, _, _| {});

        assert!(!emitted, "a pre-stopped reader must emit nothing");
    }

    /// A `Read` impl that flips `stop` the instant the FIRST chunk is
    /// consumed, simulating `terminal_close` racing a read that already
    /// returned data — the second chunk must be dropped with a typed
    /// reason, not emitted.
    struct RaceStopAfterFirstRead<'a> {
        chunks: std::vec::IntoIter<&'static [u8]>,
        stop: &'a AtomicBool,
    }

    impl Read for RaceStopAfterFirstRead<'_> {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            match self.chunks.next() {
                Some(chunk) => {
                    buf[..chunk.len()].copy_from_slice(chunk);
                    if chunk == b"second" {
                        // Flip the flag as part of producing this very
                        // chunk, simulating `terminal_close` racing in
                        // between the two reads: the loop's post-read check
                        // (AFTER `read` returns, BEFORE `emit`) is what must
                        // catch it and drop this chunk instead of the one
                        // already emitted.
                        self.stop.store(true, Ordering::Relaxed);
                    }
                    Ok(chunk.len())
                }
                None => Ok(0),
            }
        }
    }

    #[test]
    fn drops_a_chunk_read_after_stop_flips_with_a_typed_reason() {
        let stop = AtomicBool::new(false);
        let reader = RaceStopAfterFirstRead {
            chunks: vec![b"first".as_slice(), b"second".as_slice()].into_iter(),
            stop: &stop,
        };
        let mut emitted = Vec::new();
        let mut drops = Vec::new();

        run_terminal_reader(
            "7",
            reader,
            &stop,
            |chunk| emitted.push(chunk.bytes),
            |id, reason, len| drops.push((id.to_string(), reason, len)),
        );

        assert_eq!(emitted, vec![b"first".to_vec()]);
        assert_eq!(
            drops,
            vec![("7".to_string(), TerminalDropReason::ConsumerClosed, 6)]
        );
    }
}

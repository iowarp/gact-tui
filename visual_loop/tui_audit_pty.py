"""PTY process helpers for deterministic TUI audit captures."""

from __future__ import annotations

import errno
import os
import pathlib
import pty
import re
import select
import signal
import subprocess
import threading
import time


def strip_ansi(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", text)
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"\x1b[()][A-Za-z0-9]", "", text)
    return text


def terminate_process(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except Exception:
        proc.terminate()
    try:
        proc.wait(timeout=8)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        proc.kill()
    proc.wait(timeout=8)


class PtyDriver:
    def __init__(
        self,
        argv: list[str],
        env: dict[str, str],
        rows: int,
        cols: int,
        raw_path: pathlib.Path | None = None,
        *,
        cwd: pathlib.Path | None = None,
    ) -> None:
        self.raw_path = raw_path
        self.lock = threading.Lock()
        self.stop_drain = threading.Event()
        self.drain_thread: threading.Thread | None = None
        self.master, slave = pty.openpty()
        try:
            import fcntl
            import struct
            import termios

            size = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, size)
        except Exception:
            pass
        self.proc = subprocess.Popen(
            argv,
            cwd=cwd,
            stdin=slave,
            stdout=slave,
            stderr=slave,
            env=env,
            close_fds=True,
            start_new_session=True,
        )
        os.close(slave)
        self.buffer = bytearray()

    def read_available(self, timeout: float = 0.05) -> bytes:
        with self.lock:
            return self._read_available_locked(timeout)

    def _read_available_locked(self, timeout: float = 0.05) -> bytes:
        chunks: list[bytes] = []
        while True:
            r, _, _ = select.select([self.master], [], [], timeout)
            if not r:
                break
            try:
                chunk = os.read(self.master, 65536)
            except OSError as exc:
                if exc.errno == errno.EIO:
                    break
                raise
            if not chunk:
                break
            chunks.append(chunk)
            self.buffer.extend(chunk)
            if self.raw_path is not None:
                with self.raw_path.open("ab") as fh:
                    fh.write(chunk)
            timeout = 0
        return b"".join(chunks)

    def start_background_drain(self) -> None:
        if self.drain_thread is not None:
            return

        def drain() -> None:
            while not self.stop_drain.is_set() and self.proc.poll() is None:
                try:
                    self.read_available(0.05)
                except OSError:
                    break

        self.drain_thread = threading.Thread(target=drain, daemon=True)
        self.drain_thread.start()

    def text(self) -> str:
        with self.lock:
            return strip_ansi(bytes(self.buffer))

    def wait_screen(self, pattern: str, timeout_s: float) -> bool:
        deadline = time.time() + timeout_s
        regex = re.compile(pattern, re.IGNORECASE)
        while time.time() < deadline and self.proc.poll() is None:
            self.read_available(0.2)
            if regex.search(self.text()):
                return True
        return False

    def type_text(self, text: str) -> None:
        os.write(self.master, text.encode("utf-8"))

    def send(self, data: bytes) -> None:
        os.write(self.master, data)

    def write_bytes(self, data: bytes) -> None:
        os.write(self.master, data)

    def enter(self) -> None:
        os.write(self.master, b"\r")

    def key(self, text: str, delay: float = 0.12) -> None:
        self.send(text.encode("utf-8"))
        time.sleep(delay)
        self.read_available()

    def ctrl_c(self, delay: float = 0.18) -> None:
        self.send(b"\x03")
        time.sleep(delay)
        self.read_available()

    def escape(self, delay: float = 0.14) -> None:
        self.send(b"\x1b")
        time.sleep(delay)
        self.read_available()

    def click(self, x: int, y: int, delay: float = 0.16) -> None:
        self.send(f"\x1b[<0;{x};{y}M\x1b[<0;{x};{y}m".encode("ascii"))
        time.sleep(delay)
        self.read_available()

    def wheel_down(self, x: int, y: int, delay: float = 0.12) -> None:
        self.send(f"\x1b[<65;{x};{y}M".encode("ascii"))
        time.sleep(delay)
        self.read_available()

    def terminate(self, timeout_s: float = 5) -> int:
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            self.read_available()
            code = self.proc.poll()
            if code is not None:
                return code
            time.sleep(0.05)
        terminate_process(self.proc)
        return int(self.proc.returncode or 0)

    def close(self) -> None:
        self.stop_drain.set()
        if self.drain_thread is not None:
            self.drain_thread.join(timeout=1)
        try:
            if self.proc.poll() is None:
                self.proc.terminate()
                self.proc.wait(timeout=5)
        except Exception:
            terminate_process(self.proc)
        try:
            os.close(self.master)
        except OSError:
            pass

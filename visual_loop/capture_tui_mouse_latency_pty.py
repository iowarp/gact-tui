#!/usr/bin/env python3
"""Capture TUI mouse latency by sending terminal mouse events through a PTY.

VHS cannot script mouse primitives in the version used by this repo. This
helper drives the real TUI in a pseudo-terminal and emits SGR mouse sequences so
the Bubble Tea input path receives actual terminal mouse click/wheel messages.
It writes the same GACT_TUI_LATENCY_REPORT JSON that live captures use.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", default="", help="existing owned backend URL")
    parser.add_argument("--session", default="", help="session id to attach")
    parser.add_argument("--out-dir", default="visual_loop/screenshots")
    parser.add_argument("--port", type=int, default=41932, help="ephemeral emulator port")
    parser.add_argument("--cols", type=int, default=140)
    parser.add_argument("--rows", type=int, default=40)
    parser.add_argument(
        "--own-backend",
        action="store_true",
        help="acknowledge that --backend points at an isolated backend you own",
    )
    parser.add_argument(
        "--keep-ansi",
        action="store_true",
        help="preserve raw terminal output for debugging",
    )
    return parser.parse_args()


def wait_http(url: str, timeout_s: float = 10) -> None:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url.rstrip("/") + "/v1/sessions", timeout=1) as resp:
                if resp.status < 500:
                    return
        except Exception as exc:  # noqa: BLE001 - diagnostic helper
            last_error = exc
        time.sleep(0.1)
    raise RuntimeError(f"backend did not become ready at {url}: {last_error}")


def read_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def start_emulator(port: int, session_id: str, log_path: pathlib.Path) -> tuple[subprocess.Popen, str, str]:
    binary = ROOT / ".tools" / "emulator-server"
    if not binary.exists():
        raise RuntimeError("missing .tools/emulator-server; run: go build -p 1 -o .tools/emulator-server ./emulator/cmd/emulator-server")
    sid = session_id or "ses_seed_ws_default_1"
    log = log_path.open("wb")
    proc = subprocess.Popen(
        [
            str(binary),
            "-port",
            str(port),
            "-timing",
            "fast",
            "-seed-sessions",
            "ws_default=4",
            "-seed-messages",
            f"{sid}=1",
        ],
        cwd=ROOT,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    backend = f"http://127.0.0.1:{port}"
    try:
        wait_http(backend)
    except Exception:
        proc.terminate()
        raise
    return proc, backend, sid


def set_pty_size(fd: int, rows: int, cols: int) -> None:
    termios.tcsetwinsize(fd, (rows, cols))
    packed = struct.pack("HHHH", rows, cols, 0, 0)
    try:
        import fcntl

        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)
    except Exception:
        pass


def strip_ansi(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)


class PtyDriver:
    def __init__(self, argv: list[str], env: dict[str, str], rows: int, cols: int) -> None:
        self.master: int | None = None
        self.proc: subprocess.Popen | None = None
        self.buffer = bytearray()
        master, slave = pty.openpty()
        set_pty_size(slave, rows, cols)
        self.master = master
        self.proc = subprocess.Popen(
            argv,
            cwd=ROOT,
            stdin=slave,
            stdout=slave,
            stderr=slave,
            env=env,
            close_fds=True,
            start_new_session=True,
        )
        os.close(slave)
        set_pty_size(master, rows, cols)

    def close(self) -> None:
        if self.master is not None:
            try:
                os.close(self.master)
            except OSError:
                pass
            self.master = None

    def read_available(self, timeout: float = 0.05) -> bytes:
        if self.master is None:
            return b""
        chunks: list[bytes] = []
        while True:
            ready, _, _ = select.select([self.master], [], [], timeout)
            if not ready:
                break
            try:
                chunk = os.read(self.master, 65536)
            except OSError:
                break
            if not chunk:
                break
            self.buffer.extend(chunk)
            chunks.append(chunk)
            timeout = 0
        return b"".join(chunks)

    def wait_screen(self, pattern: str, timeout_s: float = 10) -> None:
        deadline = time.time() + timeout_s
        regex = re.compile(pattern)
        while time.time() < deadline:
            self.read_available(0.1)
            if regex.search(strip_ansi(bytes(self.buffer))):
                return
            if self.proc is not None and self.proc.poll() is not None:
                raise RuntimeError(f"TUI exited early with code {self.proc.returncode}")
        raise RuntimeError(f"timed out waiting for screen pattern {pattern!r}")

    def send(self, data: bytes) -> None:
        if self.master is None:
            raise RuntimeError("PTY is closed")
        os.write(self.master, data)

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
        if self.proc is None:
            return 0
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            self.read_available()
            code = self.proc.poll()
            if code is not None:
                return code
            time.sleep(0.05)
        try:
            os.killpg(self.proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        return self.proc.wait(timeout=3)


def validate_report(report_path: pathlib.Path) -> dict:
    report = read_json(report_path)
    interactions = report.get("interactions")
    if not isinstance(interactions, list):
        raise RuntimeError("latency report missing interactions list")
    click_rows = [
        row for row in interactions
        if isinstance(row, dict) and "click" in str(row.get("kind", ""))
    ]
    click_targets = {
        str(row.get("last_hit_target", ""))
        for row in click_rows
        if row.get("last_hit_target")
    }
    click_labels = {
        str(row.get("target_label", ""))
        for row in click_rows
        if row.get("target_label")
    }
    wheel_rows = [
        row for row in interactions
        if isinstance(row, dict) and "wheel" in str(row.get("kind", ""))
    ]
    if len(click_targets) < 2:
        raise RuntimeError(f"expected at least two target-labeled click rows, got {click_rows!r}")
    if not click_labels:
        raise RuntimeError(f"expected click target labels, got {click_rows!r}")
    if not wheel_rows:
        raise RuntimeError("expected at least one wheel latency row")
    return {
        "sample_count": int(report.get("sample_count") or 0),
        "surface_count": int(report.get("surface_count") or 0),
        "click_target_count": len(click_targets),
        "click_targets": sorted(click_targets),
        "click_target_labels": sorted(click_labels),
        "wheel_rows": [
            {
                "surface": row.get("surface"),
                "kind": row.get("kind"),
                "target_label": row.get("target_label"),
                "last_hit_target": row.get("last_hit_target"),
            }
            for row in wheel_rows
        ],
    }


def main() -> int:
    args = parse_args()
    out_dir = (ROOT / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "tui_mouse_latency_pty_report.json"
    manifest_path = out_dir / "tui_mouse_latency_pty_manifest.json"
    ansi_path = out_dir / "tui_mouse_latency_pty_output.ansi"
    emulator_log = pathlib.Path(tempfile.gettempdir()) / "gact-tui-mouse-latency-emulator.log"

    backend = args.backend.strip()
    session_id = args.session.strip()
    emulator_proc: subprocess.Popen | None = None
    if backend:
        if not args.own_backend and os.environ.get("GACT_TUI_MOUSE_LATENCY_OWN_BACKEND") != "1":
            raise SystemExit("refusing to run against --backend without --own-backend or GACT_TUI_MOUSE_LATENCY_OWN_BACKEND=1")
        wait_http(backend)
    else:
        emulator_proc, backend, session_id = start_emulator(args.port, session_id, emulator_log)

    binary = ROOT / "tui" / "gact"
    if not binary.exists():
        raise SystemExit("missing tui/gact; run: go build -p 1 -o tui/gact ./tui")

    env = os.environ.copy()
    env["GACT_TUI_LATENCY_REPORT"] = str(report_path)
    env["GACT_ATTACH_SESSION_ID"] = session_id
    env["TERM"] = env.get("TERM") or "xterm-256color"
    argv = [str(binary), "--backend", backend, "--no-intro"]
    driver = PtyDriver(argv, env, args.rows, args.cols)
    try:
        driver.wait_screen("CONVERSATION", timeout_s=12)
        # Hit distinct semantic targets. Coordinates are SGR 1-based cells.
        driver.click(max(2, args.cols - 28), 1)  # header help
        driver.escape()
        driver.click(max(2, args.cols - 16), 1)  # header settings
        driver.escape()
        driver.click(5, 5)  # left sidebar selected session
        driver.click(args.cols // 2, 9)  # conversation body
        driver.click(8, max(3, args.rows - 2))  # input command/focus area
        driver.wheel_down(args.cols // 2, 9)
        driver.ctrl_c()
        driver.ctrl_c()
        code = driver.terminate()
        if code != 0:
            raise RuntimeError(f"TUI exited with status {code}")
    finally:
        if args.keep_ansi:
            ansi_path.write_bytes(bytes(driver.buffer))
        driver.close()
        if emulator_proc is not None:
            emulator_proc.terminate()
            try:
                emulator_proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                emulator_proc.kill()

    summary = validate_report(report_path)
    manifest = {
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "captured_from_owned_backend": bool(args.backend),
        "backend": backend,
        "session_id": session_id,
        "terminal_cols": args.cols,
        "terminal_rows": args.rows,
        "tui_latency_report": str(report_path.relative_to(ROOT)),
        "ansi_output": str(ansi_path.relative_to(ROOT)) if args.keep_ansi else "",
        "mouse_event_source": "pty_sgr_mouse_sequences",
        "vhs_mouse_limitation": "VHS command set cannot script mouse primitives; this harness sends terminal mouse escape sequences directly.",
        **summary,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

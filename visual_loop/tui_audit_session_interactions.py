"""PTY interaction helpers for real TUI audit session captures."""

from __future__ import annotations

import pathlib
import time
from typing import Any


def post_prompt_via_tui(driver: Any, prompt: str, out_dir: pathlib.Path) -> None:
    (out_dir / "typed_prompt.txt").write_text(prompt + "\n", encoding="utf-8")
    driver.wait_screen(r"CONVERSATION|SESSIONS|ASSISTANT|USER", timeout_s=45)
    time.sleep(0.5)
    driver.type_text(prompt)
    time.sleep(0.2)
    driver.enter()


def settle_tui_on_final_artifact(driver: Any, rendered_paths: list[pathlib.Path]) -> None:
    # Focus the conversation pane (input -> sidebar -> body) and jump to the
    # bottom, then page upward until the final plot artifact is visible. The
    # audit's B files are supposed to capture what a user can inspect, not an
    # arbitrary mid-scroll frame left over from live updates.
    driver.write_bytes(b"\t\tG")
    deadline = time.time() + 20
    while time.time() < deadline:
        driver.read_available(0.3)
        rendered = driver.text() + "\n" + "\n".join(
            path.read_text(encoding="utf-8", errors="replace") for path in rendered_paths if path.exists()
        )
        if any(
            marker in rendered
            for marker in (
                "Ctrl+E full image",
                ".png",
                "gnss_timeseries_plot",
                "timeseries.png",
            )
        ):
            return
        # Ctrl+U maps to page-up in the conversation body.
        driver.write_bytes(b"\x15")
        time.sleep(0.2)


def capture_expanded_artifact(
    driver: Any,
    out_dir: pathlib.Path,
    rendered_path: pathlib.Path,
    timeout_s: float = 20,
) -> bool:
    driver.write_bytes(b"\x05")  # Ctrl+E
    deadline = time.time() + timeout_s
    markers = (
        "File ·",
        "Artifact ·",
        "renderer:",
        "_timeseries.png",
    )
    while time.time() < deadline:
        driver.read_available(0.2)
        try:
            text = rendered_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        if any(marker in text for marker in markers):
            (out_dir / "b_expanded_artifact_rendered.txt").write_text(text, encoding="utf-8", errors="replace")
            return True
        time.sleep(0.2)
    try:
        text = rendered_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = driver.text()
    (out_dir / "b_expanded_artifact_rendered.txt").write_text(text, encoding="utf-8", errors="replace")
    return False


def wait_for_tui_received_completion(driver: Any, received_path: pathlib.Path, timeout_s: float = 180) -> bool:
    markers = (
        "sse.message.completed",
        "P475.CI.LY_.20_timeseries.png",
        "gnss_timeseries_plot",
        "turn.completed",
    )
    deadline = time.time() + timeout_s
    offset = 0
    tail = ""
    while time.time() < deadline:
        driver.read_available(0.2)
        try:
            with received_path.open("rb") as fh:
                fh.seek(offset)
                chunk = fh.read()
                offset = fh.tell()
        except OSError:
            chunk = b""
        text = tail + chunk.decode("utf-8", errors="replace")
        tail = text[-512:]
        if any(marker in text for marker in markers):
            return True
        if driver.proc.poll() is not None:
            return False
        time.sleep(0.5)
    return False

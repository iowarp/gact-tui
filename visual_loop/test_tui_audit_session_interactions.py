import tempfile
import unittest
from pathlib import Path

from tui_audit_session_interactions import (
    capture_expanded_artifact,
    post_prompt_via_tui,
    settle_tui_on_final_artifact,
    wait_for_tui_received_completion,
)


class FakeProc:
    def __init__(self, status: int | None = None) -> None:
        self.status = status

    def poll(self) -> int | None:
        return self.status


class FakeDriver:
    def __init__(self, text: str = "", proc_status: int | None = None) -> None:
        self._text = text
        self.proc = FakeProc(proc_status)
        self.writes: list[bytes] = []
        self.typed: list[str] = []
        self.enter_count = 0
        self.waited: list[tuple[str, float]] = []

    def wait_screen(self, pattern: str, timeout_s: float) -> bool:
        self.waited.append((pattern, timeout_s))
        return True

    def type_text(self, text: str) -> None:
        self.typed.append(text)

    def enter(self) -> None:
        self.enter_count += 1

    def write_bytes(self, raw: bytes) -> None:
        self.writes.append(raw)

    def read_available(self, _: float) -> None:
        return None

    def text(self) -> str:
        return self._text


class TuiAuditSessionInteractionsTest(unittest.TestCase):
    def test_post_prompt_records_exact_typed_prompt_and_submits_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            driver = FakeDriver()

            post_prompt_via_tui(driver, "Find station", out_dir)
            typed_prompt = (out_dir / "typed_prompt.txt").read_text(encoding="utf-8")

        self.assertEqual(typed_prompt, "Find station\n")
        self.assertEqual(driver.typed, ["Find station"])
        self.assertEqual(driver.enter_count, 1)

    def test_settle_stops_when_artifact_marker_is_visible(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            rendered = Path(tmp) / "rendered.txt"
            rendered.write_text("final gnss_timeseries_plot is visible", encoding="utf-8")
            driver = FakeDriver()

            settle_tui_on_final_artifact(driver, [rendered])

        self.assertEqual(driver.writes, [b"\t\tG"])

    def test_capture_expanded_artifact_writes_visible_detail_frame(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rendered = root / "full.txt"
            rendered.write_text("Artifact · P475_timeseries.png\nrenderer: image", encoding="utf-8")
            driver = FakeDriver()

            ok = capture_expanded_artifact(driver, root, rendered, timeout_s=0.01)

            self.assertTrue(ok)
            self.assertEqual(driver.writes, [b"\x05"])
            self.assertIn("Artifact", (root / "b_expanded_artifact_rendered.txt").read_text(encoding="utf-8"))

    def test_wait_for_tui_received_completion_accepts_existing_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            received = Path(tmp) / "received.jsonl"
            received.write_text('{"kind": "sse.message.completed"}\n', encoding="utf-8")
            driver = FakeDriver()

            self.assertTrue(wait_for_tui_received_completion(driver, received, timeout_s=0.01))


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

import check_diagnostics_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class DiagnosticsReadinessTest(unittest.TestCase):
    def seed_required(self, root: Path) -> None:
        for evidence in check_diagnostics_readiness.EVIDENCE:
            if not evidence.required_for_demo:
                continue
            for rel in evidence.artifacts:
                text = "artifact"
                if rel.endswith("gact_diag_clipboard_terminal.report.md"):
                    text = "\n".join(
                        [
                            "mouse_capture: enabled (default)",
                            "clipboard_native: clip.exe",
                            "clipboard_missing: wl-copy",
                            "clipboard_osc52: TERM=xterm-256color TERM_PROGRAM=visual-loop",
                            "terminal_selection: TERM=xterm-256color TERM_PROGRAM=visual-loop",
                        ]
                    )
                write_artifact(root, rel, text)

    def test_required_diagnostics_can_pass_while_deferred_live_gaps_remain(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertIn("required evidence: `4/4`", report)
        self.assertIn("deferred live evidence: `0/2`", report)
        self.assertIn("live long-running benchmark metrics", report)

    def test_deferred_live_diagnostics_require_shared_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(root, "visual_loop/screenshots/live_clio_doctor_partial_gaps.png")
            write_artifact(root, "visual_loop/screenshots/live_clio_metrics_active_stream.png")

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertIn("deferred live evidence: `0/2`", report)
        self.assertIn("live_clio_diagnostics_manifest.json", report)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(root, "visual_loop/screenshots/live_clio_doctor_partial_gaps.png")
            write_artifact(root, "visual_loop/screenshots/live_clio_metrics_active_stream.png")
            write_artifact(root, "visual_loop/screenshots/live_clio_diagnostics_manifest.json", "{}")

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertIn("deferred live evidence: `2/2`", report)

    def test_diag_report_requires_clipboard_and_terminal_markers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(
                root,
                "visual_loop/screenshots/gact_diag_clipboard_terminal.report.md",
                "clipboard_native: clip.exe\n",
            )

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertIn("Missing diagnostic markers", report)
        self.assertIn("mouse_capture:", report)
        self.assertIn("clipboard_missing:", report)
        self.assertIn("terminal_selection:", report)


if __name__ == "__main__":
    unittest.main()

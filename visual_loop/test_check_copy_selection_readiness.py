import tempfile
import unittest
from pathlib import Path

import check_copy_selection_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def live_report(capture_mode: str = "live-terminal", checked: bool = True) -> str:
    mark = "[x]" if checked else "[ ]"
    return "\n".join(
        [
            "# Live Terminal Copy Environment Report",
            "",
            f"- capture_mode: {capture_mode}",
            "- TERM: xterm-256color",
            "- TERM_PROGRAM: Windows Terminal",
            "- clipboard_native: clip.exe",
            "- clipboard_missing: wl-copy",
            "- clipboard_osc52: terminal-dependent",
            "- terminal_selection: use /mouse to toggle TUI mouse capture",
            "",
            "## Manual Copy/Selection Checklist",
            "",
            f"- {mark} CLIO drag-copy mode with mouse capture enabled copies selected transcript text.",
            f"- {mark} Native terminal text selection works with mouse capture disabled.",
            f"- {mark} Alt-drag terminal selection works while mouse capture is enabled, if supported by this terminal.",
            f"- {mark} Detail-modal copy by key/button copies only the detail payload.",
            f"- {mark} Selected conversation block copy copies only the selected block.",
            f"- {mark} Clipboard failure path shows actionable diagnostics without backend noise.",
        ]
    )


class CopySelectionReadinessTest(unittest.TestCase):
    def seed_required(self, root: Path) -> None:
        for evidence in check_copy_selection_readiness.DETERMINISTIC_EVIDENCE:
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

    def test_deterministic_copy_can_pass_while_live_terminal_remains_deferred(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)

            result = check_copy_selection_readiness.check_readiness(root)
            report = check_copy_selection_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("deterministic evidence: `2/2`", report)
        self.assertIn("deferred live terminal evidence: `0/1`", report)
        self.assertIn("live_terminal_copy_env.report.md", report)

    def test_live_terminal_report_requires_completed_checklist(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(
                root,
                "visual_loop/screenshots/live_terminal_copy_env.report.md",
                live_report(checked=False),
            )

            result = check_copy_selection_readiness.check_readiness(root)
            report = check_copy_selection_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("Incomplete live checklist items", report)
        self.assertIn("CLIO drag-copy mode", report)

    def test_forced_noninteractive_report_does_not_count_as_live_terminal_proof(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(
                root,
                "visual_loop/screenshots/live_terminal_copy_env.report.md",
                live_report(capture_mode="forced-noninteractive"),
            )

            result = check_copy_selection_readiness.check_readiness(root)
            report = check_copy_selection_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("forced-noninteractive", report)

    def test_completed_live_terminal_report_counts_as_deferred_live_proof(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(
                root,
                "visual_loop/screenshots/live_terminal_copy_env.report.md",
                live_report(),
            )

            result = check_copy_selection_readiness.check_readiness(root)
            report = check_copy_selection_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertTrue(result["live_ok"])
        self.assertIn("deferred live terminal evidence: `1/1`", report)


if __name__ == "__main__":
    unittest.main()

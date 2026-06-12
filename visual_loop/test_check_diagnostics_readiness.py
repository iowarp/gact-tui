import tempfile
import unittest
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_diagnostics_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if rel.endswith(".png") and text == "artifact":
        path.write_bytes(check_diagnostics_readiness.PNG_SIGNATURE + b"fixture png")
    else:
        path.write_text(text, encoding="utf-8")


def write_live_manifest(root: Path, **overrides: object) -> None:
    body: dict[str, object] = {
        "backend": "http://127.0.0.1:17990",
        "captured_from_owned_backend": True,
        "session_id": "sess_running",
        "session_status": "running",
        "doctor_screenshot": "visual_loop/screenshots/live_clio_doctor_partial_gaps.png",
        "metrics_screenshot": "visual_loop/screenshots/live_clio_metrics_active_stream.png",
        "health_status": "degraded",
        "doctor_partial_gaps": True,
        "capabilities_gap_count": 2,
        "metrics_active_sessions": 1,
        "metrics_sample_count": 8,
        "active_stream_metrics": True,
    }
    body.update(overrides)
    write_artifact(
        root,
        "visual_loop/screenshots/live_clio_diagnostics_manifest.json",
        json.dumps(body),
    )


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

    def test_deferred_live_diagnostics_require_valid_shared_manifest(self) -> None:
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
        self.assertFalse(result["live_ok"])
        self.assertIn("deferred live evidence: `0/2`", report)
        self.assertIn("Missing or false manifest keys", report)
        self.assertIn("doctor_partial_gaps", report)
        self.assertIn("active_stream_metrics", report)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(root, "visual_loop/screenshots/live_clio_doctor_partial_gaps.png")
            write_artifact(root, "visual_loop/screenshots/live_clio_metrics_active_stream.png")
            write_live_manifest(root)

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertTrue(result["live_ok"])
        self.assertIn("deferred live evidence: `2/2`", report)

    def test_live_manifest_requires_partial_gaps_and_active_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(root, "visual_loop/screenshots/live_clio_doctor_partial_gaps.png")
            write_artifact(root, "visual_loop/screenshots/live_clio_metrics_active_stream.png")
            write_live_manifest(
                root,
                doctor_partial_gaps=False,
                capabilities_gap_count=0,
                active_stream_metrics=False,
                metrics_active_sessions=0,
                metrics_sample_count=0,
            )

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("doctor_partial_gaps", report)
        self.assertIn("capabilities_gap_count", report)
        self.assertIn("active_stream_metrics", report)
        self.assertIn("metrics_active_sessions", report)
        self.assertIn("metrics_sample_count", report)

    def test_live_manifest_must_reference_tracked_diagnostic_screenshots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(root, "visual_loop/screenshots/live_clio_doctor_partial_gaps.png")
            write_artifact(root, "visual_loop/screenshots/live_clio_metrics_active_stream.png")
            write_live_manifest(
                root,
                doctor_screenshot="visual_loop/screenshots/old_doctor_partial_gaps.png",
                metrics_screenshot="visual_loop/screenshots/old_metrics_active_stream.png",
            )

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("Invalid manifest artifact references", report)
        self.assertIn("doctor_screenshot", report)
        self.assertIn("visual_loop/screenshots/live_clio_doctor_partial_gaps.png", report)
        self.assertIn("visual_loop/screenshots/old_doctor_partial_gaps.png", report)
        self.assertIn("metrics_screenshot", report)
        self.assertIn("visual_loop/screenshots/live_clio_metrics_active_stream.png", report)
        self.assertIn("visual_loop/screenshots/old_metrics_active_stream.png", report)

    def test_placeholder_diagnostics_pngs_do_not_satisfy_required_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(
                root,
                "visual_loop/screenshots/semantic_menu_doctor_health.png",
                "not a png",
            )

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertIn("invalid png", report)

    def test_placeholder_live_diagnostics_pngs_do_not_satisfy_live_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_artifact(
                root,
                "visual_loop/screenshots/live_clio_doctor_partial_gaps.png",
                "not a png",
            )
            write_artifact(
                root,
                "visual_loop/screenshots/live_clio_metrics_active_stream.png",
                "not a png",
            )
            write_live_manifest(root)

            result = check_diagnostics_readiness.check_readiness(root)
            report = check_diagnostics_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("invalid png", report)

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

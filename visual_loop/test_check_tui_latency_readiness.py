import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_tui_latency_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if rel.endswith(".png") and text == "artifact":
        path.write_bytes(check_tui_latency_readiness.PNG_SIGNATURE + b"fixture png")
    else:
        path.write_text(text, encoding="utf-8")


def write_json(root: Path, rel: str, data: dict[str, object]) -> None:
    write_artifact(root, rel, json.dumps(data))


def pty_manifest() -> dict[str, object]:
    return {
        "mouse_event_source": "pty-sgr",
        "tui_latency_report": "visual_loop/screenshots/tui_mouse_latency_pty_report.json",
        "click_sections": ["conversation", "header", "input", "left sidebar"],
        "wheel_sections": ["conversation"],
        "section_latency_summary": [],
        "click_targets": ["header:chip:status", "sidebar:session:ses_seed_ws_default_1"],
        "click_target_labels": ["header chip status", "session row"],
        "wheel_rows": [{"surface": "conversation"}],
        "sample_count": 10,
        "surface_count": 9,
        "click_section_count": 4,
        "click_target_count": 2,
    }


def pty_report(overrides: dict[str, float] | None = None, omit: set[str] | None = None) -> dict[str, object]:
    overrides = overrides or {}
    omit = omit or set()
    sections = []
    for surface, baseline in check_tui_latency_readiness.PTY_MOUSE_SECTION_BASELINES_MS.items():
        if surface in omit:
            continue
        sections.append(
            {
                "surface": surface,
                "sample_count": 1,
                "click_count": 1,
                "slowest_p95_ms": overrides.get(surface, baseline),
            }
        )
    return {"sections": sections}


def owned_clio_manifest() -> dict[str, object]:
    return {
        "backend": "http://127.0.0.1:4444",
        "captured_from_owned_backend": True,
        "metrics_screenshot": "visual_loop/screenshots/live_clio_tui_latency_metrics.png",
        "recording_path": "visual_loop/screenshots/live_clio_tui_latency_capture.gif",
        "tui_latency_section_expected": True,
    }


class TuiLatencyReadinessTest(unittest.TestCase):
    def seed_maintained(self, root: Path) -> None:
        write_artifact(root, "visual_loop/screenshots/semantic_menu_metrics.png")
        write_artifact(root, "visual_loop/screenshots/tui_click_latency_target_semantics.report.md")
        write_json(root, "visual_loop/screenshots/tui_mouse_latency_pty_manifest.json", pty_manifest())
        write_json(root, "visual_loop/screenshots/tui_mouse_latency_pty_report.json", pty_report())
        write_artifact(root, "visual_loop/screenshots/copy_latency_telemetry.report.md")
        write_artifact(root, "visual_loop/screenshots/live_clio_tui_latency_metrics.png")
        write_artifact(root, "visual_loop/screenshots/live_clio_tui_latency_capture.gif")
        write_json(root, "visual_loop/screenshots/live_clio_tui_latency_manifest.json", owned_clio_manifest())

    def test_maintained_latency_evidence_passes_with_current_budget(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_maintained(root)

            result = check_tui_latency_readiness.check_readiness(root)
            report = check_tui_latency_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["strict_live_ok"])
        self.assertIn("Maintained Latency Budgets", report)
        self.assertIn("`1.25x`", report)

    def test_pty_mouse_latency_over_budget_fails_maintained_readiness(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_maintained(root)
            baseline = check_tui_latency_readiness.PTY_MOUSE_SECTION_BASELINES_MS["conversation"]
            write_json(
                root,
                "visual_loop/screenshots/tui_mouse_latency_pty_report.json",
                pty_report({"conversation": baseline * 1.26}),
            )

            result = check_tui_latency_readiness.check_readiness(root)
            report = check_tui_latency_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertIn("Latency budget failure", report)
        self.assertIn("Over budget: `conversation`", report)

    def test_pty_mouse_latency_missing_surface_fails_maintained_readiness(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_maintained(root)
            write_json(
                root,
                "visual_loop/screenshots/tui_mouse_latency_pty_report.json",
                pty_report(omit={"left sidebar"}),
            )

            result = check_tui_latency_readiness.check_readiness(root)
            report = check_tui_latency_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertIn("Missing latency sections", report)
        self.assertIn("left sidebar", report)


if __name__ == "__main__":
    unittest.main()

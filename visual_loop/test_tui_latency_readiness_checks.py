import json
import tempfile
import unittest
from pathlib import Path

from tui_latency_readiness_checks import (
    PTY_MOUSE_SECTION_BASELINES_MS,
    float_value,
    int_value,
    load_json_object,
    load_manifest,
    pty_mouse_latency_budget_status,
)


def write_json(root: Path, rel: str, data: object) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def pty_report(*, omit: str | None = None, multiplier: float = 1.0) -> dict[str, object]:
    sections = []
    for surface, baseline in PTY_MOUSE_SECTION_BASELINES_MS.items():
        if surface == omit:
            continue
        sections.append(
            {
                "surface": surface,
                "slowest_p95_ms": baseline * multiplier,
            }
        )
    return {"sections": sections}


class TuiLatencyReadinessChecksTest(unittest.TestCase):
    def test_scalar_helpers_reject_bool_and_parse_numeric_strings(self) -> None:
        self.assertEqual(int_value(True), 0)
        self.assertEqual(int_value("7"), 7)
        self.assertIsNone(float_value(False))
        self.assertEqual(float_value("2.5"), 2.5)

    def test_load_manifest_distinguishes_optional_and_bad_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(root, "manifest.json", ["not-object"])

            optional_data, optional_status = load_manifest(root, None)
            bad_data, bad_status = load_manifest(root, "manifest.json")

        self.assertEqual(optional_data, {})
        self.assertTrue(optional_status["ok"])
        self.assertEqual(bad_data, {})
        self.assertFalse(bad_status["ok"])
        self.assertEqual(bad_status["state"], "manifest is not an object")

    def test_load_json_object_reports_missing_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data, status = load_json_object(Path(tmp), "missing.json")

        self.assertEqual(data, {})
        self.assertFalse(status["ok"])
        self.assertEqual(status["state"], "missing")

    def test_pty_mouse_latency_budget_status_accepts_baseline_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(root, "visual_loop/screenshots/tui_mouse_latency_pty_report.json", pty_report())

            status = pty_mouse_latency_budget_status(root)

        self.assertTrue(status["ok"])
        self.assertEqual(status["missing_sections"], [])
        self.assertEqual(status["over_budget"], [])

    def test_pty_mouse_latency_budget_status_reports_missing_and_over_budget(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(
                root,
                "visual_loop/screenshots/tui_mouse_latency_pty_report.json",
                pty_report(omit="input", multiplier=2.0),
            )

            status = pty_mouse_latency_budget_status(root)

        self.assertFalse(status["ok"])
        self.assertEqual(status["missing_sections"], ["input"])
        over_budget = status["over_budget"]
        self.assertTrue(isinstance(over_budget, list) and over_budget)


if __name__ == "__main__":
    unittest.main()

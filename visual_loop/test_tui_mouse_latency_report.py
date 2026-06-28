import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tui_mouse_latency_report import validate_report


def write_report(root: Path, data: dict[str, object]) -> Path:
    path = root / "latency.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def valid_report() -> dict[str, object]:
    return {
        "sample_count": 6,
        "surface_count": 4,
        "interactions": [
            {"kind": "click", "last_hit_target": "header:help", "target_label": "help"},
            {"kind": "click", "last_hit_target": "sidebar:session", "target_label": "session row"},
            {"kind": "click", "last_hit_target": "conversation:body", "target_label": "conversation"},
            {"kind": "click", "last_hit_target": "input:box", "target_label": "input"},
            {"kind": "wheel_down", "last_hit_target": "conversation:body", "target_label": "conversation"},
        ],
        "sections": [
            {"surface": "header", "sample_count": 1, "click_count": 1, "wheel_count": 0, "slowest_p95_ms": 5},
            {"surface": "left sidebar", "sample_count": 1, "click_count": 1, "wheel_count": 0, "slowest_p95_ms": 6},
            {"surface": "conversation", "sample_count": 2, "click_count": 1, "wheel_count": 1, "slowest_p95_ms": 7},
            {"surface": "input", "sample_count": 1, "click_count": 1, "wheel_count": 0, "slowest_p95_ms": 4},
        ],
    }


class TuiMouseLatencyReportTest(unittest.TestCase):
    def test_validate_report_extracts_manifest_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = write_report(Path(tmp), valid_report())

            summary = validate_report(path)

        self.assertEqual(summary["sample_count"], 6)
        self.assertEqual(summary["click_sections"], ["conversation", "header", "input", "left sidebar"])
        self.assertEqual(summary["wheel_sections"], ["conversation"])
        self.assertEqual(summary["click_target_count"], 4)
        self.assertEqual(len(summary["section_latency_summary"]), 4)

    def test_validate_report_requires_required_click_sections(self) -> None:
        report = valid_report()
        report["sections"] = [
            row for row in report["sections"]
            if isinstance(row, dict) and row.get("surface") != "input"
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = write_report(Path(tmp), report)

            with self.assertRaisesRegex(RuntimeError, "missing required click latency sections"):
                validate_report(path)

    def test_validate_report_requires_wheel_rows(self) -> None:
        report = valid_report()
        report["interactions"] = [
            row for row in report["interactions"]
            if isinstance(row, dict) and "wheel" not in str(row.get("kind", ""))
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = write_report(Path(tmp), report)

            with self.assertRaisesRegex(RuntimeError, "expected at least one wheel latency row"):
                validate_report(path)


if __name__ == "__main__":
    unittest.main()

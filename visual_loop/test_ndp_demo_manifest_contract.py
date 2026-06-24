import json
import tempfile
import unittest
from pathlib import Path

from ndp_demo_manifest_contract import bool_field, int_value, manifest_status


def valid_manifest() -> dict[str, object]:
    return {
        "case_id": "case-a",
        "session_id": "sess_1",
        "backend": "http://127.0.0.1:17931",
        "artifact_name": "artifact.png",
        "recording_path": "visual_loop/screenshots/case_short.gif",
        "still_capture_paths": [
            "visual_loop/screenshots/case_prompt.png",
            "visual_loop/screenshots/case_early.png",
            "visual_loop/screenshots/case_live.png",
        ],
        "session_status": "idle",
        "assistant_message_count": 1,
        "verified_artifact": True,
        "requested_user_input": False,
        "provider_streaming_limitation": False,
        "live_streaming_false": False,
        "turn_cancelled": False,
        "completion_timeout": False,
        "semantic_event_count": 4,
        "live_observed_event_count": 4,
        "streaming_event_types": ["semantic.event"],
    }


class NDPDemoManifestContractTest(unittest.TestCase):
    def test_scalar_helpers_reject_bool_as_int_and_require_typed_bool(self) -> None:
        self.assertEqual(int_value(True), 0)
        self.assertEqual(int_value("3"), 3)
        self.assertIs(bool_field({"ok": True}, "ok"), True)
        self.assertIsNone(bool_field({"ok": "true"}, "ok"))

    def test_manifest_status_accepts_valid_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "visual_loop/screenshots/case_manifest.json"
            path = root / rel
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(valid_manifest()), encoding="utf-8")

            status = manifest_status(
                root,
                rel,
                case_id="case-a",
                artifact_name="artifact.png",
                recording_path="visual_loop/screenshots/case_short.gif",
                still_capture_paths=(
                    "visual_loop/screenshots/case_prompt.png",
                    "visual_loop/screenshots/case_early.png",
                    "visual_loop/screenshots/case_live.png",
                ),
            )

        self.assertTrue(status["ok"])
        self.assertEqual(status["state"], "verified")

    def test_manifest_status_reports_contract_problems(self) -> None:
        data = valid_manifest()
        data["verified_artifact"] = "true"
        data["semantic_event_count"] = 0
        data["still_capture_paths"] = ["wrong.png"]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "visual_loop/screenshots/case_manifest.json"
            path = root / rel
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(data), encoding="utf-8")

            status = manifest_status(
                root,
                rel,
                case_id="case-a",
                artifact_name="artifact.png",
                recording_path="visual_loop/screenshots/case_short.gif",
                still_capture_paths=(
                    "visual_loop/screenshots/case_prompt.png",
                    "visual_loop/screenshots/case_early.png",
                    "visual_loop/screenshots/case_live.png",
                ),
            )

        self.assertFalse(status["ok"])
        self.assertIn("manifest still_capture_paths do not match expected still captures", status["state"])
        self.assertIn("no semantic events observed", status["state"])
        self.assertIn("manifest verified_artifact must be boolean true", status["state"])


if __name__ == "__main__":
    unittest.main()

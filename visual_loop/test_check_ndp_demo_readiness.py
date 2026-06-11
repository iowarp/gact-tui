import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_ndp_demo_readiness


def seed_report(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(
            [
                "San Diego EarthScope CI.BAR BHZ",
                "Artifact evidence: sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png (ok, 84334 B)",
                "California current wildfire ArcGIS",
                "Artifact evidence: current_wildfires_ca.json (ok, 132149 B)",
                "California NWS warning ISO",
                "Artifact evidence: california_nws_warnings.json (ok, 29459 B)",
                "CIMIS Fresno weather",
                "Artifact evidence: cimis_fresno_weather.png (ok, 256838 B)",
            ]
        ),
        encoding="utf-8",
    )


def touch(root: Path, rel: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("artifact\n", encoding="utf-8")


def write_real_capture(root: Path, rel: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".png":
        path.write_bytes(check_ndp_demo_readiness.PNG_SIGNATURE + b"demo png bytes")
    elif path.suffix == ".gif":
        path.write_bytes(b"GIF89a" + b"demo gif bytes")
    else:
        path.write_bytes(b"demo capture")


def write_manifest(root: Path, case: check_ndp_demo_readiness.DemoCase, **overrides: object) -> None:
    path = root / check_ndp_demo_readiness.real_capture_manifest_path(case)
    path.parent.mkdir(parents=True, exist_ok=True)
    body: dict[str, object] = {
        "case_id": case.case_id,
        "session_id": "sess_demo",
        "backend": "http://127.0.0.1:17973",
        "artifact_name": case.artifact_name,
        "recording_path": check_ndp_demo_readiness.real_recording_path(case),
        "still_capture_paths": list(check_ndp_demo_readiness.real_still_capture_paths(case)),
        "session_status": "idle",
        "assistant_message_count": 1,
        "semantic_event_count": 6,
        "live_observed_event_count": 6,
        "streaming_event_types": [
            "turn.started",
            "llm.request.started",
            "tool.call.started",
            "tool.call.completed",
        ],
        "verified_artifact": True,
        "requested_user_input": False,
        "provider_streaming_limitation": False,
        "live_streaming_false": False,
        "turn_cancelled": False,
        "completion_timeout": False,
    }
    body.update(overrides)
    path.write_text(json.dumps(body), encoding="utf-8")


class NDPDemoReadinessTest(unittest.TestCase):
    def test_report_artifacts_and_deterministic_tui_do_not_imply_real_demo_ready(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            for case in check_ndp_demo_readiness.CASES:
                for rel in case.deterministic_artifacts:
                    touch(root, rel)

            result = check_ndp_demo_readiness.check_readiness(root, report)

        self.assertFalse(result["ok"])
        self.assertEqual(result["summary"]["clio_report_ready"], 4)
        self.assertEqual(result["summary"]["deterministic_tui_ready"], 4)
        self.assertEqual(result["summary"]["real_tui_ready"], 0)
        self.assertEqual(result["summary"]["real_tui_stills"], 0)
        self.assertEqual(result["summary"]["short_recordings"], 0)
        self.assertEqual(result["summary"]["streaming_proof_ready"], 0)

    def test_real_recordings_for_every_case_make_demo_ready(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            for case in check_ndp_demo_readiness.CASES:
                for rel in case.deterministic_artifacts:
                    touch(root, rel)
                for rel in check_ndp_demo_readiness.real_capture_paths(case):
                    write_real_capture(root, rel)
                write_manifest(root, case)

            result = check_ndp_demo_readiness.check_readiness(root, report)

        self.assertTrue(result["ok"])
        self.assertEqual(result["summary"]["ready_for_real_demo"], 4)
        self.assertEqual(result["summary"]["real_tui_stills"], 4)
        self.assertEqual(result["summary"]["short_recordings"], 4)
        self.assertEqual(result["summary"]["streaming_proof_ready"], 4)

    def test_real_recording_manifest_can_reject_failed_live_capture(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            failed_case = check_ndp_demo_readiness.CASES[2]
            for case in check_ndp_demo_readiness.CASES:
                for rel in case.deterministic_artifacts:
                    touch(root, rel)
                for rel in check_ndp_demo_readiness.real_capture_paths(case):
                    write_real_capture(root, rel)
                write_manifest(root, case)
            write_manifest(
                root,
                failed_case,
                verified_artifact=False,
                requested_user_input=True,
                provider_streaming_limitation=True,
                turn_cancelled=True,
            )

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertEqual(result["summary"]["real_tui_stills"], 4)
        self.assertEqual(result["summary"]["short_recordings"], 4)
        self.assertEqual(result["summary"]["streaming_proof_ready"], 3)
        self.assertEqual(result["summary"]["real_tui_ready"], 3)
        self.assertIn("expected artifact not observed", rendered)
        self.assertIn("assistant requested user input", rendered)
        self.assertIn("provider did not expose live streaming", rendered)
        self.assertIn("turn was cancelled", rendered)
        self.assertIn("| California NWS warnings | yes | yes | yes | yes | no | no |", rendered)

    def test_placeholder_real_recordings_do_not_make_demo_ready(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            for case in check_ndp_demo_readiness.CASES:
                for rel in case.deterministic_artifacts:
                    touch(root, rel)
                for rel in check_ndp_demo_readiness.real_capture_paths(case):
                    touch(root, rel)

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertEqual(result["summary"]["real_tui_ready"], 0)
        self.assertEqual(result["summary"]["real_tui_stills"], 0)
        self.assertEqual(result["summary"]["short_recordings"], 0)
        self.assertIn("invalid png", rendered)
        self.assertIn("invalid gif", rendered)

    def test_manifest_streaming_limitation_keeps_visual_recording_visible_but_not_ready(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            limited_case = check_ndp_demo_readiness.CASES[3]
            for case in check_ndp_demo_readiness.CASES:
                for rel in case.deterministic_artifacts:
                    touch(root, rel)
                for rel in check_ndp_demo_readiness.real_capture_paths(case):
                    write_real_capture(root, rel)
                write_manifest(root, case)
            write_manifest(root, limited_case, provider_streaming_limitation=True, live_streaming_false=True)

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertFalse(result["ok"])
        self.assertEqual(result["summary"]["real_tui_stills"], 4)
        self.assertEqual(result["summary"]["short_recordings"], 4)
        self.assertEqual(result["summary"]["streaming_proof_ready"], 3)
        self.assertIn("| Fresno CIMIS weather profile and visualization | yes | yes | yes | yes | no | no |", rendered)
        self.assertIn("Live-run manifest does not prove streaming-ready demo semantics", rendered)

    def test_markdown_lists_missing_real_tui_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertIn("ready for real demo: `false`", rendered)
        self.assertIn("ndp_tui_real_california_nws_warnings_prompt.png", rendered)
        self.assertIn("ndp_tui_real_fresno_cimis_short.gif", rendered)

    def test_write_markdown_report_persists_exact_readiness_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            output = root / "visual_loop" / "NDP_DEMO_VISUAL_READINESS.md"
            seed_report(report)

            result = check_ndp_demo_readiness.check_readiness(root, report)
            check_ndp_demo_readiness.write_markdown_report(result, output)

            written = output.read_text(encoding="utf-8")

        self.assertEqual(written, check_ndp_demo_readiness.render_markdown(result))
        self.assertIn("NDP Demo Readiness", written)
        self.assertIn("ndp_tui_real_california_nws_warnings_live.png", written)

    def test_legacy_visual_captures_without_manifest_are_not_streaming_proof(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            legacy_case = check_ndp_demo_readiness.CASES[0]
            for rel in legacy_case.deterministic_artifacts:
                touch(root, rel)
            for rel in check_ndp_demo_readiness.real_capture_paths(legacy_case):
                write_real_capture(root, rel)

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)
            legacy = result["cases"][0]

        self.assertTrue(legacy["real_tui_recording"]["visual_ok"])
        self.assertFalse(legacy["real_tui_recording"]["streaming_ok"])
        self.assertFalse(legacy["ready_for_real_demo"])
        self.assertIn("streaming proof manifest missing", rendered)

    def test_manifest_without_live_semantic_events_is_not_streaming_proof(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            case = check_ndp_demo_readiness.CASES[0]
            for rel in case.deterministic_artifacts:
                touch(root, rel)
            for rel in check_ndp_demo_readiness.real_capture_paths(case):
                write_real_capture(root, rel)
            write_manifest(
                root,
                case,
                semantic_event_count=0,
                live_observed_event_count=0,
                streaming_event_types=[],
            )

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertFalse(result["cases"][0]["real_tui_recording"]["streaming_ok"])
        self.assertIn("no semantic events observed", rendered)
        self.assertIn("no live-observed semantic events observed", rendered)
        self.assertIn("streaming_event_types is empty", rendered)

    def test_manifest_must_reference_case_recording_and_still_captures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            case = check_ndp_demo_readiness.CASES[0]
            for rel in case.deterministic_artifacts:
                touch(root, rel)
            for rel in check_ndp_demo_readiness.real_capture_paths(case):
                write_real_capture(root, rel)
            write_manifest(
                root,
                case,
                recording_path="visual_loop/screenshots/old_ndp_short.gif",
                still_capture_paths=[
                    "visual_loop/screenshots/old_ndp_prompt.png",
                    "visual_loop/screenshots/old_ndp_early.png",
                    "visual_loop/screenshots/old_ndp_live.png",
                ],
            )

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertFalse(result["cases"][0]["real_tui_recording"]["streaming_ok"])
        self.assertIn("manifest recording_path does not match expected short GIF", rendered)
        self.assertIn("manifest still_capture_paths do not match expected still captures", rendered)

    def test_manifest_requires_typed_boolean_outcome_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "ndp_demo_four_cases.md"
            seed_report(report)
            case = check_ndp_demo_readiness.CASES[0]
            for rel in case.deterministic_artifacts:
                touch(root, rel)
            for rel in check_ndp_demo_readiness.real_capture_paths(case):
                write_real_capture(root, rel)
            write_manifest(
                root,
                case,
                verified_artifact="true",
                requested_user_input="false",
                provider_streaming_limitation="false",
                live_streaming_false="false",
                turn_cancelled="false",
                completion_timeout="false",
            )

            result = check_ndp_demo_readiness.check_readiness(root, report)
            rendered = check_ndp_demo_readiness.render_markdown(result)

        self.assertFalse(result["cases"][0]["real_tui_recording"]["streaming_ok"])
        self.assertIn("manifest verified_artifact must be boolean true", rendered)
        self.assertIn("manifest requested_user_input must be boolean false", rendered)
        self.assertIn("manifest provider_streaming_limitation must be boolean false", rendered)
        self.assertIn("manifest live_streaming_false must be boolean false", rendered)
        self.assertIn("manifest turn_cancelled must be boolean false", rendered)
        self.assertIn("manifest completion_timeout must be boolean false", rendered)
        self.assertIn("| San Diego / EarthScope seismic waveform review | yes | yes | yes | no | no |", rendered)


if __name__ == "__main__":
    unittest.main()

import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_provider_recovery_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if rel.endswith(".png") and text == "artifact":
        path.write_bytes(check_provider_recovery_readiness.PNG_SIGNATURE + b"fixture png")
    else:
        path.write_text(text, encoding="utf-8")


def write_manifest(root: Path, rel: str, data: dict[str, object]) -> None:
    write_artifact(root, rel, json.dumps(data))


class ProviderRecoveryReadinessTest(unittest.TestCase):
    def seed_required(self, root: Path) -> None:
        for evidence in check_provider_recovery_readiness.DETERMINISTIC_EVIDENCE:
            for rel in evidence.artifacts:
                write_artifact(root, rel)

    def seed_live_provider_recovery(self, root: Path) -> None:
        for rel in check_provider_recovery_readiness.LIVE_EVIDENCE.artifacts:
            if rel.endswith(".json"):
                continue
            write_artifact(root, rel)
        write_manifest(
            root,
            "visual_loop/screenshots/live_clio_provider_recovery_manifest.json",
            {
                "backend": "http://127.0.0.1:4444",
                "captured_from_owned_backend": True,
                "failure_session_id": "sess_failed",
                "recovery_session_id": "sess_recovered",
                "retry_model": "argonne/openai/gpt-oss-120b",
                "provider_failure_observed": True,
                "retry_override_warning_observed": True,
                "provider_recovery_observed": True,
                "provider_failure_inline": "visual_loop/screenshots/live_clio_provider_failure_inline.png",
                "provider_failure_detail": "visual_loop/screenshots/live_clio_provider_failure_detail.png",
                "retry_override_warning": "visual_loop/screenshots/live_clio_provider_retry_override_warning.png",
                "provider_recovery_conversation": "visual_loop/screenshots/live_clio_provider_recovery_conversation.png",
                "provider_recovery_setup": "visual_loop/screenshots/live_clio_provider_recovery_setup.png",
            },
        )

    def test_deterministic_provider_can_pass_while_live_recovery_remains_deferred(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)

            result = check_provider_recovery_readiness.check_readiness(root)
            report = check_provider_recovery_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("deterministic evidence: `2/2`", report)
        self.assertIn("deferred live provider evidence: `0/1`", report)
        self.assertIn("live_clio_provider_recovery_manifest.json", report)

    def test_live_provider_manifest_requires_recovery_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            for rel in check_provider_recovery_readiness.LIVE_EVIDENCE.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_provider_recovery_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "failure_session_id": "sess_failed",
                    "retry_model": "argonne/openai/gpt-oss-120b",
                    "provider_failure_observed": True,
                    "retry_override_warning_observed": True,
                    "provider_failure_inline": "visual_loop/screenshots/live_clio_provider_failure_inline.png",
                    "provider_failure_detail": "visual_loop/screenshots/live_clio_provider_failure_detail.png",
                    "retry_override_warning": "visual_loop/screenshots/live_clio_provider_retry_override_warning.png",
                },
            )

            result = check_provider_recovery_readiness.check_readiness(root)
            report = check_provider_recovery_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("Missing or false manifest keys", report)
        self.assertIn("recovery_session_id", report)
        self.assertIn("provider_recovery_observed", report)
        self.assertIn("provider_recovery_setup", report)

    def test_placeholder_provider_pngs_do_not_satisfy_live_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            for rel in check_provider_recovery_readiness.LIVE_EVIDENCE.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel, "not a png")
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_provider_recovery_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "failure_session_id": "sess_failed",
                    "recovery_session_id": "sess_recovered",
                    "retry_model": "argonne/openai/gpt-oss-120b",
                    "provider_failure_observed": True,
                    "retry_override_warning_observed": True,
                    "provider_recovery_observed": True,
                    "provider_failure_inline": "visual_loop/screenshots/live_clio_provider_failure_inline.png",
                    "provider_failure_detail": "visual_loop/screenshots/live_clio_provider_failure_detail.png",
                    "retry_override_warning": "visual_loop/screenshots/live_clio_provider_retry_override_warning.png",
                    "provider_recovery_conversation": "visual_loop/screenshots/live_clio_provider_recovery_conversation.png",
                    "provider_recovery_setup": "visual_loop/screenshots/live_clio_provider_recovery_setup.png",
                },
            )

            result = check_provider_recovery_readiness.check_readiness(root)
            report = check_provider_recovery_readiness.render_markdown(result)

        self.assertFalse(result["live_ok"])
        self.assertIn("invalid png", report)

    def test_false_provider_observed_flags_do_not_satisfy_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            for rel in check_provider_recovery_readiness.LIVE_EVIDENCE.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_provider_recovery_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "failure_session_id": "sess_failed",
                    "recovery_session_id": "sess_recovered",
                    "retry_model": "argonne/openai/gpt-oss-120b",
                    "provider_failure_observed": False,
                    "retry_override_warning_observed": True,
                    "provider_recovery_observed": False,
                    "provider_failure_inline": "visual_loop/screenshots/live_clio_provider_failure_inline.png",
                    "provider_failure_detail": "visual_loop/screenshots/live_clio_provider_failure_detail.png",
                    "retry_override_warning": "visual_loop/screenshots/live_clio_provider_retry_override_warning.png",
                    "provider_recovery_conversation": "visual_loop/screenshots/live_clio_provider_recovery_conversation.png",
                    "provider_recovery_setup": "visual_loop/screenshots/live_clio_provider_recovery_setup.png",
                },
            )

            result = check_provider_recovery_readiness.check_readiness(root)
            report = check_provider_recovery_readiness.render_markdown(result)

        self.assertFalse(result["live_ok"])
        self.assertIn("provider_failure_observed", report)
        self.assertIn("provider_recovery_observed", report)

    def test_all_live_provider_recovery_evidence_can_pass(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            self.seed_live_provider_recovery(root)

            result = check_provider_recovery_readiness.check_readiness(root)
            report = check_provider_recovery_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertTrue(result["live_ok"])
        self.assertIn("deferred live provider evidence: `1/1`", report)


if __name__ == "__main__":
    unittest.main()

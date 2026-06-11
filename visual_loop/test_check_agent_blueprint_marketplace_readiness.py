import json
import tempfile
import unittest
from pathlib import Path

import check_agent_blueprint_marketplace_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_manifest(root: Path, rel: str, data: dict[str, object]) -> None:
    write_artifact(root, rel, json.dumps(data))


class AgentBlueprintMarketplaceReadinessTest(unittest.TestCase):
    def seed_required(self, root: Path) -> None:
        for evidence in check_agent_blueprint_marketplace_readiness.DETERMINISTIC_EVIDENCE:
            for rel in evidence.artifacts:
                write_artifact(root, rel)

    def seed_live_marketplace_lifecycle(self, root: Path) -> None:
        write_manifest(
            root,
            "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_lifecycle_manifest.json",
            {
                "backend": "http://127.0.0.1:4444",
                "source_url": "https://github.com/example/blueprints.git",
                "source_add_success": True,
                "source_refresh_success": True,
                "source_remove_success": True,
                "blueprint_id": "example-blueprint",
                "blueprint_install_success": True,
                "blueprint_update_success": True,
                "blueprint_activation_success": True,
                "source_ref": "main",
                "source_commit": "0123456789abcdef",
            },
        )

    def test_deterministic_blueprint_marketplace_can_pass_while_live_gap_remains(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)

            result = check_agent_blueprint_marketplace_readiness.check_readiness(root)
            report = check_agent_blueprint_marketplace_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("deterministic evidence: `3/3`", report)
        self.assertIn("deferred live marketplace evidence: `0/1`", report)
        self.assertIn("live_clio_agent_blueprint_marketplace_lifecycle_manifest.json", report)

    def test_live_marketplace_manifest_keys_are_required(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "source_url": "https://github.com/example/blueprints.git",
                    "source_add_success": True,
                    "blueprint_id": "example-blueprint",
                },
            )

            result = check_agent_blueprint_marketplace_readiness.check_readiness(root)
            report = check_agent_blueprint_marketplace_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("Missing manifest keys", report)
        self.assertIn("source_refresh_success", report)
        self.assertIn("blueprint_activation_success", report)
        self.assertIn("source_commit", report)

    def test_all_live_marketplace_evidence_can_pass(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            self.seed_live_marketplace_lifecycle(root)

            result = check_agent_blueprint_marketplace_readiness.check_readiness(root)
            report = check_agent_blueprint_marketplace_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertTrue(result["live_ok"])
        self.assertIn("deferred live marketplace evidence: `1/1`", report)


if __name__ == "__main__":
    unittest.main()

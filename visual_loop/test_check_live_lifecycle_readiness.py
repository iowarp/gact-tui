import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_live_lifecycle_readiness


def write_artifact(root: Path, rel: str, text: str = "artifact") -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if rel.endswith(".png") and text == "artifact":
        path.write_bytes(check_live_lifecycle_readiness.PNG_SIGNATURE + b"fixture png")
    else:
        path.write_text(text, encoding="utf-8")


def write_manifest(root: Path, rel: str, data: dict[str, object]) -> None:
    write_artifact(root, rel, json.dumps(data))


class LiveLifecycleReadinessTest(unittest.TestCase):
    def seed_required(self, root: Path) -> None:
        for evidence in check_live_lifecycle_readiness.DETERMINISTIC_EVIDENCE:
            for rel in evidence.artifacts:
                write_artifact(root, rel)

    def seed_runtime_catalog_breadth(self, root: Path) -> None:
        evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[0]
        for rel in evidence.artifacts:
            if rel.endswith(".json"):
                continue
            write_artifact(root, rel)
        write_manifest(
            root,
            "visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json",
            {
                "backend": "http://127.0.0.1:4444",
                "captured_from_owned_backend": True,
                "tools_catalog": "visual_loop/screenshots/live_clio_runtime_tools_catalog.png",
                "tools_detail": "visual_loop/screenshots/live_clio_runtime_tools_detail.png",
                "mcp_catalog": "visual_loop/screenshots/live_clio_runtime_mcp_catalog.png",
                "mcp_detail": "visual_loop/screenshots/live_clio_runtime_mcp_detail.png",
                "agent_blueprint_sources": "visual_loop/screenshots/live_clio_runtime_blueprint_sources.png",
            },
        )

    def seed_registry_lifecycle(self, root: Path) -> None:
        evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[1]
        for rel in evidence.artifacts:
            if rel.endswith(".json"):
                continue
            write_artifact(root, rel)
        write_manifest(
            root,
            "visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json",
            {
                "backend": "http://127.0.0.1:4444",
                "captured_from_owned_backend": True,
                "mcp_install_success": True,
                "mcp_remove_success": True,
                "source_refresh_success": True,
                "mcp_install_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_install_success.png",
                "mcp_remove_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png",
                "source_refresh_screenshot": "visual_loop/screenshots/live_clio_runtime_source_refresh_success.png",
            },
        )

    def seed_prompt_expert_lifecycle(self, root: Path) -> None:
        evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[2]
        for rel in evidence.artifacts:
            if rel.endswith(".json"):
                continue
            write_artifact(root, rel)
        write_manifest(
            root,
            "visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
            {
                "backend": "http://127.0.0.1:4444",
                "captured_from_owned_backend": True,
                "mutation_consent": True,
                "expert_pack_source": "/tmp/pack",
                "prompt_catalog": "visual_loop/screenshots/live_clio_prompt_catalog.png",
                "prompt_save_success": True,
                "expert_pack_catalog": "visual_loop/screenshots/live_clio_expert_pack_catalog.png",
                "expert_pack_install_success": True,
                "expert_pack_update_success": True,
                "expert_pack_delete_success": True,
            },
        )

    def test_deterministic_lifecycle_can_pass_while_live_gaps_remain(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("deterministic evidence: `2/2`", report)
        self.assertIn("deferred live lifecycle evidence: `0/3`", report)
        self.assertIn("live_clio_runtime_catalogs_manifest.json", report)
        self.assertIn("live_clio_runtime_registry_lifecycle_manifest.json", report)
        self.assertIn("live_clio_prompt_expert_pack_lifecycle_manifest.json", report)

    def test_live_manifest_keys_are_required(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[0]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(root, "visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json", {"backend": "x"})

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][0]["ok"])
        self.assertIn("Missing or false manifest keys", report)
        self.assertIn("tools_catalog", report)
        self.assertIn("captured_from_owned_backend", report)
        self.assertIn("agent_blueprint_sources", report)

    def test_placeholder_live_pngs_do_not_satisfy_visual_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[0]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel, "not a png")
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "tools_catalog": "visual_loop/screenshots/live_clio_runtime_tools_catalog.png",
                    "tools_detail": "visual_loop/screenshots/live_clio_runtime_tools_detail.png",
                    "mcp_catalog": "visual_loop/screenshots/live_clio_runtime_mcp_catalog.png",
                    "mcp_detail": "visual_loop/screenshots/live_clio_runtime_mcp_detail.png",
                    "agent_blueprint_sources": "visual_loop/screenshots/live_clio_runtime_blueprint_sources.png",
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][0]["ok"])
        self.assertIn("invalid png", report)

    def test_false_lifecycle_success_flags_do_not_satisfy_live_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[1]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "mcp_install_success": False,
                    "mcp_remove_success": True,
                    "source_refresh_success": False,
                    "mcp_install_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_install_success.png",
                    "mcp_remove_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png",
                    "source_refresh_screenshot": "visual_loop/screenshots/live_clio_runtime_source_refresh_success.png",
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][1]["ok"])
        self.assertIn("mcp_install_success", report)
        self.assertIn("source_refresh_success", report)

    def test_registry_lifecycle_manifest_must_reference_tracked_screenshots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[1]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "mcp_install_success": True,
                    "mcp_remove_success": True,
                    "source_refresh_success": True,
                    "mcp_install_screenshot": "visual_loop/screenshots/old_mcp_install.png",
                    "mcp_remove_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png",
                    "source_refresh_screenshot": "visual_loop/screenshots/live_clio_runtime_source_refresh_success.png",
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][1]["ok"])
        self.assertIn("Invalid manifest artifact references", report)
        self.assertIn("mcp_install_screenshot", report)
        self.assertIn("visual_loop/screenshots/live_clio_runtime_mcp_install_success.png", report)
        self.assertIn("visual_loop/screenshots/old_mcp_install.png", report)

    def test_runtime_catalog_manifest_must_reference_tracked_screenshots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[0]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "tools_catalog": "visual_loop/screenshots/other_tools.png",
                    "tools_detail": "visual_loop/screenshots/live_clio_runtime_tools_detail.png",
                    "mcp_catalog": "visual_loop/screenshots/live_clio_runtime_mcp_catalog.png",
                    "mcp_detail": "visual_loop/screenshots/live_clio_runtime_mcp_detail.png",
                    "agent_blueprint_sources": "visual_loop/screenshots/live_clio_runtime_blueprint_sources.png",
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][0]["ok"])
        self.assertIn("Invalid manifest artifact references", report)
        self.assertIn("tools_catalog", report)
        self.assertIn("live_clio_runtime_tools_catalog.png", report)
        self.assertIn("other_tools.png", report)

    def test_prompt_expert_lifecycle_requires_mutation_consent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[2]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "mutation_consent": False,
                    "expert_pack_source": "/tmp/pack",
                    "prompt_catalog": "visual_loop/screenshots/live_clio_prompt_catalog.png",
                    "prompt_save_success": True,
                    "expert_pack_catalog": "visual_loop/screenshots/live_clio_expert_pack_catalog.png",
                    "expert_pack_install_success": True,
                    "expert_pack_update_success": True,
                    "expert_pack_delete_success": True,
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][2]["ok"])
        self.assertIn("mutation_consent", report)

    def test_prompt_expert_lifecycle_rejects_false_success_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[2]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "mutation_consent": True,
                    "expert_pack_source": "/tmp/pack",
                    "prompt_catalog": "visual_loop/screenshots/live_clio_prompt_catalog.png",
                    "prompt_save_success": False,
                    "expert_pack_catalog": "visual_loop/screenshots/live_clio_expert_pack_catalog.png",
                    "expert_pack_install_success": True,
                    "expert_pack_update_success": False,
                    "expert_pack_delete_success": True,
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][2]["ok"])
        self.assertIn("prompt_save_success", report)
        self.assertIn("expert_pack_update_success", report)

    def test_prompt_expert_manifest_must_reference_tracked_screenshots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[2]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "mutation_consent": True,
                    "expert_pack_source": "/tmp/pack",
                    "prompt_catalog": "visual_loop/screenshots/live_clio_prompt_catalog.png",
                    "prompt_save_success": True,
                    "expert_pack_catalog": "visual_loop/screenshots/live_clio_expert_pack_catalog_WRONG.png",
                    "expert_pack_install_success": True,
                    "expert_pack_update_success": True,
                    "expert_pack_delete_success": True,
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][2]["ok"])
        self.assertIn("Invalid manifest artifact references", report)
        self.assertIn("expert_pack_catalog", report)
        self.assertIn("live_clio_expert_pack_catalog.png", report)
        self.assertIn("live_clio_expert_pack_catalog_WRONG.png", report)

    def test_prompt_expert_lifecycle_rejects_string_success_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            evidence = check_live_lifecycle_readiness.LIVE_EVIDENCE[2]
            for rel in evidence.artifacts:
                if rel.endswith(".json"):
                    continue
                write_artifact(root, rel)
            write_manifest(
                root,
                "visual_loop/screenshots/live_clio_prompt_expert_pack_lifecycle_manifest.json",
                {
                    "backend": "http://127.0.0.1:4444",
                    "captured_from_owned_backend": True,
                    "mutation_consent": True,
                    "expert_pack_source": "/tmp/pack",
                    "prompt_catalog": "visual_loop/screenshots/live_clio_prompt_catalog.png",
                    "prompt_save_success": "visual_loop/screenshots/live_clio_prompt_save_success.png",
                    "expert_pack_catalog": "visual_loop/screenshots/live_clio_expert_pack_catalog.png",
                    "expert_pack_install_success": "visual_loop/screenshots/live_clio_expert_pack_install_success.png",
                    "expert_pack_update_success": "visual_loop/screenshots/live_clio_expert_pack_update_success.png",
                    "expert_pack_delete_success": "visual_loop/screenshots/live_clio_expert_pack_delete_success.png",
                },
            )

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertFalse(result["live"][2]["ok"])
        self.assertIn("prompt_save_success", report)
        self.assertIn("expert_pack_install_success", report)
        self.assertIn("expert_pack_update_success", report)
        self.assertIn("expert_pack_delete_success", report)

    def test_partial_live_lifecycle_does_not_satisfy_all_live_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            self.seed_runtime_catalog_breadth(root)
            self.seed_prompt_expert_lifecycle(root)

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertFalse(result["live_ok"])
        self.assertIn("deferred live lifecycle evidence: `2/3`", report)
        self.assertIn("live_clio_runtime_registry_lifecycle_manifest.json", report)

    def test_all_live_lifecycle_evidence_can_pass(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_required(root)
            self.seed_runtime_catalog_breadth(root)
            self.seed_registry_lifecycle(root)
            self.seed_prompt_expert_lifecycle(root)

            result = check_live_lifecycle_readiness.check_readiness(root)
            report = check_live_lifecycle_readiness.render_markdown(result)

        self.assertTrue(result["ok"])
        self.assertTrue(result["live_ok"])
        self.assertIn("deferred live lifecycle evidence: `3/3`", report)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_agent_blueprint_marketplace_readiness
import check_copy_selection_readiness
import check_live_lifecycle_readiness
import check_provider_recovery_readiness
import check_release_0_8_3_readiness


PNG = b"\x89PNG\r\n\x1a\nfixture"


class Release083ReadinessTest(unittest.TestCase):
    def write_png(self, root: Path, rel: str) -> None:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PNG)

    def write_text(self, root: Path, rel: str, text: str) -> None:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def seed_deterministic(self, root: Path) -> None:
        for evidence in check_copy_selection_readiness.DETERMINISTIC_EVIDENCE:
            for rel in evidence.artifacts:
                if rel.endswith(".png"):
                    self.write_png(root, rel)
                else:
                    self.write_text(
                        root,
                        rel,
                        "\n".join(evidence.required_markers) + "\nTERM=xterm-256color\nTERM_PROGRAM=WindowsTerminal\n",
                    )
        for module in (
            check_provider_recovery_readiness,
            check_agent_blueprint_marketplace_readiness,
            check_live_lifecycle_readiness,
        ):
            for evidence in module.DETERMINISTIC_EVIDENCE:
                for rel in evidence.artifacts:
                    self.write_png(root, rel)

    def seed_live_terminal(self, root: Path) -> None:
        self.write_text(
            root,
            "visual_loop/screenshots/live_terminal_copy_env.report.md",
            """
- captured_at: 2026-06-15T00:00:00Z
- capture_mode: live-terminal
- cwd: /repo
- TERM: xterm-256color
- TERM_PROGRAM: WindowsTerminal
## GACT Diagnostics
clipboard_native:
clipboard_missing:
clipboard_osc52:
terminal_selection:
path_gact_status: matches running binary
clio_gact_status: matches running binary
## Manual Copy/Selection Checklist
- [x] CLIO drag-copy mode with mouse capture enabled copies selected transcript text.
- [x] Native terminal text selection works with mouse capture disabled.
- [n/a] Alt-drag terminal selection works while mouse capture is enabled, if supported by this terminal.
- [x] Detail-modal copy by key/button copies only the detail payload.
- [x] Selected conversation block copy copies only the selected block.
- [x] Clipboard failure path shows actionable diagnostics without backend noise.
""".lstrip(),
        )

    def seed_provider_live(self, root: Path) -> None:
        evidence = check_provider_recovery_readiness.LIVE_EVIDENCE
        for rel in evidence.artifacts:
            if rel.endswith(".png"):
                self.write_png(root, rel)
        self.write_text(
            root,
            evidence.manifest or "",
            json.dumps(
                {
                    "backend": "http://127.0.0.1:17983",
                    "captured_from_owned_backend": True,
                    "failure_session_id": "failure",
                    "recovery_session_id": "recovery",
                    "retry_model": "argonne/openai/gpt-oss-120b",
                    "provider_failure_observed": True,
                    "retry_override_warning_observed": True,
                    "provider_recovery_observed": True,
                    "provider_failure_inline": "visual_loop/screenshots/live_clio_provider_failure_inline.png",
                    "provider_failure_detail": "visual_loop/screenshots/live_clio_provider_failure_detail.png",
                    "retry_override_warning": "visual_loop/screenshots/live_clio_provider_retry_override_warning.png",
                    "provider_recovery_conversation": "visual_loop/screenshots/live_clio_provider_recovery_conversation.png",
                    "provider_recovery_setup": "visual_loop/screenshots/live_clio_provider_recovery_setup.png",
                }
            ),
        )

    def seed_marketplace_live(self, root: Path) -> None:
        evidence = check_agent_blueprint_marketplace_readiness.LIVE_EVIDENCE
        for rel in evidence.artifacts:
            if rel.endswith(".png"):
                self.write_png(root, rel)
        self.write_text(
            root,
            evidence.manifest or "",
            json.dumps(
                {
                    "backend": "http://127.0.0.1:17983",
                    "captured_from_owned_backend": True,
                    "source_url": "https://github.com/iowarp/ndp-demo-agents.git",
                    "source_add_success": True,
                    "source_refresh_success": True,
                    "source_remove_success": True,
                    "blueprint_id": "seismic-waveform-review",
                    "blueprint_install_success": True,
                    "blueprint_update_success": True,
                    "blueprint_activation_success": True,
                    "source_ref": "main",
                    "source_commit": "abc123",
                    "sources_screenshot": "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_sources.png",
                    "installed_screenshot": "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_installed.png",
                    "activated_screenshot": "visual_loop/screenshots/live_clio_agent_blueprint_marketplace_activated.png",
                }
            ),
        )

    def seed_runtime_live(self, root: Path) -> None:
        for evidence in check_live_lifecycle_readiness.LIVE_EVIDENCE[:2]:
            for rel in evidence.artifacts:
                if rel.endswith(".png"):
                    self.write_png(root, rel)
        self.write_text(
            root,
            "visual_loop/screenshots/live_clio_runtime_catalogs_manifest.json",
            json.dumps(
                {
                    "backend": "http://127.0.0.1:17983",
                    "captured_from_owned_backend": True,
                    "tools_catalog": "visual_loop/screenshots/live_clio_runtime_tools_catalog.png",
                    "tools_detail": "visual_loop/screenshots/live_clio_runtime_tools_detail.png",
                    "mcp_catalog": "visual_loop/screenshots/live_clio_runtime_mcp_catalog.png",
                    "mcp_detail": "visual_loop/screenshots/live_clio_runtime_mcp_detail.png",
                    "agent_blueprint_sources": "visual_loop/screenshots/live_clio_runtime_blueprint_sources.png",
                }
            ),
        )
        self.write_text(
            root,
            "visual_loop/screenshots/live_clio_runtime_registry_lifecycle_manifest.json",
            json.dumps(
                {
                    "backend": "http://127.0.0.1:17983",
                    "captured_from_owned_backend": True,
                    "mcp_install_success": True,
                    "mcp_remove_success": True,
                    "source_refresh_success": True,
                    "mcp_install_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_install_success.png",
                    "mcp_remove_screenshot": "visual_loop/screenshots/live_clio_runtime_mcp_remove_success.png",
                    "source_refresh_screenshot": "visual_loop/screenshots/live_clio_runtime_source_refresh_success.png",
                }
            ),
        )

    def test_current_gate_can_be_deterministic_ready_but_live_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_deterministic(root)

            result = check_release_0_8_3_readiness.check_readiness(root)
            report = check_release_0_8_3_readiness.render_markdown(result)

            self.assertTrue(result["ok"])
            self.assertFalse(result["live_ok"])
            self.assertIn("deterministic readiness: `5/5`", report)
            self.assertIn("live proof readiness: `0/5`", report)
            self.assertIn("#150", report)
            self.assertIn("#154", report)
            self.assertIn("#143", report)
            self.assertIn("#152", report)

    def test_prompt_expert_pack_live_gap_is_not_part_of_0_8_3_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.seed_deterministic(root)
            self.seed_live_terminal(root)
            self.seed_provider_live(root)
            self.seed_marketplace_live(root)
            self.seed_runtime_live(root)

            result = check_release_0_8_3_readiness.check_readiness(root)
            report = check_release_0_8_3_readiness.render_markdown(result)

            self.assertTrue(result["ok"])
            self.assertTrue(result["live_ok"])
            self.assertIn("live proof readiness: `5/5`", report)
            self.assertNotIn("Prompts and expert packs", report)


if __name__ == "__main__":
    unittest.main()

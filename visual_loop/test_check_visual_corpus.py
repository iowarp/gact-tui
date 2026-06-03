import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_visual_corpus


class VisualCorpusCheckTest(unittest.TestCase):
    def test_complete_manifest_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in check_visual_corpus.CORPUS_GROUPS:
                for rel in group.required:
                    path = root / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root)

        self.assertTrue(result["ok"])
        self.assertTrue(all(not group["missing"] for group in result["groups"]))

    def test_manifest_requires_clio_semantic_live_fixture(self) -> None:
        conversation = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "conversation_tools"
        )

        for rel in (
            "visual_loop/tapes/clio_semantic_live_events.tape",
            "visual_loop/screenshots/clio_semantic_live_events_running.png",
            "visual_loop/screenshots/clio_semantic_live_events_final.png",
        ):
            self.assertIn(rel, conversation.required)

    def test_manifest_requires_mcp_reconnect_visual_proof(self) -> None:
        conversation = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "conversation_tools"
        )

        for rel in (
            "visual_loop/tapes/semantic_mcp_reconnect.tape",
            "visual_loop/screenshots/semantic_mcp_reconnect_detail.png",
            "visual_loop/screenshots/semantic_mcp_reconnect_done.png",
        ):
            self.assertIn(rel, conversation.required)

    def test_manifest_requires_conversation_copy_visual_proof(self) -> None:
        conversation = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "conversation_tools"
        )

        for rel in (
            "visual_loop/tapes/semantic_detail_copy.tape",
            "visual_loop/screenshots/semantic_detail_copy.png",
            "visual_loop/tapes/semantic_conversation_block_copy.tape",
            "visual_loop/screenshots/semantic_conversation_block_copy.png",
            "visual_loop/tapes/semantic_conversation_footer_actions.tape",
            "visual_loop/screenshots/semantic_conversation_footer_actions.png",
        ):
            self.assertIn(rel, conversation.required)

    def test_manifest_requires_agent_blueprint_lifecycle_visual_proof(self) -> None:
        marketplace = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "marketplace_blueprints"
        )

        for rel in (
            "visual_loop/tapes/semantic_agent_blueprint_management.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_install.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_updated.png",
        ):
            self.assertIn(rel, marketplace.required)

    def test_manifest_requires_agent_blueprint_source_visual_proof(self) -> None:
        marketplace = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "marketplace_blueprints"
        )

        for rel in (
            "visual_loop/tapes/semantic_agent_blueprint_sources.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png",
            "visual_loop/tapes/semantic_agent_blueprint_commands.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_commands_palette.png",
        ):
            self.assertIn(rel, marketplace.required)

    def test_missing_or_empty_artifacts_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = check_visual_corpus.CORPUS_GROUPS[0]
            empty = root / first.required[0]
            empty.parent.mkdir(parents=True, exist_ok=True)
            empty.write_text("", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root)

        self.assertFalse(result["ok"])
        first_group = result["groups"][0]
        self.assertIn(first.required[0] + " (empty)", first_group["missing"])
        self.assertIn(first.required[1] + " (missing)", first_group["missing"])

    def test_untracked_required_artifacts_fail_when_tracked_set_is_provided(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = check_visual_corpus.CORPUS_GROUPS[0]
            for rel in first.required:
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("artifact\n", encoding="utf-8")

            missing = check_visual_corpus.check_group(root, first, tracked={first.required[0]})

        self.assertNotIn(first.required[0] + " (untracked)", missing)
        self.assertIn(first.required[1] + " (untracked)", missing)

    def test_strict_live_pass_gate_requires_pass_verdict(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in check_visual_corpus.CORPUS_GROUPS:
                for rel in group.required:
                    path = root / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("artifact\n", encoding="utf-8")
            strict = root / check_visual_corpus.STRICT_LIVE_REPORTS[0]
            strict.write_text("- verdict: `FAIL`\n", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root, require_strict_live_pass=True)

            strict_result = result["strict_live_pass"]
            self.assertFalse(result["ok"])
            self.assertFalse(strict_result["ok"])
            self.assertEqual(strict_result["status"], "not passing")
            self.assertEqual(strict_result["reports"][0]["verdict"], "FAIL")

            strict.write_text("- verdict: `PASS`\n", encoding="utf-8")
            result = check_visual_corpus.check_corpus(root, require_strict_live_pass=True)

        self.assertTrue(result["ok"])
        self.assertTrue(result["strict_live_pass"]["ok"])

    def test_strict_live_pass_gate_reports_missing_verdict(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in check_visual_corpus.CORPUS_GROUPS:
                for rel in group.required:
                    path = root / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root, require_strict_live_pass=True)

        self.assertFalse(result["ok"])
        self.assertEqual(result["strict_live_pass"]["status"], "not passing")
        self.assertEqual(result["strict_live_pass"]["reports"][0]["verdict"], "missing")

    def test_strict_live_pass_gate_reports_missing_temporal_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in check_visual_corpus.CORPUS_GROUPS:
                for rel in group.required:
                    path = root / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("artifact\n", encoding="utf-8")
            strict = root / check_visual_corpus.STRICT_LIVE_REPORTS[0]
            strict.write_text(
                "\n".join(
                    [
                        "# Live Observability Temporal Assertion",
                        "",
                        "- verdict: `FAIL`",
                        "",
                        "## Missing Before Completion",
                        "",
                        "- parent_resumed",
                        "",
                        "## Runtime Provenance Agreement",
                        "",
                        "- verdict: `FAIL`",
                        "- runtime_provenance missing",
                    ]
                ),
                encoding="utf-8",
            )

            result = check_visual_corpus.check_corpus(root, require_strict_live_pass=True)

        report = result["strict_live_pass"]["reports"][0]
        self.assertEqual(report["verdict"], "FAIL")
        self.assertEqual(report["missing"], ["parent_resumed", "runtime_provenance missing"])

    def test_strict_live_pass_gate_ignores_matched_runtime_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in check_visual_corpus.CORPUS_GROUPS:
                for rel in group.required:
                    path = root / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("artifact\n", encoding="utf-8")
            strict = root / check_visual_corpus.STRICT_LIVE_REPORTS[0]
            strict.write_text(
                "\n".join(
                    [
                        "# Live Observability Temporal Assertion",
                        "",
                        "- verdict: `PASS`",
                        "",
                        "## Runtime Provenance Agreement",
                        "",
                        "- verdict: `PASS`",
                        "- matched:",
                        "  - observed tools: NdpSearchDatasets",
                        "  - parent resume: data->ndp_catalog",
                    ]
                ),
                encoding="utf-8",
            )

            result = check_visual_corpus.check_corpus(root, require_strict_live_pass=True)

        report = result["strict_live_pass"]["reports"][0]
        self.assertEqual(report["verdict"], "PASS")
        self.assertEqual(report["missing"], [])

    def test_release_checklist_runs_strict_tracked_visual_gate(self) -> None:
        checklist = (
            Path(__file__).resolve().parents[1]
            / "docs"
            / "TUI_ONE_ZERO_RELEASE_CHECKLIST.md"
        ).read_text(encoding="utf-8")

        expected = (
            "python3 visual_loop/check_visual_corpus.py --root . "
            "--require-git-tracked --require-strict-live-pass"
        )
        self.assertGreaterEqual(checklist.count(expected), 2)

    def test_release_checklist_requires_terminal_selection_diag_evidence(self) -> None:
        checklist = (
            Path(__file__).resolve().parents[1]
            / "docs"
            / "TUI_ONE_ZERO_RELEASE_CHECKLIST.md"
        ).read_text(encoding="utf-8")

        for expected in (
            "gact diag",
            "clipboard_native",
            "clipboard_missing",
            "clipboard_osc52",
            "terminal_selection",
            "TERM",
            "TERM_PROGRAM",
            "/mouse",
            "native terminal text selection",
        ):
            self.assertIn(expected, checklist)


if __name__ == "__main__":
    unittest.main()

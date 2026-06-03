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

    def test_manifest_requires_sidebar_layout_file_picker_and_runtime_proof(self) -> None:
        sidebars = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "sidebars_context_files"
        )

        for rel in (
            "visual_loop/tapes/semantic_sidebar_layout_settings.tape",
            "visual_loop/screenshots/semantic_sidebar_layout_settings.png",
            "visual_loop/tapes/semantic_right_sidebar_layout.tape",
            "visual_loop/screenshots/semantic_right_sidebar_layout.png",
            "visual_loop/tapes/semantic_file_picker.tape",
            "visual_loop/screenshots/semantic_file_picker.png",
            "visual_loop/screenshots/semantic_file_picker_tree_expanded.png",
            "visual_loop/tapes/agent_runtime_sidebar.tape",
            "visual_loop/screenshots/agent_runtime_sidebar.png",
        ):
            self.assertIn(rel, sidebars.required)

    def test_manifest_requires_text_entry_and_footer_action_visual_proof(self) -> None:
        modals = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "questions_retry_permissions"
        )

        for rel in (
            "visual_loop/tapes/semantic_text_entry_modals.tape",
            "visual_loop/screenshots/semantic_rename_modal.png",
            "visual_loop/screenshots/semantic_context_add_modal.png",
            "visual_loop/tapes/semantic_compose_modal.tape",
            "visual_loop/screenshots/semantic_compose_modal.png",
            "visual_loop/tapes/semantic_sidebar_footer_actions.tape",
            "visual_loop/screenshots/semantic_sidebar_footer_actions.png",
        ):
            self.assertIn(rel, modals.required)

    def test_manifest_requires_shared_menu_surface_visual_proof(self) -> None:
        menus = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "shared_menu_surfaces"
        )

        for rel in (
            "visual_loop/tapes/semantic_menu_smoke.tape",
            "visual_loop/screenshots/semantic_menu_help_commands.png",
            "visual_loop/screenshots/semantic_menu_settings_tui.png",
            "visual_loop/screenshots/semantic_menu_metrics.png",
            "visual_loop/screenshots/semantic_menu_tools_catalog.png",
            "visual_loop/screenshots/semantic_menu_tool_detail.png",
            "visual_loop/screenshots/semantic_menu_doctor_health.png",
            "visual_loop/screenshots/semantic_menu_doctor_capabilities.png",
        ):
            self.assertIn(rel, menus.required)

    def test_manifest_requires_semantic_interaction_visual_proof(self) -> None:
        interactions = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "semantic_interactions"
        )

        for rel in (
            "visual_loop/tapes/semantic_palette.tape",
            "visual_loop/screenshots/semantic_palette_commands.png",
            "visual_loop/screenshots/semantic_palette_search.png",
            "visual_loop/tapes/semantic_permission_banner.tape",
            "visual_loop/screenshots/semantic_permission_banner.png",
            "visual_loop/tapes/semantic_startup_intro.tape",
            "visual_loop/screenshots/semantic_startup_intro.png",
            "visual_loop/tapes/semantic_startup_connecting.tape",
            "visual_loop/screenshots/semantic_startup_connecting.png",
            "visual_loop/tapes/semantic_startup_error.tape",
            "visual_loop/screenshots/semantic_startup_error.png",
            "visual_loop/tapes/semantic_workspace_switch.tape",
            "visual_loop/screenshots/semantic_workspace_header_root.png",
            "visual_loop/screenshots/semantic_workspace_switch.png",
            "visual_loop/screenshots/semantic_workspace_create_form.png",
            "visual_loop/tapes/semantic_mcp_install.tape",
            "visual_loop/screenshots/semantic_mcp_install.png",
            "visual_loop/tapes/semantic_mcp_remove.tape",
            "visual_loop/screenshots/semantic_mcp_remove.png",
            "visual_loop/tapes/semantic_context_actions.tape",
            "visual_loop/screenshots/semantic_context_actions.png",
            "visual_loop/tapes/semantic_diff_actions.tape",
            "visual_loop/screenshots/semantic_diff_actions.png",
            "visual_loop/tapes/semantic_session_actions.tape",
            "visual_loop/screenshots/semantic_session_actions.png",
            "visual_loop/tapes/semantic_memory_inspector.tape",
            "visual_loop/screenshots/semantic_memory_palette.png",
            "visual_loop/screenshots/semantic_memory_inspector.png",
            "visual_loop/tapes/semantic_sidebar_filter.tape",
            "visual_loop/screenshots/semantic_sidebar_filter.png",
            "visual_loop/tapes/semantic_quit_confirm.tape",
            "visual_loop/screenshots/semantic_quit_confirm.png",
        ):
            self.assertIn(rel, interactions.required)

    def test_manifest_requires_live_clio_replay_catalog_memory_and_state_proof(self) -> None:
        replay = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "benchmark_live_replay"
        )

        for rel in (
            "visual_loop/tapes/live_clio_ndp_top.tape",
            "visual_loop/screenshots/live_clio_ndp_top.png",
            "visual_loop/screenshots/live_clio_ndp_tool_selection.png",
            "visual_loop/tapes/live_clio_catalogs.tape",
            "visual_loop/screenshots/live_clio_agents_catalog.png",
            "visual_loop/screenshots/live_clio_agent_detail.png",
            "visual_loop/screenshots/live_clio_tools_catalog.png",
            "visual_loop/screenshots/live_clio_tool_catalog_detail.png",
            "visual_loop/screenshots/live_clio_mcp_catalog.png",
            "visual_loop/screenshots/live_clio_mcp_detail.png",
            "visual_loop/tapes/live_clio_catalogs_narrow.tape",
            "visual_loop/screenshots/live_clio_tools_catalog_narrow.png",
            "visual_loop/screenshots/live_clio_tool_detail_narrow.png",
            "visual_loop/tapes/live_clio_memory.tape",
            "visual_loop/screenshots/live_clio_memory_palette.png",
            "visual_loop/screenshots/live_clio_memory_inspector.png",
            "visual_loop/tapes/live_clio_memory_pressure.tape",
            "visual_loop/screenshots/live_clio_memory_pressure.png",
            "visual_loop/tapes/live_clio_artifacts.tape",
            "visual_loop/screenshots/live_clio_artifact_transcript.png",
            "visual_loop/screenshots/live_clio_artifact_detail.png",
            "visual_loop/tapes/live_clio_compaction.tape",
            "visual_loop/screenshots/live_clio_compaction_top.png",
            "visual_loop/screenshots/live_clio_compaction_detail.png",
            "visual_loop/screenshots/live_clio_compaction_bottom.png",
            "visual_loop/tapes/live_clio_state_markers.tape",
            "visual_loop/screenshots/live_clio_provider_swap_top.png",
            "visual_loop/screenshots/live_clio_provider_swap_bottom.png",
        ):
            self.assertIn(rel, replay.required)

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

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_visual_corpus


def refresh_missing_capture_report(root: Path) -> None:
    result = {
        "missing_capture_ledger": check_visual_corpus.check_missing_capture_ledger(root),
    }
    report = root / check_visual_corpus.MISSING_CAPTURE_REPORT
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(check_visual_corpus.render_missing_capture_report(result), encoding="utf-8")


def seed_complete_corpus(root: Path) -> None:
    for group in check_visual_corpus.CORPUS_GROUPS:
        for rel in group.required:
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("artifact\n", encoding="utf-8")
    coverage = root / "visual_loop/COVERAGE.md"
    coverage.parent.mkdir(parents=True, exist_ok=True)
    coverage.write_text("# Coverage\n", encoding="utf-8")
    preserved = root / "visual_loop/PRESERVED_CAPTURES.md"
    preserved.write_text("# Preserved\n", encoding="utf-8")
    slash_commands = root / "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md"
    slash_commands.write_text(
        "# Slash Command Visual Coverage\n\n"
        "## Canonical Commands\n\n"
        "| Command | Area | Representative visual proof | Deferred command-specific captures |\n"
        "| --- | --- | --- | --- |\n"
        "| `/clear` | Session | shared proof | None |\n"
        "| `/permissions` | Diagnostics | shared proof | None |\n"
        "\n"
        "## Hidden Or Folded Commands\n\n"
        "| Command | Operator treatment | Visual proof |\n"
        "| --- | --- | --- |\n"
        "| `/catalog` | Folded into `/tools` | palette proof |\n",
        encoding="utf-8",
    )
    app_go = root / "tui/internal/ui/app.go"
    app_go.parent.mkdir(parents=True, exist_ok=True)
    app_go.write_text(
        '''
func (a *App) paletteMatches() []gact.Command {
	localCmds := []gact.Command{
		localCmd("/clear", "command.clear.title", "command.clear.desc"),
		{ID: "/permissions", Title: "Permissions", Source: "builtin"},
	}
	if a.caps.Capabilities.IntegrationHealth {
	}
}
var helpTabs = []struct { title string; keys []helpKey }{
	{
		title: "Commands",
		keys: []helpKey{
			{"/clear", "help.commands.clear"},
			{"/permissions", "help.commands.permissions"},
		},
	},
}
''',
        encoding="utf-8",
    )
    refresh_missing_capture_report(root)


class VisualCorpusCheckTest(unittest.TestCase):
    def test_complete_manifest_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)

            result = check_visual_corpus.check_corpus(root)

        self.assertTrue(result["ok"])
        self.assertTrue(all(not group["missing"] for group in result["groups"]))
        self.assertTrue(result["coverage_index"]["ok"])
        self.assertTrue(all(index["ok"] for index in result["artifact_indices"]))
        self.assertTrue(result["slash_command_coverage"]["ok"])

    def test_coverage_index_normalizes_tapes_and_screenshots(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            coverage = root / "visual_loop/COVERAGE.md"
            coverage.parent.mkdir(parents=True, exist_ok=True)
            coverage.write_text(
                "| Tape | Evidence |\n"
                "| --- | --- |\n"
                "| `semantic_palette.tape`, `visual_loop/tapes/live_clio_ndp.tape` | "
                "`semantic_palette_commands.png`, `visual_loop/screenshots/live.gif` |\n",
                encoding="utf-8",
            )

            artifacts = check_visual_corpus.coverage_index_artifacts(coverage)

        self.assertEqual(
            artifacts,
            (
                "visual_loop/screenshots/live.gif",
                "visual_loop/screenshots/semantic_palette_commands.png",
                "visual_loop/tapes/live_clio_ndp.tape",
                "visual_loop/tapes/semantic_palette.tape",
            ),
        )

    def test_coverage_index_missing_artifacts_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            coverage = root / "visual_loop/COVERAGE.md"
            coverage.parent.mkdir(parents=True, exist_ok=True)
            coverage.write_text("`semantic_palette.tape` `semantic_palette_commands.png`\n", encoding="utf-8")
            tape = root / "visual_loop/tapes/semantic_palette.tape"
            tape.parent.mkdir(parents=True, exist_ok=True)
            tape.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_coverage_index(root)

        self.assertFalse(result["ok"])
        self.assertEqual(result["referenced_count"], 2)
        self.assertIn(
            "visual_loop/screenshots/semantic_palette_commands.png (missing)",
            result["missing"],
        )

    def test_slash_command_drift_fails_corpus_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            app_go = root / "tui/internal/ui/app.go"
            app_go.write_text(
                app_go.read_text(encoding="utf-8").replace(
                    'localCmd("/clear", "command.clear.title", "command.clear.desc"),',
                    'localCmd("/clear", "command.clear.title", "command.clear.desc"),\n\t\tlocalCmd("/mode", "command.mode.title", "command.mode.desc"),',
                ),
                encoding="utf-8",
            )

            result = check_visual_corpus.check_corpus(root)

        self.assertFalse(result["ok"])
        self.assertFalse(result["slash_command_coverage"]["ok"])
        self.assertEqual(result["slash_command_coverage"]["missing_from_ledger"], ["/mode"])

    def test_visual_report_includes_slash_command_coverage_section(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)

            result = check_visual_corpus.check_corpus(root)

        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check_visual_corpus.print_text_report(result)
        report = buf.getvalue()
        self.assertIn("## slash_command_coverage", report)
        self.assertIn("- status: present", report)
        self.assertIn("- canonical commands: 2", report)

    def test_ndp_demo_readiness_is_reported_without_defaulting_corpus_to_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            ndp_report = root / "ndp_demo_four_cases.md"

            result = check_visual_corpus.check_corpus(root, ndp_report_path=ndp_report)

        self.assertTrue(result["ok"])
        self.assertFalse(result["ndp_demo_readiness"]["ok"])
        self.assertEqual(result["ndp_demo_readiness"]["summary"]["ready_for_real_demo"], 0)

        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check_visual_corpus.print_text_report(result)
        report = buf.getvalue()
        self.assertIn("## ndp_demo_readiness", report)
        self.assertIn("- status: informational; not required by this gate", report)
        self.assertIn("- streaming proof: 0/4", report)

    def test_ndp_demo_readiness_can_be_required_for_demo_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            ndp_report = root / "ndp_demo_four_cases.md"

            result = check_visual_corpus.check_corpus(
                root,
                require_ndp_demo_ready=True,
                ndp_report_path=ndp_report,
            )

        self.assertFalse(result["ok"])
        self.assertFalse(result["ndp_demo_readiness"]["ok"])
        self.assertTrue(result["ndp_demo_required"])

        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check_visual_corpus.print_text_report(result)
        report = buf.getvalue()
        self.assertIn("- status: not ready", report)
        self.assertIn("- missing: San Diego / EarthScope seismic waveform review", report)

    def test_missing_capture_ledger_is_reported_as_deferred_backlog(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            coverage = root / "visual_loop/COVERAGE.md"
            coverage.write_text(
                "# Coverage\n\n"
                "### Capture Ledger\n\n"
                "| Area | Missing capture | Why it matters | Priority |\n"
                "| --- | --- | --- | --- |\n"
                "| Copy and selection | Native mouse selection over conversation content (#150) | "
                "Highest-friction daily UX path | High |\n"
                "| Scientific demos | Four real NDP demo cases under live TUI execution (#149) | "
                "Real runs prove demo operability | High |\n",
                encoding="utf-8",
            )
            refresh_missing_capture_report(root)

            result = check_visual_corpus.check_corpus(root, require_indexed=True)

        self.assertTrue(result["ok"])
        ledger = result["missing_capture_ledger"]
        self.assertEqual(ledger["count"], 2)
        self.assertEqual(ledger["priorities"], {"High": 2})
        self.assertEqual(ledger["rows"][0]["area"], "Copy and selection")
        self.assertIn("Native mouse selection", ledger["rows"][0]["missing_capture"])

    def test_missing_capture_report_renders_ordered_operator_backlog(self) -> None:
        result = {
            "missing_capture_ledger": {
                "path": "visual_loop/COVERAGE.md",
                "count": 2,
                "priorities": {"Low": 1, "High": 1},
                "rows": [
                    {
                        "area": "Narrow modals",
                        "missing_capture": "Compact metrics modal",
                        "why_it_matters": "Prevents clipped text in narrow demos",
                        "priority": "Low",
                    },
                    {
                        "area": "Scientific demos",
                        "missing_capture": "Fresno CIMIS real TUI capture",
                        "why_it_matters": "Completes four-case NDP demo proof",
                        "priority": "High",
                    },
                ],
            }
        }

        report = check_visual_corpus.render_missing_capture_report(result)

        self.assertIn("# Missing Visual Captures", report)
        self.assertIn("source: `visual_loop/COVERAGE.md`", report)
        self.assertLess(report.index("### High - Scientific demos"), report.index("### Low - Narrow modals"))
        self.assertIn("Fresno CIMIS real TUI capture", report)

    def test_missing_capture_report_sync_fails_stale_generated_backlog(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            stale_report = root / check_visual_corpus.MISSING_CAPTURE_REPORT
            stale_report.write_text("# stale\n", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root)

        self.assertFalse(result["ok"])
        self.assertEqual(result["missing_capture_report"]["state"], "stale")

    def test_missing_capture_report_sync_passes_current_generated_backlog(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)

            result = check_visual_corpus.check_corpus(root)

        self.assertTrue(result["ok"])
        self.assertEqual(result["missing_capture_report"]["state"], "current")

    def test_visual_report_includes_missing_capture_report_sync_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)

            result = check_visual_corpus.check_corpus(root)

        import contextlib
        import io

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check_visual_corpus.print_text_report(result)
        report = buf.getvalue()
        self.assertIn("## missing_capture_report", report)
        self.assertIn("- status: current", report)

    def test_unindexed_artifacts_report_existing_files_outside_manifest_and_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            extra = root / "visual_loop/screenshots/operator_gap.png"
            extra.parent.mkdir(parents=True, exist_ok=True)
            extra.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_unindexed_artifacts(root)

        self.assertFalse(result["ok"])
        self.assertIn("visual_loop/screenshots/operator_gap.png", result["unindexed"])

    def test_unindexed_artifacts_ignore_files_referenced_by_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            coverage = root / "visual_loop/COVERAGE.md"
            coverage.write_text("`operator_gap.tape` `operator_gap.png`\n", encoding="utf-8")
            for rel in (
                "visual_loop/tapes/operator_gap.tape",
                "visual_loop/screenshots/operator_gap.png",
            ):
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_unindexed_artifacts(root)

        self.assertTrue(result["ok"])
        self.assertEqual(result["unindexed"], [])

    def test_unindexed_artifacts_ignore_files_referenced_by_preserved_captures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            preserved = root / "visual_loop/PRESERVED_CAPTURES.md"
            preserved.write_text("`operator_gap.tape` `operator_gap.png`\n", encoding="utf-8")
            for rel in (
                "visual_loop/tapes/operator_gap.tape",
                "visual_loop/screenshots/operator_gap.png",
            ):
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_unindexed_artifacts(root)

        self.assertTrue(result["ok"])
        self.assertEqual(result["unindexed"], [])

    def test_unindexed_artifacts_ignore_files_referenced_by_slash_command_ledger(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            slash_commands = root / "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md"
            slash_commands.write_text("`operator_gap.tape` `operator_gap.png`\n", encoding="utf-8")
            for rel in (
                "visual_loop/tapes/operator_gap.tape",
                "visual_loop/screenshots/operator_gap.png",
            ):
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_unindexed_artifacts(root)

        self.assertTrue(result["ok"])
        self.assertEqual(result["unindexed"], [])

    def test_preserved_capture_index_missing_artifacts_fail_corpus(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            preserved = root / "visual_loop/PRESERVED_CAPTURES.md"
            preserved.write_text("`operator_gap.png`\n", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root)

        self.assertFalse(result["ok"])
        preserved_index = next(
            index for index in result["artifact_indices"] if index["path"] == "visual_loop/PRESERVED_CAPTURES.md"
        )
        self.assertFalse(preserved_index["ok"])
        self.assertIn("visual_loop/screenshots/operator_gap.png (missing)", preserved_index["missing"])

    def test_require_tracked_enforces_primary_non_gif_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            coverage = root / "visual_loop/COVERAGE.md"
            coverage.parent.mkdir(parents=True, exist_ok=True)
            coverage.write_text("`operator_gap.png` `operator_motion.gif`\n", encoding="utf-8")
            screenshots = root / "visual_loop/screenshots"
            screenshots.mkdir(parents=True, exist_ok=True)
            (screenshots / "operator_gap.png").write_text("artifact\n", encoding="utf-8")
            (screenshots / "operator_motion.gif").write_text("gif\n", encoding="utf-8")

            result = check_visual_corpus.check_artifact_index(root, "visual_loop/COVERAGE.md", tracked=set())

        self.assertFalse(result["ok"])
        self.assertIn("visual_loop/screenshots/operator_gap.png (untracked)", result["missing"])
        self.assertNotIn("visual_loop/screenshots/operator_motion.gif (untracked)", result["missing"])

    def test_preserved_capture_index_is_not_git_tracking_required(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            preserved = root / "visual_loop/PRESERVED_CAPTURES.md"
            preserved.parent.mkdir(parents=True, exist_ok=True)
            preserved.write_text("`operator_gap.png`\n", encoding="utf-8")
            screenshot = root / "visual_loop/screenshots/operator_gap.png"
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            screenshot.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_artifact_indices(root, tracked=set())

        preserved_index = next(
            index for index in result if index["path"] == "visual_loop/PRESERVED_CAPTURES.md"
        )
        self.assertTrue(preserved_index["ok"])
        self.assertEqual(preserved_index["missing"], [])

    def test_require_indexed_turns_unindexed_report_into_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
            extra = root / "visual_loop/tapes/operator_gap.tape"
            extra.parent.mkdir(parents=True, exist_ok=True)
            extra.write_text("artifact\n", encoding="utf-8")

            soft = check_visual_corpus.check_corpus(root)
            strict = check_visual_corpus.check_corpus(root, require_indexed=True)

        self.assertTrue(soft["ok"])
        self.assertFalse(soft["unindexed_artifacts"]["ok"])
        self.assertFalse(strict["ok"])
        self.assertIn("visual_loop/tapes/operator_gap.tape", strict["unindexed_artifacts"]["unindexed"])

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

    def test_manifest_requires_staged_streaming_semantic_proof(self) -> None:
        conversation = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "conversation_tools"
        )

        for rel in (
            "visual_loop/tapes/semantic_live_events.tape",
            "visual_loop/screenshots/semantic_live_events_thinking.png",
            "visual_loop/screenshots/semantic_live_events_tool_started.png",
            "visual_loop/screenshots/semantic_live_events_tool_result.png",
            "visual_loop/screenshots/semantic_live_events_final.png",
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

    def test_manifest_requires_session_summary_visual_proof(self) -> None:
        conversation = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "conversation_tools"
        )

        for rel in (
            "visual_loop/tapes/semantic_session_summary.tape",
            "visual_loop/screenshots/semantic_session_summary.png",
        ):
            self.assertIn(rel, conversation.required)

    def test_manifest_requires_semantic_trace_readability_and_revisit_proof(self) -> None:
        conversation = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "conversation_tools"
        )

        for rel in (
            "visual_loop/tapes/semantic_event_detail.tape",
            "visual_loop/screenshots/semantic_event_detail.png",
            "visual_loop/screenshots/semantic_event_detail_evidence.png",
            "visual_loop/tapes/semantic_workflow_state_event.tape",
            "visual_loop/screenshots/semantic_workflow_state_event_inline.png",
            "visual_loop/screenshots/semantic_workflow_state_event_detail.png",
            "visual_loop/screenshots/semantic_workflow_state_event_final.png",
            "visual_loop/tapes/semantic_blocker_handoff.tape",
            "visual_loop/screenshots/semantic_blocker_handoff_inline.png",
            "visual_loop/screenshots/semantic_blocker_handoff_detail.png",
            "visual_loop/screenshots/semantic_blocker_handoff_final.png",
            "visual_loop/tapes/semantic_provider_failure_event.tape",
            "visual_loop/screenshots/semantic_provider_failure_inline.png",
            "visual_loop/screenshots/semantic_provider_failure_detail.png",
            "visual_loop/tapes/semantic_trace_revisit_stability.tape",
            "visual_loop/screenshots/semantic_trace_revisit_before.png",
            "visual_loop/screenshots/semantic_trace_revisit_other_session.png",
            "visual_loop/screenshots/semantic_trace_revisit_after.png",
            "visual_loop/tapes/semantic_redacted_tool_args.tape",
            "visual_loop/screenshots/semantic_redacted_tool_args_started.png",
            "visual_loop/screenshots/semantic_redacted_tool_args_completed.png",
            "visual_loop/screenshots/semantic_redacted_tool_args_detail.png",
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
            "visual_loop/tapes/semantic_agent_blueprint_active_marker.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_active_marker_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_active_marker_detail.png",
            "visual_loop/tapes/semantic_agent_blueprint_management.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_install.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_installed.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_delete_confirm.png",
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
            "visual_loop/screenshots/semantic_agent_blueprint_sources_registry.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_add_source.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_added.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_remove_confirm.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_install_row.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_installed.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png",
            "visual_loop/tapes/semantic_agent_blueprint_commands.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_commands_palette.png",
        ):
            self.assertIn(rel, marketplace.required)

    def test_manifest_requires_agent_blueprint_failure_and_tree_visual_proof(self) -> None:
        marketplace = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "marketplace_blueprints"
        )

        for rel in (
            "visual_loop/tapes/semantic_agent_blueprint_failures.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_validation_warning.png",
            "visual_loop/screenshots/semantic_agent_blueprint_validation_error.png",
            "visual_loop/screenshots/semantic_agent_blueprint_install_failure.png",
            "visual_loop/screenshots/semantic_agent_blueprint_update_failure.png",
            "visual_loop/screenshots/semantic_agent_blueprint_delete_failure.png",
            "visual_loop/screenshots/semantic_agent_blueprint_source_refresh_failure.png",
            "visual_loop/tapes/semantic_agent_blueprint_tree_stress.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_sources.png",
            "visual_loop/tapes/semantic_agent_blueprint_tree_stress_narrow.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_tree_stress_narrow_detail.png",
            "visual_loop/tapes/codex_blueprint_catalog_uiux.tape",
            "visual_loop/screenshots/codex_blueprint_catalog_uiux.png",
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
            "visual_loop/screenshots/semantic_file_viewer_module_upload.png",
            "visual_loop/tapes/agent_runtime_sidebar.tape",
            "visual_loop/screenshots/agent_runtime_sidebar.png",
            "visual_loop/tapes/semantic_context_detail.tape",
            "visual_loop/screenshots/semantic_context_row_selected.png",
            "visual_loop/screenshots/semantic_context_detail.png",
        ):
            self.assertIn(rel, sidebars.required)

    def test_manifest_requires_settings_agent_compact_visual_proof(self) -> None:
        settings = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "settings_provider"
        )

        for rel in (
            "visual_loop/tapes/semantic_settings_agent_compact.tape",
            "visual_loop/screenshots/semantic_settings_agent_compact.png",
        ):
            self.assertIn(rel, settings.required)

    def test_manifest_requires_provider_settings_edge_and_narrow_visual_proof(self) -> None:
        settings = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "settings_provider"
        )

        for rel in (
            "visual_loop/tapes/semantic_settings_agent_long.tape",
            "visual_loop/screenshots/semantic_settings_agent_long_top.png",
            "visual_loop/screenshots/semantic_settings_agent_long_scrolled.png",
            "visual_loop/screenshots/semantic_settings_agent_long_detail.png",
            "visual_loop/tapes/semantic_provider_edge_states.tape",
            "visual_loop/screenshots/semantic_provider_edge_catalog.png",
            "visual_loop/screenshots/semantic_provider_edge_auth_required.png",
            "visual_loop/screenshots/semantic_provider_edge_auth_failure.png",
            "visual_loop/tapes/semantic_provider_auth_success.tape",
            "visual_loop/screenshots/semantic_provider_auth_success_before.png",
            "visual_loop/screenshots/semantic_provider_auth_success_after.png",
            "visual_loop/tapes/semantic_theme_cycle.tape",
            "visual_loop/screenshots/semantic_theme_cycle_before.png",
            "visual_loop/screenshots/semantic_theme_cycle_next.png",
            "visual_loop/screenshots/semantic_theme_cycle_prev.png",
            "visual_loop/tapes/semantic_narrow_deep_modals.tape",
            "visual_loop/screenshots/semantic_narrow_settings.png",
            "visual_loop/screenshots/semantic_narrow_provider_setup.png",
        ):
            self.assertIn(rel, settings.required)

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
            "visual_loop/tapes/semantic_header_actions.tape",
            "visual_loop/screenshots/semantic_header_actions_base.png",
            "visual_loop/screenshots/semantic_header_actions_help.png",
            "visual_loop/screenshots/semantic_header_actions_settings.png",
        ):
            self.assertIn(rel, menus.required)

    def test_manifest_requires_diagnostics_gap_and_report_proof(self) -> None:
        menus = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "shared_menu_surfaces"
        )

        for rel in (
            "visual_loop/tapes/semantic_doctor_gaps.tape",
            "visual_loop/screenshots/semantic_doctor_gaps.png",
            "visual_loop/screenshots/semantic_narrow_metrics.png",
            "visual_loop/screenshots/gact_diag_clipboard_terminal.report.md",
            "visual_loop/screenshots/diagnostics_readiness.report.md",
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
            "visual_loop/tapes/semantic_prompt_catalog.tape",
            "visual_loop/screenshots/semantic_prompt_catalog.png",
            "visual_loop/screenshots/semantic_prompt_profiles.png",
            "visual_loop/screenshots/semantic_prompt_detail.png",
            "visual_loop/screenshots/semantic_prompt_editor.png",
            "visual_loop/screenshots/semantic_prompt_saved.png",
            "visual_loop/tapes/semantic_sidebar_filter.tape",
            "visual_loop/screenshots/semantic_sidebar_filter.png",
            "visual_loop/tapes/semantic_quit_confirm.tape",
            "visual_loop/screenshots/semantic_quit_confirm.png",
        ):
            self.assertIn(rel, interactions.required)

    def test_manifest_requires_runtime_catalog_prompt_and_expert_pack_visual_proof(self) -> None:
        interactions = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "semantic_interactions"
        )

        for rel in (
            "visual_loop/tapes/semantic_tools_mcp_catalog.tape",
            "visual_loop/screenshots/semantic_tools_mcp_catalog.png",
            "visual_loop/screenshots/semantic_tools_mcp_tool_selected.png",
            "visual_loop/tapes/semantic_tools_action_detail.tape",
            "visual_loop/screenshots/semantic_tools_action_detail_catalog.png",
            "visual_loop/screenshots/semantic_tools_action_detail_builtin.png",
            "visual_loop/tapes/semantic_tools_mcp_disconnected.tape",
            "visual_loop/screenshots/semantic_tools_mcp_disconnected_catalog.png",
            "visual_loop/screenshots/semantic_tools_mcp_disconnected_selected.png",
            "visual_loop/tapes/semantic_tools_mcp_reconnect_failure.tape",
            "visual_loop/screenshots/semantic_tools_mcp_reconnect_failure.png",
            "visual_loop/tapes/semantic_tools_unavailable_tool.tape",
            "visual_loop/screenshots/semantic_tools_unavailable_tool.png",
            "visual_loop/tapes/semantic_tools_empty.tape",
            "visual_loop/screenshots/semantic_tools_empty.png",
            "visual_loop/screenshots/semantic_narrow_tools_mcp.png",
            "visual_loop/tapes/semantic_prompt_empty.tape",
            "visual_loop/screenshots/semantic_prompt_empty.png",
            "visual_loop/tapes/semantic_prompt_catalog_stress.tape",
            "visual_loop/screenshots/semantic_prompt_stress_catalog.png",
            "visual_loop/screenshots/semantic_prompt_stress_invalid_detail.png",
            "visual_loop/screenshots/semantic_prompt_stress_validation_render.png",
            "visual_loop/screenshots/semantic_prompt_stress_save_editor.png",
            "visual_loop/screenshots/semantic_prompt_stress_save_failure.png",
            "visual_loop/screenshots/semantic_narrow_prompts.png",
            "visual_loop/screenshots/semantic_narrow_prompt_detail.png",
            "visual_loop/tapes/semantic_expert_packs.tape",
            "visual_loop/screenshots/semantic_expert_packs_catalog.png",
            "visual_loop/screenshots/semantic_expert_packs_detail.png",
            "visual_loop/tapes/semantic_expert_packs_empty.tape",
            "visual_loop/screenshots/semantic_expert_packs_empty.png",
            "visual_loop/tapes/semantic_expert_packs_stress.tape",
            "visual_loop/screenshots/semantic_expert_packs_stress_catalog.png",
            "visual_loop/screenshots/semantic_expert_packs_stress_detail.png",
            "visual_loop/screenshots/semantic_expert_packs_source_provenance.png",
            "visual_loop/screenshots/semantic_expert_packs_update_failure.png",
            "visual_loop/screenshots/semantic_expert_packs_delete_confirm.png",
            "visual_loop/screenshots/semantic_expert_packs_delete_failure.png",
            "visual_loop/tapes/semantic_expert_packs_install_failure.tape",
            "visual_loop/screenshots/semantic_expert_packs_install_source.png",
            "visual_loop/screenshots/semantic_expert_packs_install_failure.png",
            "visual_loop/screenshots/semantic_narrow_expert_packs.png",
            "visual_loop/screenshots/semantic_narrow_expert_pack_detail.png",
        ):
            self.assertIn(rel, interactions.required)

    def test_manifest_requires_agent_management_visual_proof(self) -> None:
        marketplace = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "marketplace_blueprints"
        )

        for rel in (
            "visual_loop/tapes/semantic_agent_management.tape",
            "visual_loop/screenshots/semantic_agent_management_catalog.png",
            "visual_loop/screenshots/semantic_agent_management_create.png",
            "visual_loop/screenshots/semantic_agent_management_extract.png",
            "visual_loop/screenshots/semantic_agent_management_detail.png",
            "visual_loop/screenshots/semantic_agent_management_clone.png",
            "visual_loop/screenshots/semantic_agent_management_cloned.png",
            "visual_loop/screenshots/semantic_agent_management_edit.png",
            "visual_loop/screenshots/semantic_agent_management_updated.png",
            "visual_loop/screenshots/semantic_agent_management_deleted.png",
        ):
            self.assertIn(rel, marketplace.required)

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

    def test_manifest_requires_remote_alcf_provider_and_sidebar_replay_proof(self) -> None:
        remote = next(
            group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "remote_alcf_replay"
        )

        for rel in (
            "visual_loop/tapes/live_alcf_20260525_provider_swap.tape",
            "visual_loop/screenshots/live_alcf_20260525_provider_swap_top.png",
            "visual_loop/screenshots/live_alcf_20260525_provider_swap_bottom.png",
            "visual_loop/tapes/live_alcf_20260525_sidebar_sections.tape",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_header_focused.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_collapsed.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_context_focused.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sections_collapsed.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sections_expanded.png",
        ):
            self.assertIn(rel, remote.required)

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
            seed_complete_corpus(root)
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

    def test_temporal_observability_requires_diag_clipboard_report(self) -> None:
        temporal = next(group for group in check_visual_corpus.CORPUS_GROUPS if group.name == "temporal_observability")

        self.assertIn("visual_loop/screenshots/gact_diag_clipboard_terminal.report.md", temporal.required)

    def test_strict_live_pass_gate_reports_missing_verdict(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)

            result = check_visual_corpus.check_corpus(root, require_strict_live_pass=True)

        self.assertFalse(result["ok"])
        self.assertEqual(result["strict_live_pass"]["status"], "not passing")
        self.assertEqual(result["strict_live_pass"]["reports"][0]["verdict"], "missing")

    def test_strict_live_pass_gate_reports_missing_temporal_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_complete_corpus(root)
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
            seed_complete_corpus(root)
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
            "--require-git-tracked --require-indexed --require-strict-live-pass"
        )
        self.assertGreaterEqual(checklist.count(expected), 2)

    def test_release_checklist_runs_slash_command_coverage_tests(self) -> None:
        checklist = (
            Path(__file__).resolve().parents[1]
            / "docs"
            / "TUI_ONE_ZERO_RELEASE_CHECKLIST.md"
        ).read_text(encoding="utf-8")

        self.assertIn("visual_loop/test_check_slash_command_coverage.py", checklist)
        self.assertIn("slash-command", checklist)
        self.assertIn("SLASH_COMMAND_VISUAL_COVERAGE.md", checklist)

    def test_release_checklist_documents_ndp_demo_ready_gate(self) -> None:
        checklist = (
            Path(__file__).resolve().parents[1]
            / "docs"
            / "TUI_ONE_ZERO_RELEASE_CHECKLIST.md"
        ).read_text(encoding="utf-8")

        self.assertGreaterEqual(checklist.count("--require-ndp-demo-ready"), 2)
        self.assertIn("ndp_demo_readiness", checklist)
        self.assertIn("streaming proof", checklist)

    def test_release_checklist_requires_terminal_selection_diag_evidence(self) -> None:
        checklist = (
            Path(__file__).resolve().parents[1]
            / "docs"
            / "TUI_ONE_ZERO_RELEASE_CHECKLIST.md"
        ).read_text(encoding="utf-8")

        for expected in (
            "gact diag",
            "mouse_capture",
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

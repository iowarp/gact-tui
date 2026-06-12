# Preserved Visual Captures

This file indexes existing visual-loop artifacts that are useful enough to keep
but are not part of the primary coverage matrix in `COVERAGE.md` yet. Promote an
artifact from here into `COVERAGE.md` when it becomes representative proof for a
demo/operator surface. Remove an entry only when the underlying capture is
deleted deliberately.

## Preservation Rules

- Keep real CLIO/ALCF recordings when they show workflow behavior that a
  deterministic fixture cannot prove, even if the capture is not release-ready
  proof yet.
- Keep exploratory Codex/operator review captures when they document a UX issue,
  an accepted direction, or a before/after state that should remain easy to
  inspect.
- Add new useful-but-secondary tapes, screenshots, GIFs, JSONL timelines, and
  reports here before they drift as unindexed files.
- Promote captures into `COVERAGE.md` when they become the representative proof
  for a maintained view, modal, command, workflow, or release gate.
- Track missing future work in the `COVERAGE.md` "Missing Or Deferred" ledger,
  not by adding nonexistent artifact names here. Regenerate
  `MISSING_CAPTURES.md` from that ledger after changing priorities.

## Promotion Checklist

Before moving a preserved artifact into primary coverage, verify that it still
renders the intended state, that the matching tape or capture script is present
when the artifact is reproducible, and that any live proof has a manifest or
strict report when the release gate depends on streaming semantics.

## Codex Operator Review Captures

- `codex_help_operator_copy_scrolled.png`
- `codex_palette_operator_catalog_filter.png`
- `codex_palette_operator_catalog_group.png`
- `codex_palette_operator_mcp_filter.png`
- `codex_palette_operator_theme_filter.png`
- `codex_part_detail_labels.gif`
- `codex_semantic_timeline_final.png`
- `codex_semantic_timeline_thinking.png`
- `codex_semantic_timeline_tool_started.png`
- `codex_workspace_management_git_derived.png`
- `codex_workspace_management_switch.png`

## Issue-Specific Captures

- `issue56_file_mentions_composer.png`
- `issue56_file_mentions_sent.png`
- `issue57_ask_user_retry.gif`

## Live ALCF And CLIO Replay Extras

- `live_alcf_20260525_agent_detail.png`
- `live_alcf_20260525_agents_catalog.png`
- `live_alcf_20260525_catalogs.tape`
- `live_alcf_20260525_compaction_bottom.png`
- `live_alcf_20260525_compaction_top.png`
- `live_alcf_20260525_csv_failure_bottom.png`
- `live_alcf_20260525_csv_failure_top.png`
- `live_alcf_20260525_expected_errors.png`
- `live_alcf_20260525_mcp_catalog.png`
- `live_alcf_20260525_mcp_detail.png`
- `live_alcf_20260525_memory.tape`
- `live_alcf_20260525_memory_inspector.png`
- `live_alcf_20260525_memory_inspector_pagedown.png`
- `live_alcf_20260525_memory_palette.png`
- `live_alcf_20260525_nanoagents_collapsed.png`
- `live_alcf_20260525_nanoagents_expanded.png`
- `live_alcf_20260525_ndp_after_g.png`
- `live_alcf_20260525_ndp_bottom.png`
- `live_alcf_20260525_ndp_scrolled_up.png`
- `live_alcf_20260525_scatter_bottom.png`
- `live_alcf_20260525_scatter_partial.png`
- `live_alcf_20260525_scatter_partial_detail.png`
- `live_alcf_20260525_skills_catalog.png`
- `live_alcf_20260525_state_markers.tape`
- `live_alcf_20260525_tool_detail.png`
- `live_alcf_20260525_tools_catalog.png`
- `live_clio_child_sessions_expanded.png`
- `live_clio_ndp_detail.png`
- `live_clio_ndp_scrolled_up.png`

## Real NDP Demo Captures

- `ndp_tui_real_san_diego_earthscope_early.png`
- `ndp_tui_real_san_diego_earthscope_live.png`
- `ndp_tui_real_san_diego_earthscope_prompt.png`
- `ndp_tui_real_california_nws_warnings_early.png`
- `ndp_tui_real_california_nws_warnings_live.png`
- `ndp_tui_real_california_nws_warnings_prompt.png`
- `ndp_tui_real_california_nws_warnings_manifest.json`
- `ndp_tui_real_fresno_cimis_early.png`
- `ndp_tui_real_fresno_cimis_live.png`
- `ndp_tui_real_fresno_cimis_prompt.png`
- `ndp_tui_real_fresno_cimis_manifest.json`
- `ndp_tui_real_wildfire_early.png`
- `ndp_tui_real_wildfire_live.png`
- `ndp_tui_real_wildfire_prompt.png`

## Missing Real NDP Demo Captures

These are intentionally listed even though the files do not exist yet. They are
the remaining real-TUI recordings and streaming-clean manifests needed to prove
all four NDP demo cases under live agent execution. Deterministic fixture
captures already cover the rendering semantics for these workflows, and
prompt/early/live screenshots exist for all four cases.

- ndp_tui_real_san_diego_earthscope_manifest.json
- ndp_tui_real_san_diego_earthscope_short.gif
- ndp_tui_real_wildfire_manifest.json
- ndp_tui_real_wildfire_short.gif
- ndp_tui_real_california_nws_warnings_short.gif
- ndp_tui_real_california_nws_warnings_manifest.json without provider streaming limitation
- ndp_tui_real_fresno_cimis_short.gif
- ndp_tui_real_fresno_cimis_manifest.json without provider streaming limitation

## Semantic Fixture Companions And Extra States

- `agent_runtime_sidebar.gif`
- `semantic_agent_blueprint_active_marker_catalog.png`
- `semantic_agent_blueprint_commands.gif`
- `semantic_agent_blueprint_management.gif`
- `semantic_agent_blueprint_management_install_prefilled.png`
- `semantic_agent_blueprint_sources.gif`
- `semantic_agent_blueprint_sources_install_row.png`
- `semantic_agent_blueprint_sources_installed.png`
- `semantic_agent_catalog.png`
- `semantic_agent_management.gif`
- `semantic_agent_one_turn.png`
- `semantic_conversation_actions.gif`
- `semantic_conversation_footer_actions.gif`
- `semantic_context_actions.gif`
- `semantic_detail_copy.gif`
- `semantic_detail_drag_copy_done.png`
- `semantic_earthscope_tool_final.png`
- `semantic_earthscope_tool_started.png`
- `semantic_event_detail.gif`
- `semantic_header_actions.gif`
- `semantic_live_events.gif`
- `semantic_live_events_running.png`
- `semantic_long_transcript_scroll.gif`
- `semantic_mcp_connection_overview_detail.gif`
- `semantic_mcp_install.gif`
- `semantic_mcp_reconnect.gif`
- `semantic_mcp_remove.gif`
- `semantic_memory_inspector.gif`
- `semantic_memory_search.gif`
- `semantic_memory_search.png`
- `semantic_menu_help_global.png`
- `semantic_menu_mcp_connections.png`
- `semantic_menu_mcp_detail.png`
- `semantic_menu_mcp_source_selected.png`
- `semantic_menu_smoke.gif`
- `semantic_menu_tools_source_detail.png`
- `semantic_menu_tools_source_selected.png`
- `semantic_mouse_drag_copy_highlight.png`
- `semantic_ndp_feature_tool_final.png`
- `semantic_ndp_feature_tool_thinking.png`
- `semantic_palette.gif`
- `semantic_permission_banner.gif`
- `semantic_permissions_inspector.gif`
- `semantic_prompt_catalog.gif`
- `semantic_redacted_tool_args_final.png`
- `semantic_runtime_provenance_detail.gif`
- `semantic_runtime_surfaces_smoke.tape`
- `semantic_session_actions.gif`
- `semantic_session_summary.gif`
- `semantic_settings_lists.gif`
- `semantic_tools_mcp_catalog.gif`
- `semantic_workspace_startup_selected.png`
- `semantic_workspace_switch.gif`

## Strict Index Catch-Up

These artifacts are existing secondary captures that are intentionally preserved
so `check_visual_corpus.py --require-indexed` can be used as a real hygiene gate.
They remain secondary evidence unless promoted into `COVERAGE.md`.

- `agents_files_sidebar.gif`
- `clio_semantic_live_events.gif`
- `codex_blueprint_catalog_uiux.gif`
- `issue56_file_mentions.gif`
- `issue57_ask_user_retry.png`
- `live_alcf_20260525_catalogs.gif`
- `live_alcf_20260525_compaction.gif`
- `live_alcf_20260525_csv_failure.gif`
- `live_alcf_20260525_errors.gif`
- `live_alcf_20260525_failures.gif`
- `live_alcf_20260525_memory.gif`
- `live_alcf_20260525_nanoagents.gif`
- `live_alcf_20260525_ndp_scroll.gif`
- `live_alcf_20260525_provider_swap.gif`
- `live_alcf_20260525_scatter.gif`
- `live_alcf_20260525_sidebar_sections.gif`
- `live_alcf_20260525_state_markers.gif`
- `live_clio_artifacts.gif`
- `live_clio_catalogs.gif`
- `live_clio_catalogs_narrow.gif`
- `live_clio_compaction.gif`
- `live_clio_memory.gif`
- `live_clio_memory_pressure.gif`
- `live_clio_nanoagents.gif`
- `live_clio_ndp.gif`
- `live_clio_ndp_top.gif`
- `live_clio_provenance_detail.gif`
- `live_clio_sidebar_errors.gif`
- `live_clio_state_markers.gif`
- `live_observability_timeline.gif`
- `provider_modal_current.gif`
- `rewind_before_after.gif`
- `right_sidebar_full_height_regression.gif`
- `semantic_agent_blueprint_tree_stress.gif`
- `semantic_agent_management_stress.gif`
- `semantic_agent_one_turn.gif`
- `semantic_compose_modal.gif`
- `semantic_context_detail.gif`
- `semantic_conversation_block_copy.gif`
- `semantic_diff_actions.gif`
- `semantic_expert_packs_empty.gif`
- `semantic_expert_packs_stress.gif`
- `semantic_file_picker.gif`
- `semantic_file_viewer_module.gif`
- `semantic_narrow_deep_modals.gif`
- `semantic_prompt_catalog_stress.gif`
- `semantic_prompt_empty.gif`
- `semantic_quit_confirm.gif`
- `semantic_redacted_tool_args.gif`
- `semantic_right_sidebar_layout.gif`
- `semantic_sidebar_filter.gif`
- `semantic_sidebar_footer_actions.gif`
- `semantic_sidebar_layout_editor.gif`
- `semantic_sidebar_layout_settings.gif`
- `semantic_startup_connecting.gif`
- `semantic_startup_error.gif`
- `semantic_text_entry_modals.gif`
- `semantic_tools_empty.gif`
- `semantic_workflow_state_event.gif`
- `semantic_workflow_state_event_final.png`
- `semantic_workspace_files_live_refresh.gif`
- `semantic_workspace_files_refresh.gif`
- `semantic_workspace_startup_selected.gif`
- `connection_error_buttons.tape`
- `live_observability_timeline.tape`
- `right_sidebar_full_height_regression.tape`

## Release And Legacy Captures

- `release_07_tui_live_turn.tape`

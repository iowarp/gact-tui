# GACT TUI Visual Coverage

This file tracks the VHS visual-loop corpus. Treat the tapes, screenshots, and
GIFs as product evidence: keep them organized, preserve useful captures, and use
the missing-state backlog to decide what to fill next. The goal is not to
generate every permutation at once; it is to make the current demo/operator
coverage legible and make uncovered states obvious.

## How To Use This Index

- Tapes live in `visual_loop/tapes/`.
- Screenshots and GIFs live in `visual_loop/screenshots/`.
- Slash command coverage is tracked in `SLASH_COMMAND_VISUAL_COVERAGE.md` so
  command-specific gaps do not get buried in this broader matrix. The main
  corpus checker now audits that ledger against the palette and Help Commands
  so command drift fails the visual gate.
- Prefer deterministic emulator fixtures for repeatable UI work.
- Keep live CLIO/ALCF tapes when they capture real workflow shapes that emulator
  fixtures cannot prove.
- When a new operator surface is added, add one representative tape here and
  list deeper variants under "Missing Or Deferred".
- Prefer adding targeted missing-state rows over regenerating broad suites. A
  screenshot that captures a real operator concern is worth keeping even if it
  is not part of a complete matrix yet.

## Capture Priority

Use this order when deciding which missing tapes to add next:

1. Demo-critical live workflows and failures that affect tomorrow's operator
   walkthrough.
2. High-friction UX paths: copy/selection, scroll behavior, active blueprint
   state, workspace setup, install/update/delete lifecycle, and permission
   decisions.
3. Catalog and modal clarity for surfaces that operators must understand during
   a demo: blueprints, tools/MCP, prompts, agents, expert packs, settings.
4. Edge permutations, narrow terminal variants, and exhaustive tab coverage.

## Core Navigation And Shell

| Surface | Tape(s) | Representative evidence | Status |
| --- | --- | --- | --- |
| Startup intro | `semantic_startup_intro.tape` | `semantic_startup_intro.png`, `semantic_startup_intro.gif` | Covered |
| Connecting state | `semantic_startup_connecting.tape` | `semantic_startup_connecting.png` | Covered |
| Startup error | `semantic_startup_error.tape` | `semantic_startup_error.png` | Covered |
| Header actions | `semantic_header_actions.tape` | `semantic_header_actions_base.png`, `semantic_header_actions_help.png`, `semantic_header_actions_settings.png` | Covered |
| Slash command palette | `semantic_palette.tape`, `codex_palette_operator_surface.tape`, `semantic_palette_long_category.tape`, `semantic_narrow_operator_surfaces.tape` | `semantic_palette_commands.png`, `codex_palette_operator_default.png`, `codex_palette_operator_session_group.png`, `codex_palette_operator_catalog_group.png`, `codex_palette_operator_catalog_filter.png`, `codex_palette_operator_mcp_filter.png`, `codex_palette_operator_settings_group.png`, `codex_palette_operator_theme_filter.png`, `semantic_palette_long_category_top.png`, `semantic_palette_long_category_scrolled.png`, `semantic_narrow_palette.png` | Covered |
| Help/keybindings | `semantic_help_commands_operator.tape`, `semantic_menu_smoke.tape`, `semantic_narrow_help_keybindings.tape`, `codex_help_operator_copy.tape` | `semantic_menu_help_global.png`, `semantic_help_commands_operator.png`, `semantic_menu_help_permission.png`, `semantic_narrow_help_keybindings.png`, `semantic_narrow_help_commands.png`, `codex_help_operator_copy.png` | Covered |
| Quit confirmation | `semantic_quit_confirm.tape`, `codex_quit_operator_copy.tape` | `semantic_quit_confirm.png`, `codex_quit_operator_copy.png` | Covered |
| Main conversation actions | `semantic_conversation_actions.tape`, `semantic_conversation_footer_actions.tape`, `semantic_cancel_idle_state.tape`, `semantic_cancel_running_recovery.tape`, `semantic_cancel_failure.tape`, `semantic_duplicate_no_session.tape`, `semantic_duplicate_success.tape`, `semantic_duplicate_failure.tape`, `semantic_clear_no_session.tape`, `semantic_clear_confirm_and_cleared.tape`, `semantic_new_session_slash.tape`, `semantic_new_session_failure.tape`, `semantic_rename_failure.tape` | `semantic_conversation_actions.png`, `semantic_conversation_footer_actions.png`, `semantic_cancel_idle_state.png`, `semantic_cancel_running_before.png`, `semantic_cancel_running_recovery.png`, `semantic_cancel_failure.png`, `semantic_duplicate_no_session.png`, `semantic_duplicate_success.png`, `semantic_duplicate_failure.png`, `semantic_clear_no_session.png`, `semantic_clear_confirm.png`, `semantic_clear_cleared.png`, `semantic_new_session_slash.png`, `semantic_new_session_failure.png`, `semantic_rename_failure_modal.png`, `semantic_rename_failure_toast.png` | Covered |

## Session, Workspace, Sidebar, And Files

| Surface | Tape(s) | Representative evidence | Status |
| --- | --- | --- | --- |
| Session actions | `semantic_session_actions.tape`, `semantic_session_summary.tape` | `semantic_session_actions.png`, `semantic_session_summary.png` | Covered |
| Session/sidebar filtering | `semantic_sidebar_filter.tape`, `semantic_sessions_slash_filter.tape`, `semantic_sessions_slash_no_match.tape` | `semantic_sidebar_filter.png`, `semantic_sessions_slash_filter.png`, `semantic_sessions_slash_no_match.png` | Covered |
| Sidebar footer/actions | `semantic_sidebar_footer_actions.tape` | `semantic_sidebar_footer_actions.png` | Covered |
| Sidebar layout editor/settings | `semantic_sidebar_layout_editor.tape`, `semantic_sidebar_layout_settings.tape` | `semantic_sidebar_layout_editor_default.png`, `semantic_sidebar_layout_settings.png` | Covered |
| Right-sidebar layout | `semantic_right_sidebar_layout.tape` | `semantic_right_sidebar_layout.png` | Covered |
| Workflow/agent sidebar | `semantic_agent_workflow_sidebar.tape`, `agent_runtime_sidebar.tape`, `agents_files_sidebar.tape` | `semantic_agent_workflow_sidebar.png`, `agent_runtime_sidebar.png` | Covered |
| Workspace switch/create/remove | `semantic_workspace_switch.tape`, `semantic_workspace_files_refresh.tape`, `codex_workspace_management_uiux.tape`, `semantic_workspace_startup_selected.tape`, `semantic_workspace_create_failures.tape`, `semantic_workspace_remove_outcomes.tape`, `semantic_workspace_git_failure.tape` | `semantic_workspace_switch.png`, `semantic_workspace_files_refresh_before.png`, `semantic_workspace_files_refresh_after.png`, `codex_workspace_management_remove_current_blocked.png`, `codex_workspace_management_remove_confirm.png`, `codex_workspace_management_git.png`, `semantic_workspace_create_invalid_root.png`, `semantic_workspace_create_existing_conflict.png`, `semantic_workspace_remove_failure.png`, `semantic_workspace_remove_success.png`, `semantic_workspace_git_failure.png` | Covered |
| File picker | `semantic_file_picker.tape`, `issue56_file_mentions.tape` | `semantic_file_picker.png`, `issue56_file_mentions_picker.png` | Covered |
| File viewer/module | `semantic_file_viewer_module.tape`, `semantic_workspace_files_live_refresh.tape` | `semantic_file_viewer_module_initial.png`, `semantic_file_viewer_module_detail.png`, `semantic_file_viewer_module_upload.png`, `semantic_workspace_files_live_refresh_before.png`, `semantic_workspace_files_live_refresh_after.png` | Covered |
| Context actions/add/detail | `semantic_context_actions.tape`, `semantic_context_detail.tape`, `semantic_text_entry_modals.tape`, `semantic_add_no_session.tape`, `semantic_add_backend_failure.tape`, `semantic_drop_no_context.tape`, `semantic_drop_backend_failure.tape` | `semantic_context_actions.png`, `semantic_context_detail.png`, `semantic_context_add_modal.png`, `semantic_add_no_session.png`, `semantic_add_backend_failure.png`, `semantic_drop_no_context.png`, `semantic_drop_backend_failure.png` | Covered |

## Catalogs, Agents, Blueprints, And Runtime Surfaces

| Surface | Tape(s) | Representative evidence | Status |
| --- | --- | --- | --- |
| Tools and MCP unified catalog | `semantic_tools_mcp_catalog.tape`, `semantic_tools_action_detail.tape`, `semantic_tools_mcp_disconnected.tape`, `semantic_tools_mcp_reconnect_failure.tape`, `semantic_tools_unavailable_tool.tape`, `semantic_tools_empty.tape`, `semantic_menu_smoke.tape`, `semantic_narrow_operator_surfaces.tape` | `semantic_tools_mcp_catalog.png`, `semantic_tools_mcp_tool_selected.png`, `semantic_tools_action_detail_catalog.png`, `semantic_tools_action_detail_builtin.png`, `semantic_tools_mcp_disconnected_catalog.png`, `semantic_tools_mcp_disconnected_selected.png`, `semantic_tools_mcp_disconnected.gif`, `semantic_tools_mcp_reconnect_failure.png`, `semantic_tools_unavailable_tool.png`, `semantic_tools_empty.png`, `semantic_menu_tools_catalog.png`, `semantic_narrow_tools_mcp.png`, `semantic_narrow_operator_surfaces.gif`, `live_lifecycle_readiness.report.md` | Covered |
| MCP connection detail/install/remove/reconnect | `semantic_mcp_connection_overview_detail.tape`, `semantic_mcp_install.tape`, `semantic_mcp_remove.tape`, `semantic_mcp_remove_failure.tape`, `semantic_mcp_reconnect.tape` | `semantic_mcp_connection_overview_detail.png`, `semantic_mcp_install.png`, `semantic_mcp_remove.png`, `semantic_mcp_remove_confirm.png`, `semantic_mcp_remove_failure.png` | Covered |
| Skills catalog | `semantic_skills_catalog.tape`, `semantic_skills_empty.tape` | `semantic_skills_catalog.png`, `semantic_skills_empty.png`, `semantic_skills_empty.gif` | Covered |
| Prompts catalog/detail/editor/empty/stress | `semantic_prompt_catalog.tape`, `semantic_prompt_empty.tape`, `semantic_prompt_catalog_stress.tape`, `semantic_narrow_deep_modals.tape` | `semantic_prompt_catalog.png`, `semantic_prompt_detail.png`, `semantic_prompt_editor.png`, `semantic_prompt_empty.png`, `semantic_prompt_stress_catalog.png`, `semantic_prompt_stress_invalid_detail.png`, `semantic_prompt_stress_validation_render.png`, `semantic_prompt_stress_save_editor.png`, `semantic_prompt_stress_save_failure.png`, `semantic_narrow_prompts.png`, `semantic_narrow_prompt_detail.png` | Covered |
| Expert packs | `semantic_expert_packs.tape`, `semantic_expert_packs_empty.tape`, `semantic_expert_packs_stress.tape`, `semantic_expert_packs_install_failure.tape`, `semantic_narrow_deep_modals.tape` | `semantic_expert_packs_catalog.png`, `semantic_expert_packs_detail.png`, `semantic_expert_packs_empty.png`, `semantic_expert_packs_stress_catalog.png`, `semantic_expert_packs_stress_detail.png`, `semantic_expert_packs_source_provenance.png`, `semantic_expert_packs_update_failure.png`, `semantic_expert_packs_delete_confirm.png`, `semantic_expert_packs_delete_failure.png`, `semantic_expert_packs_install_source.png`, `semantic_expert_packs_install_failure.png`, `semantic_narrow_expert_packs.png`, `semantic_narrow_expert_pack_detail.png` | Covered |
| Agent management | `semantic_agent_management.tape`, `semantic_agent_one_turn.tape`, `semantic_agent_question_detail.tape`, `semantic_agent_management_stress.tape`, `semantic_agent_management_write_failures.tape` | `semantic_agent_management_catalog.png`, `semantic_agent_management_detail.png`, `semantic_agent_management_delete_confirm.png`, `semantic_agent_question_detail.png`, `semantic_agent_management_stress_catalog.png`, `semantic_agent_management_stress_scrolled.png`, `semantic_agent_management_invalid_detail.png`, `semantic_agent_management_stress_detail.png`, `semantic_agent_management_edit_failure.png`, `semantic_agent_management_delete_failure_confirm.png`, `semantic_agent_management_delete_failure.png`, `semantic_agent_management_create_failure.png`, `semantic_agent_management_extract_failure.png`, `semantic_agent_management_clone_failure.png` | Covered |
| Agent blueprint catalog/detail/sources/validate/install/update/delete confirmation | `semantic_agent_blueprint_active_marker.tape`, `semantic_agent_blueprint_management.tape`, `semantic_agent_blueprint_sources.tape`, `semantic_agent_blueprint_failures.tape`, `semantic_agent_blueprint_tree_stress.tape`, `semantic_agent_blueprint_tree_stress_narrow.tape`, `codex_blueprint_catalog_uiux.tape` | `semantic_agent_blueprint_active_marker_catalog.png`, `semantic_agent_blueprint_active_marker_detail.png`, `semantic_agent_blueprint_active_marker.gif`, `semantic_agent_blueprint_management_catalog.png`, `semantic_agent_blueprint_management_install.png`, `semantic_agent_blueprint_management_installed.png`, `semantic_agent_blueprint_management_validate.png`, `semantic_agent_blueprint_management_validation_detail.png`, `semantic_agent_blueprint_management_install_prefilled.png`, `semantic_agent_blueprint_management_workspace_detail.png`, `semantic_agent_blueprint_management_delete_confirm.png`, `semantic_agent_blueprint_management_updated.png`, `semantic_agent_blueprint_sources_registry.png`, `semantic_agent_blueprint_sources_add_source.png`, `semantic_agent_blueprint_sources_added.png`, `semantic_agent_blueprint_sources_remove_confirm.png`, `semantic_agent_blueprint_sources_install_row.png`, `semantic_agent_blueprint_sources_installed.png`, `semantic_agent_blueprint_validation_warning.png`, `semantic_agent_blueprint_validation_error.png`, `semantic_agent_blueprint_install_failure.png`, `semantic_agent_blueprint_update_failure.png`, `semantic_agent_blueprint_delete_failure.png`, `semantic_agent_blueprint_source_refresh_failure.png`, `semantic_agent_blueprint_tree_stress_catalog.png`, `semantic_agent_blueprint_tree_stress_detail.png`, `semantic_agent_blueprint_tree_stress_sources.png`, `semantic_agent_blueprint_tree_stress_narrow_catalog.png`, `semantic_agent_blueprint_tree_stress_narrow_detail.png`, `semantic_agent_blueprint_tree_stress_narrow.gif`, `codex_blueprint_catalog_uiux.png`, `agent_blueprint_marketplace_readiness.report.md` | Covered |
| Agent blueprint command palette entries | `semantic_agent_blueprint_commands.tape` | `semantic_agent_blueprint_commands_palette.png` | Covered |
| Permissions | `semantic_permission_banner.tape`, `semantic_permissions_inspector.tape`, `semantic_permissions_stress.tape`, `semantic_narrow_operator_surfaces.tape` | `semantic_permission_banner.png`, `semantic_permissions_inspector.png`, `semantic_permissions_inspector_denied.png`, `semantic_permissions_stress_pending.png`, `semantic_permissions_stress_policy_conflict.png`, `semantic_permissions_stress_allow_session.png`, `semantic_permissions_stress_allow_workspace.png`, `semantic_narrow_permissions.png` | Covered |
| Doctor, metrics, and CLI diagnostics | `semantic_doctor_smoke.tape`, `semantic_doctor_gaps.tape`, `semantic_menu_metrics.tape`, `semantic_narrow_deep_modals.tape` | `semantic_menu_doctor_health.png`, `semantic_menu_doctor_capabilities.png`, `semantic_doctor_gaps.png`, `semantic_menu_metrics.png`, `semantic_menu_metrics.gif`, `semantic_narrow_metrics.png`, `gact_diag_clipboard_terminal.report.md`, `diagnostics_readiness.report.md`, `semantic_doctor_gaps.gif` | Covered |
| Live TUI latency partial proof | `capture_live_tui_latency.sh` | `live_clio_tui_latency_metrics.png`, `live_clio_tui_latency_capture.gif`, `live_clio_tui_latency_manifest.json`, `tui_click_latency_target_semantics.report.md` | Preserved owned-backend capture proving `/metrics` renders TUI interaction latency by surface on real CLIO; deterministic report/test evidence proves click rows preserve surface/input kind/target label/last hit target. Manifest records provider streaming limitation, and VHS cannot drive mouse primitives, so #160 remains open for active live-stream proof plus true terminal click evidence |
| Runtime provenance detail | `semantic_runtime_provenance_detail.tape` | `semantic_runtime_provenance_detail.png` | Covered |
| Provider/model setup | `semantic_provider_setup.tape`, `semantic_provider_edge_states.tape`, `semantic_provider_auth_success.tape`, `white_provider_setup.tape`, `semantic_narrow_operator_surfaces.tape` | `semantic_provider_setup.png`, `semantic_provider_setup_provider_changed.png`, `semantic_provider_setup.gif`, `semantic_provider_edge_catalog.png`, `semantic_provider_edge_auth_required.png`, `semantic_provider_edge_auth_failure.png`, `semantic_provider_auth_success_before.png`, `semantic_provider_auth_success_after.png`, `semantic_narrow_provider_setup.png`, `semantic_provider_edge_states.gif`, `provider_recovery_readiness.report.md` | Covered |
| Settings | `semantic_settings_lists.tape`, `semantic_settings_agent_compact.tape`, `semantic_settings_agent_long.tape`, `semantic_theme_cycle.tape`, `semantic_narrow_deep_modals.tape` | `semantic_settings_agent.png`, `semantic_settings_theme.png`, `semantic_settings_tui.png`, `semantic_settings_language.png`, `semantic_settings_agent_compact.png`, `semantic_settings_lists.gif`, `semantic_settings_agent_compact.gif`, `semantic_settings_agent_long_top.png`, `semantic_settings_agent_long_scrolled.png`, `semantic_settings_agent_long_detail.png`, `semantic_theme_cycle_before.png`, `semantic_theme_cycle_next.png`, `semantic_theme_cycle_prev.png`, `semantic_narrow_settings.png` | Covered |

## Conversation, Streaming, Evidence, And Copy

| Surface | Tape(s) | Representative evidence | Status |
| --- | --- | --- | --- |
| Live semantic timeline | `semantic_live_events.tape`, `codex_semantic_timeline_uiux.tape`, `clio_semantic_live_events.tape` | `semantic_live_events_tool_started.png`, `codex_semantic_timeline_tool_result.png`, `clio_semantic_live_events_running.png` | Covered |
| CLIO-style event detail | `semantic_event_detail.tape`, `semantic_workflow_state_event.tape`, `semantic_blocker_handoff.tape`, `semantic_provider_failure_event.tape`, `semantic_trace_revisit_stability.tape`, `codex_part_detail_labels.tape`, `semantic_narrow_operator_surfaces.tape` | `semantic_event_detail.png`, `semantic_event_detail_evidence.png`, `semantic_workflow_state_event_route.png`, `semantic_workflow_state_event_contract.png`, `semantic_workflow_state_event_inline.png`, `semantic_workflow_state_event_detail.png`, `semantic_blocker_handoff_inline.png`, `semantic_blocker_handoff_detail.png`, `semantic_blocker_handoff_final.png`, `semantic_blocker_handoff.gif`, `semantic_provider_failure_inline.png`, `semantic_provider_failure_detail.png`, `semantic_provider_failure_event.gif`, `semantic_trace_revisit_before.png`, `semantic_trace_revisit_other_session.png`, `semantic_trace_revisit_after.png`, `semantic_trace_revisit_stability.gif`, `codex_part_detail_labels.png`, `semantic_narrow_detail_view.png` | Covered |
| Redacted semantic args | `semantic_redacted_tool_args.tape` | `semantic_redacted_tool_args_started.png`, `semantic_redacted_tool_args_completed.png`, `semantic_redacted_tool_args_detail.png` | Covered |
| Long transcript scroll | `semantic_long_transcript_scroll.tape` | `semantic_long_transcript_bottom.png`, `semantic_long_transcript_after_g.png`, `semantic_long_transcript_after_pagedown.png` | Covered |
| Detail/copy/drag copy | `semantic_detail_copy.tape`, `semantic_detail_drag_copy.tape`, `semantic_mouse_drag_copy.tape`, `semantic_mouse_drag_copy_failure.tape`, `semantic_mouse_native_selection.tape`, `semantic_native_selection_detail_on.tape`, `semantic_native_selection_detail_off.tape`, `semantic_native_selection_modal_on.tape`, `semantic_native_selection_modal_off.tape`, `semantic_copy_affordance.tape`, `semantic_conversation_block_copy.tape`, `semantic_help_conversation_copy.tape` | `semantic_detail_copy.png`, `semantic_detail_copy.gif`, `semantic_detail_drag_copy_highlight.png`, `semantic_detail_drag_copy_done.png`, `semantic_mouse_drag_copy_highlight.png`, `semantic_mouse_drag_copy_done.png`, `semantic_mouse_drag_copy_failure_done.png`, `semantic_mouse_native_selection_on.png`, `semantic_mouse_native_selection_off.png`, `semantic_native_selection_detail_on.png`, `semantic_native_selection_detail_off.png`, `semantic_native_selection_modal_on.png`, `semantic_native_selection_modal_off.png`, `semantic_copy_affordance.png`, `semantic_conversation_block_copy.png`, `semantic_help_conversation_copy.png`, `copy_selection_readiness.report.md`, `detail_modal_performance.report.md` | Covered |
| Compose/modal text entry | `semantic_compose_modal.tape`, `semantic_text_entry_modals.tape`, `semantic_long_single_line_input.tape` | `semantic_compose_modal.png`, `semantic_rename_modal.png`, `semantic_long_single_line_input.png` | Covered |
| Ask-user/retry flow | `issue57_ask_user_retry.tape`, `semantic_ask_user_stress.tape`, `semantic_ask_user_expired.tape`, `semantic_agent_question_detail.tape` | `issue57_ask_user_answer_modal.png`, `issue57_retry_model_modal.png`, `issue57_retry_notes_modal.png`, `semantic_ask_user_choice_initial.png`, `semantic_ask_user_choice_selected.png`, `semantic_ask_user_freeform_draft.png`, `semantic_ask_user_cancel_prompt.png`, `semantic_ask_user_cancelled.png`, `semantic_ask_user_expiring_prompt.png`, `semantic_ask_user_expired.png`, `semantic_agent_question_detail.png` | Covered |
| Diff/rewind | `semantic_diff_actions.tape`, `semantic_diff_clean_workspace.tape`, `semantic_diff_dirty_workspace.tape`, `semantic_diff_large_scroll.tape`, `rewind_before_after.tape` | `semantic_diff_actions.png`, `semantic_diff_clean_workspace.png`, `semantic_diff_dirty_workspace.png`, `semantic_diff_large_scroll_top.png`, `semantic_diff_large_scroll_bottom.png`, `rewind_action_menu.png`, `rewind_after.png` | Covered |
| Memory/search/context frame | `semantic_memory_inspector.tape`, `semantic_memory_search.tape`, `semantic_memory_stress.tape`, `semantic_memory_unavailable.tape`, `semantic_narrow_deep_modals.tape` | `semantic_memory_inspector.png`, `semantic_memory_context_frame.png`, `semantic_memory_stress_summary.png`, `semantic_memory_stress_search_hits.png`, `semantic_memory_stress_excluded_file.png`, `semantic_memory_stress_context_frame.png`, `semantic_memory_stress_agent_tools.png`, `semantic_memory_unavailable_palette.png`, `semantic_narrow_memory.png` | Covered |

## Scientific And Demo Workflows

| Surface | Tape(s) | Representative evidence | Status |
| --- | --- | --- | --- |
| EarthScope/SAC semantic streaming | `semantic_earthscope_tool_summary.tape` | `semantic_earthscope_tool_thinking.png`, `semantic_earthscope_tool_summary.png` | Covered |
| NDP feature/wildfire summary | `semantic_ndp_feature_tool_summary.tape` | `semantic_ndp_feature_tool_started.png`, `semantic_ndp_feature_tool_summary.png` | Covered |
| California NWS warnings summary | `semantic_nws_warnings_tool_summary.tape` | `semantic_nws_warnings_tool_thinking.png`, `semantic_nws_warnings_tool_started.png`, `semantic_nws_warnings_tool_summary.png`, `semantic_nws_warnings_tool_final.png` | Covered |
| California NWS real TUI capture attempt | `capture_ndp_demo_tui.sh` | `ndp_tui_real_california_nws_warnings_prompt.png`, `ndp_tui_real_california_nws_warnings_early.png`, `ndp_tui_real_california_nws_warnings_live.png`, `ndp_tui_real_california_nws_warnings_manifest.json` | Preserved live run against the isolated CLIO backend with the `ndp-environmental-hazards` blueprint: correct workspace/session/blueprint, no user-input detour, `california_nws_warnings.json` observed, but manifest still records provider streaming limitation so this is not full streaming proof |
| Fresno CIMIS weather profile and plot | `semantic_cimis_weather_tool_summary.tape` | `semantic_cimis_weather_tool_thinking.png`, `semantic_cimis_weather_tool_profile_started.png`, `semantic_cimis_weather_tool_profile_summary.png`, `semantic_cimis_weather_tool_plot_started.png`, `semantic_cimis_weather_tool_plot_summary.png`, `semantic_cimis_weather_tool_final.png` | Covered |
| Fresno CIMIS real TUI capture attempt | `capture_ndp_demo_tui.sh` | `ndp_tui_real_fresno_cimis_prompt.png`, `ndp_tui_real_fresno_cimis_early.png`, `ndp_tui_real_fresno_cimis_live.png`, `ndp_tui_real_fresno_cimis_manifest.json` | Preserved live run against the isolated CLIO backend with the `ndp-environmental-hazards` blueprint: correct workspace/session/blueprint, no user-input detour, cimis_fresno_weather.png observed, but manifest still records provider streaming limitation so this is not full streaming proof |
| NDP long transcript scroll | `live_clio_ndp.tape`, `live_clio_ndp_top.tape`, `live_alcf_20260525_ndp_scroll.tape` | `live_clio_ndp_bottom.png`, `live_alcf_20260525_ndp_after_pagedown.png` | Covered |
| Artifacts and plots | `live_clio_artifacts.tape`, `live_alcf_20260525_scatter.tape` | `live_clio_artifact_transcript.png`, `live_alcf_20260525_scatter_detail.png` | Covered |
| Errors and failures | `live_clio_sidebar_errors.tape`, `live_alcf_20260525_errors.tape`, `live_alcf_20260525_failures.tape`, `live_alcf_20260525_csv_failure.tape` | `live_clio_error_detail.png`, `live_alcf_20260525_expected_error_detail.png`, `live_alcf_20260525_csv_failure_detail.png` | Covered |
| Nanoagent/child sessions | `live_clio_nanoagents.tape`, `live_alcf_20260525_nanoagents.tape` | `live_clio_nanoagents_expanded.png`, `live_alcf_20260525_nanoagent_child_open.png` | Covered |
| Provider swap/compaction/state markers | `live_clio_state_markers.tape`, `live_clio_compaction.tape`, `live_alcf_20260525_provider_swap.tape`, `live_alcf_20260525_compaction.tape` | `live_clio_provider_swap_bottom.png`, `live_alcf_20260525_compaction_detail.png` | Covered |

## Missing Or Deferred

Track these as future visual-loop work. Do not delete existing tapes to make
this list shorter; fill gaps deliberately.

### Capture Ledger

Use this ledger as the source of truth for views that still need deeper visual
coverage. Avoid listing planned artifact filenames in backticks until the tape or
screenshot exists; the strict corpus checker treats backticked artifact names as
required files.

| Area | Missing capture | Why it matters | Priority |
| --- | --- | --- | --- |
| Scientific demos | Remaining real NDP demo gap: all four cases have preserved real TUI screenshots, but none has the required short GIF plus live-run streaming proof manifest under the current standard (#149) | Deterministic fixtures prove rendering, and real runs prove artifact-producing operability for all four cases; all four cases need short GIF recordings plus a JSON receipt from the capture helper proving live semantic events on an owned backend. San Diego/EarthScope and wildfire need manifests, and California NWS plus Fresno CIMIS need manifests without the streaming limitation flag | High |
| Diagnostics | Real CLIO doctor output with partial capability gaps and long-running benchmark metrics during active stream (#151) | Deterministic fixtures, maintained `gact diag` clipboard/terminal report, and preserved live memory-pressure evidence are covered; operators still need real CLIO doctor partial-gap and active-stream metrics captures | High |
| Copy and selection | Live terminal permutations for drag copy, native selection, clipboard failures, and detail-modal copy across mouse modes (#150) | Deterministic copy success, native-selection toggle, and forced clipboard-failure guidance are covered; `check_copy_selection_readiness.py` now keeps that deterministic proof separate from the real terminal checklist, which still needs live-terminal evidence across the supported local environment | High |
| Agent and blueprint hierarchy | Real marketplace-source lifecycle against current CLIO registry semantics, including successful source install/update/remove and backend registry refresh outcomes (#128/#143) | Deterministic tapes now cover large blueprint/agent trees with long names, active markers, nested children, invalid sources, and disabled activation states; `check_agent_blueprint_marketplace_readiness.py` now keeps that proof separate from real marketplace-source lifecycle proof, which still needs owned-backend evidence for demo operator confidence | Medium |
| Runtime catalogs | Large live mixed tools/MCP/source catalog, registry-backed MCP install/remove, and successful lifecycle outcomes across source types (#152) | Representative unified catalog states now cover built-in, recipe, MCP, disconnected/repair-needed, unavailable, empty, reconnect-failure, and detail variants; `check_live_lifecycle_readiness.py` now separates live catalog breadth from real registry-backed MCP/source lifecycle success, both of which still need owned-backend proof | Medium |
| Prompts and expert packs | Successful provider-specific prompt save against a live backend, empty active-blueprint state with a non-empty prompt registry, and successful expert-pack install/update/delete against a real source (#153) | These surfaces decide what CLIO will run; deterministic tapes now cover packaged blueprint prompt variants, scoped session overrides, provider-specific edit failure, validation errors, empty prompt registry, and expert-pack failure/lifecycle structure; `check_live_lifecycle_readiness.py` keeps real prompt/expert-pack lifecycle success deferred until owned-backend captures exist | Medium |
| Settings and provider setup | Real ALCF provider failure/recovery and retry override warning (#154) | Deterministic provider tapes prove unavailable model/auth failure, warning-cleared-after-auth, retry-warning UI, and narrow layout; `check_provider_recovery_readiness.py` now keeps real owned-backend failure/recovery proof deferred until the guarded provider capture manifest and screenshots exist | Medium |

- Strict per-view matrix for every slash command and every modal tab. Current
  coverage is broad, but not every tab/state permutation has a dedicated tape.
- Agent blueprint real lifecycle variants against current CLIO registry
  semantics: source install, source update, source remove, backend registry
  refresh, and successful installed-blueprint activation from a real source.
- Prompt detail variants for validation errors, packaged blueprint prompts,
  provider-specific prompts, edited prompt failure, and empty prompt registry
  are covered by deterministic tapes; successful live prompt save and non-empty
  registry with no active blueprint remain deferred.
- Agent and blueprint tree variants are covered with deterministic stress tapes;
  keep expanding only when a real source exposes a new shape not represented by
  the current hierarchy, active-marker, narrow, and lifecycle-failure captures.
- Settings/LM config edge states: real ALCF provider recovery and retry
  override warning. Use `capture_live_provider_recovery_tui.sh` against an
  owned CLIO backend when the failure and recovered sessions are available.
- Catalog detail variants for all source kinds: built-in, recipe, MCP, extension,
  unavailable tool, disconnected MCP, and no tools/resources/prompts.
- Mobile/narrow screenshots for the most important modals are covered across
  palette, blueprints, tools/MCP, permissions, provider setup, detail view,
  metrics, memory, prompts, expert packs, and settings.
- Full four-case NDP demo visual capture under real agent execution.
  All four cases currently have preserved real TUI screenshots and should be
  kept as operator evidence. Current deterministic fixtures cover all four
  workflow semantics, and all four real runs prove artifact-producing
  operability. The demo is not fully ready until every case has the required
  short GIF recording and live-run streaming proof manifest: San Diego/EarthScope
  and wildfire need manifests, while California NWS warnings and Fresno CIMIS
  need manifests without the provider streaming limitation flag.
  Run `python3 visual_loop/check_ndp_demo_readiness.py --root .` to audit the
  per-case distinction between CLIO artifact proof, deterministic TUI proof,
  and real TUI recordings. Use `--strict` only once all four real recordings
  have been captured. Use `visual_loop/capture_ndp_demo_tui.sh` only against an
  isolated CLIO backend you own; it records the required prompt, early, live, and
  short GIF artifacts without starting or stopping CLIO. Refresh the exact
  missing-file report with `python3 visual_loop/check_ndp_demo_readiness.py
  --root . --write-report visual_loop/NDP_DEMO_VISUAL_READINESS.md`.

## Maintenance Rules

- New TUI view or modal: add at least one deterministic tape, or add a TODO row
  under "Missing Or Deferred" with the reason.
- New demo workflow fixture: capture `thinking`, `tool started`, `tool result`,
  and `final/idle` states when possible.
- New raw/structured evidence renderer: capture both inline summary and detail
  expansion.
- Existing but unindexed captures: keep them if they show a useful operator
  state, then add them to this matrix or to "Missing Or Deferred" as pending
  evidence cleanup. `check_visual_corpus.py` reports them without failing unless
  `--require-indexed` is passed.
- After visual changes, rebuild `tui/gact` and `.tools/emulator-server`, run the
  relevant tape, inspect the PNG, and update this matrix if the evidence path
  changes.

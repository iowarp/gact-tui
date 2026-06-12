#!/usr/bin/env python3
"""Check that the visual-loop acceptance corpus is present.

This is intentionally a filesystem health check, not image diffing. It gives
release hardening a fast gate that catches missing tapes, screenshots, and
temporal proof artifacts before a reviewer starts manual visual inspection.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import check_ndp_demo_readiness
import check_slash_command_coverage


@dataclass(frozen=True)
class CorpusGroup:
    name: str
    description: str
    required: tuple[str, ...]


@dataclass(frozen=True)
class MissingCapture:
    area: str
    missing_capture: str
    why_it_matters: str
    priority: str


STRICT_LIVE_REPORTS: tuple[str, ...] = (
    "visual_loop/screenshots/live_observability_clio_semantic_live_events.strict.report.md",
)


ARTIFACT_INDEX_FILES: tuple[str, ...] = (
    "visual_loop/COVERAGE.md",
    "visual_loop/PRESERVED_CAPTURES.md",
    "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md",
)

TRACKED_ARTIFACT_INDEX_FILES: tuple[str, ...] = (
    "visual_loop/COVERAGE.md",
    "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md",
)

MISSING_CAPTURE_REPORT = "visual_loop/MISSING_CAPTURES.md"


ARTIFACT_EXTENSIONS: tuple[str, ...] = (
    ".tape",
    ".png",
    ".gif",
    ".jsonl",
    ".report.md",
    ".strict.report.md",
)

ISSUE_REFERENCE_RE = re.compile(r"(?:^|[^\w])#\d+(?:$|[^\w])")


def looks_like_visual_artifact(text: str) -> bool:
    return any(text.endswith(ext) for ext in ARTIFACT_EXTENSIONS)


def normalize_coverage_artifact(text: str) -> str | None:
    text = text.strip()
    if not looks_like_visual_artifact(text):
        return None
    if text.startswith("visual_loop/"):
        return text
    if "/" in text:
        return None
    if text.endswith(".tape"):
        return f"visual_loop/tapes/{text}"
    return f"visual_loop/screenshots/{text}"


def coverage_index_artifacts(path: Path) -> tuple[str, ...]:
    if not path.exists() or not path.is_file():
        return ()
    text = path.read_text(encoding="utf-8")
    artifacts: set[str] = set()
    for match in re.finditer(r"`([^`]+)`", text):
        for token in match.group(1).split(","):
            artifact = normalize_coverage_artifact(token)
            if artifact:
                artifacts.add(artifact)
    return tuple(sorted(artifacts))


def indexed_artifacts(root: Path) -> tuple[str, ...]:
    artifacts: set[str] = set()
    for rel in ARTIFACT_INDEX_FILES:
        artifacts.update(coverage_index_artifacts(root / rel))
    return tuple(sorted(artifacts))


def missing_capture_ledger(path: Path) -> tuple[MissingCapture, ...]:
    if not path.exists() or not path.is_file():
        return ()
    rows: list[MissingCapture] = []
    in_ledger = False
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped == "### Capture Ledger":
            in_ledger = True
            continue
        if in_ledger and stripped.startswith("### "):
            break
        if not in_ledger or not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) != 4:
            continue
        if cells[0] in {"Area", "---"} or set(cells[0]) == {"-"}:
            continue
        rows.append(
            MissingCapture(
                area=cells[0],
                missing_capture=cells[1],
                why_it_matters=cells[2],
                priority=cells[3],
            )
        )
    return tuple(rows)


def check_missing_capture_ledger(root: Path) -> dict[str, object]:
    rows = missing_capture_ledger(root / "visual_loop/COVERAGE.md")
    priorities: dict[str, int] = {}
    missing_issue_refs: list[dict[str, str]] = []
    for row in rows:
        priorities[row.priority] = priorities.get(row.priority, 0) + 1
        combined = " ".join((row.area, row.missing_capture, row.why_it_matters))
        if not ISSUE_REFERENCE_RE.search(combined):
            missing_issue_refs.append(
                {
                    "area": row.area,
                    "missing_capture": row.missing_capture,
                    "priority": row.priority,
                }
            )
    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    return {
        "ok": not missing_issue_refs,
        "path": "visual_loop/COVERAGE.md",
        "count": len(rows),
        "priorities": dict(
            sorted(
                priorities.items(),
                key=lambda item: (priority_order.get(item[0], 99), item[0]),
            )
        ),
        "rows": [
            {
                "area": row.area,
                "missing_capture": row.missing_capture,
                "why_it_matters": row.why_it_matters,
                "priority": row.priority,
            }
            for row in rows
        ],
        "missing_issue_refs": missing_issue_refs,
    }


def render_missing_capture_report(result: dict[str, object]) -> str:
    ledger = result.get("missing_capture_ledger", {})
    if not isinstance(ledger, dict):
        ledger = {}
    rows = ledger.get("rows", [])
    if not isinstance(rows, list):
        rows = []
    priorities = ledger.get("priorities", {})
    if not isinstance(priorities, dict):
        priorities = {}

    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    priority_items = sorted(
        priorities.items(),
        key=lambda item: (priority_order.get(str(item[0]), 99), str(item[0])),
    )
    lines = [
        "# Missing Visual Captures",
        "",
        "This is a generated operator backlog derived from `visual_loop/COVERAGE.md`.",
        "Keep the source ledger there authoritative, and regenerate this file after",
        "changing capture priorities or missing-state rows.",
        "",
        "## Summary",
        "",
        f"- source: `{ledger.get('path', 'visual_loop/COVERAGE.md')}`",
        f"- deferred captures: `{ledger.get('count', len(rows))}`",
        "- priorities: "
        + (
            ", ".join(f"{priority}={count}" for priority, count in priority_items)
            if priority_items
            else "none"
        ),
        "",
        "## Backlog",
        "",
    ]
    if not rows:
        lines.append("No deferred visual captures are currently listed.")
        return "\n".join(lines).rstrip() + "\n"

    sorted_rows = sorted(
        rows,
        key=lambda row: (
            priority_order.get(str(row.get("priority")), 99),
            str(row.get("area", "")),
            str(row.get("missing_capture", "")),
        ),
    )
    for row in sorted_rows:
        lines.extend(
            [
                f"### {row.get('priority')} - {row.get('area')}",
                "",
                f"- Missing capture: {row.get('missing_capture')}",
                f"- Why it matters: {row.get('why_it_matters')}",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def write_missing_capture_report(result: dict[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_missing_capture_report(result), encoding="utf-8")


def check_missing_capture_report_sync(root: Path, result: dict[str, object]) -> dict[str, object]:
    path = root / MISSING_CAPTURE_REPORT
    if not path.exists():
        return {
            "ok": False,
            "path": MISSING_CAPTURE_REPORT,
            "state": "missing",
        }
    if not path.is_file():
        return {
            "ok": False,
            "path": MISSING_CAPTURE_REPORT,
            "state": "not a file",
        }
    expected = render_missing_capture_report(result)
    try:
        actual = path.read_text(encoding="utf-8")
    except OSError as exc:
        return {
            "ok": False,
            "path": MISSING_CAPTURE_REPORT,
            "state": f"read failed: {exc}",
        }
    return {
        "ok": actual == expected,
        "path": MISSING_CAPTURE_REPORT,
        "state": "current" if actual == expected else "stale",
    }


def manifest_artifacts() -> tuple[str, ...]:
    artifacts: set[str] = set()
    for group in CORPUS_GROUPS:
        artifacts.update(group.required)
    artifacts.update(STRICT_LIVE_REPORTS)
    return tuple(sorted(artifact for artifact in artifacts if looks_like_visual_artifact(artifact)))


def existing_visual_artifacts(root: Path) -> tuple[str, ...]:
    artifacts: set[str] = set()
    for rel_dir in ("visual_loop/tapes", "visual_loop/screenshots"):
        base = root / rel_dir
        if not base.exists():
            continue
        for path in base.iterdir():
            if not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            if looks_like_visual_artifact(rel):
                artifacts.add(rel)
    return tuple(sorted(artifacts))


CORPUS_GROUPS: tuple[CorpusGroup, ...] = (
    CorpusGroup(
        name="conversation_tools",
        description="long transcript scrolling, tool summaries, and detail expansion",
        required=(
            "visual_loop/tapes/semantic_long_transcript_scroll.tape",
            "visual_loop/screenshots/semantic_long_transcript_bottom.png",
            "visual_loop/screenshots/semantic_long_transcript_scrolled_up.png",
            "visual_loop/screenshots/semantic_long_transcript_after_pagedown.png",
            "visual_loop/screenshots/semantic_long_transcript_after_g.png",
            "visual_loop/tapes/semantic_live_events.tape",
            "visual_loop/screenshots/semantic_live_events_thinking.png",
            "visual_loop/screenshots/semantic_live_events_tool_started.png",
            "visual_loop/screenshots/semantic_live_events_tool_result.png",
            "visual_loop/screenshots/semantic_live_events_final.png",
            "visual_loop/tapes/clio_semantic_live_events.tape",
            "visual_loop/screenshots/clio_semantic_live_events_running.png",
            "visual_loop/screenshots/clio_semantic_live_events_final.png",
            "visual_loop/tapes/semantic_detail_copy.tape",
            "visual_loop/screenshots/semantic_detail_copy.png",
            "visual_loop/tapes/semantic_conversation_block_copy.tape",
            "visual_loop/screenshots/semantic_conversation_block_copy.png",
            "visual_loop/tapes/semantic_conversation_footer_actions.tape",
            "visual_loop/screenshots/semantic_conversation_footer_actions.png",
            "visual_loop/tapes/semantic_mcp_reconnect.tape",
            "visual_loop/screenshots/semantic_mcp_reconnect_detail.png",
            "visual_loop/screenshots/semantic_mcp_reconnect_done.png",
            "visual_loop/tapes/semantic_session_summary.tape",
            "visual_loop/screenshots/semantic_session_summary.png",
            "visual_loop/tapes/semantic_event_detail.tape",
            "visual_loop/screenshots/semantic_event_detail.png",
            "visual_loop/screenshots/semantic_event_detail_evidence.png",
            "visual_loop/tapes/semantic_workflow_state_event.tape",
            "visual_loop/screenshots/semantic_workflow_state_event_route.png",
            "visual_loop/screenshots/semantic_workflow_state_event_contract.png",
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
        ),
    ),
    CorpusGroup(
        name="sidebars_context_files",
        description="sidebar modules, right-sidebar context/files, and layout editor",
        required=(
            "visual_loop/tapes/agents_files_sidebar.tape",
            "visual_loop/screenshots/agents_files_sidebar.png",
            "visual_loop/tapes/semantic_sidebar_layout_editor.tape",
            "visual_loop/screenshots/semantic_sidebar_layout_editor_default.png",
            "visual_loop/screenshots/semantic_sidebar_layout_editor_available.png",
            "visual_loop/screenshots/semantic_sidebar_layout_editor_right.png",
            "visual_loop/tapes/semantic_sidebar_layout_settings.tape",
            "visual_loop/screenshots/semantic_sidebar_layout_settings.png",
            "visual_loop/tapes/semantic_right_sidebar_layout.tape",
            "visual_loop/screenshots/semantic_right_sidebar_layout.png",
            "visual_loop/tapes/semantic_file_viewer_module.tape",
            "visual_loop/screenshots/semantic_file_viewer_module_initial.png",
            "visual_loop/screenshots/semantic_file_viewer_module_expanded.png",
            "visual_loop/screenshots/semantic_file_viewer_module_detail.png",
            "visual_loop/screenshots/semantic_file_viewer_module_upload.png",
            "visual_loop/tapes/semantic_context_detail.tape",
            "visual_loop/screenshots/semantic_context_row_selected.png",
            "visual_loop/screenshots/semantic_context_detail.png",
            "visual_loop/tapes/semantic_file_picker.tape",
            "visual_loop/screenshots/semantic_file_picker.png",
            "visual_loop/screenshots/semantic_file_picker_tree_expanded.png",
            "visual_loop/tapes/agent_runtime_sidebar.tape",
            "visual_loop/screenshots/agent_runtime_sidebar.png",
        ),
    ),
    CorpusGroup(
        name="settings_provider",
        description="settings tabs, provider setup, and white-background modal smoke",
        required=(
            "visual_loop/tapes/semantic_settings_lists.tape",
            "visual_loop/screenshots/semantic_settings_agent.png",
            "visual_loop/tapes/semantic_settings_agent_compact.tape",
            "visual_loop/screenshots/semantic_settings_agent_compact.png",
            "visual_loop/tapes/semantic_settings_agent_long.tape",
            "visual_loop/screenshots/semantic_settings_agent_long_top.png",
            "visual_loop/screenshots/semantic_settings_agent_long_scrolled.png",
            "visual_loop/screenshots/semantic_settings_agent_long_detail.png",
            "visual_loop/screenshots/semantic_settings_theme.png",
            "visual_loop/screenshots/semantic_settings_tui.png",
            "visual_loop/screenshots/semantic_settings_language.png",
            "visual_loop/tapes/semantic_provider_setup.tape",
            "visual_loop/screenshots/semantic_provider_setup.png",
            "visual_loop/screenshots/semantic_provider_setup_provider_changed.png",
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
            "visual_loop/tapes/white_modal_smoke.tape",
            "visual_loop/screenshots/white_modal_smoke_base.png",
            "visual_loop/screenshots/white_modal_smoke_settings.png",
            "visual_loop/screenshots/white_modal_smoke_help.png",
            "visual_loop/screenshots/white_modal_smoke_palette.png",
            "visual_loop/tapes/white_provider_setup.tape",
            "visual_loop/screenshots/white_provider_setup.png",
        ),
    ),
    CorpusGroup(
        name="shared_menu_surfaces",
        description="help, settings, metrics, tools, and doctor shared modal/menu proof",
        required=(
            "visual_loop/tapes/semantic_header_actions.tape",
            "visual_loop/screenshots/semantic_header_actions_base.png",
            "visual_loop/screenshots/semantic_header_actions_help.png",
            "visual_loop/screenshots/semantic_header_actions_settings.png",
            "visual_loop/tapes/semantic_menu_smoke.tape",
            "visual_loop/screenshots/semantic_menu_help_commands.png",
            "visual_loop/screenshots/semantic_menu_settings_tui.png",
            "visual_loop/screenshots/semantic_menu_metrics.png",
            "visual_loop/screenshots/semantic_menu_tools_catalog.png",
            "visual_loop/screenshots/semantic_menu_tool_detail.png",
            "visual_loop/screenshots/semantic_menu_doctor_health.png",
            "visual_loop/screenshots/semantic_menu_doctor_capabilities.png",
            "visual_loop/tapes/semantic_doctor_gaps.tape",
            "visual_loop/screenshots/semantic_doctor_gaps.png",
            "visual_loop/screenshots/semantic_narrow_metrics.png",
            "visual_loop/screenshots/gact_diag_clipboard_terminal.report.md",
            "visual_loop/screenshots/diagnostics_readiness.report.md",
        ),
    ),
    CorpusGroup(
        name="questions_retry_permissions",
        description="ask-user, retry, permissions, text-entry, and action modals",
        required=(
            "visual_loop/tapes/issue57_ask_user_retry.tape",
            "visual_loop/screenshots/issue57_ask_user_retry.png",
            "visual_loop/screenshots/issue57_ask_user_answer_modal.png",
            "visual_loop/screenshots/issue57_retry_model_modal.png",
            "visual_loop/screenshots/issue57_retry_notes_modal.png",
            "visual_loop/tapes/semantic_text_entry_modals.tape",
            "visual_loop/screenshots/semantic_rename_modal.png",
            "visual_loop/screenshots/semantic_context_add_modal.png",
            "visual_loop/tapes/semantic_compose_modal.tape",
            "visual_loop/screenshots/semantic_compose_modal.png",
            "visual_loop/tapes/semantic_permissions_inspector.tape",
            "visual_loop/screenshots/semantic_permissions_inspector.png",
            "visual_loop/tapes/semantic_sidebar_footer_actions.tape",
            "visual_loop/screenshots/semantic_sidebar_footer_actions.png",
            "visual_loop/tapes/semantic_conversation_actions.tape",
            "visual_loop/screenshots/semantic_conversation_actions.png",
        ),
    ),
    CorpusGroup(
        name="semantic_interactions",
        description="palette, workspace, MCP, memory, startup, permission, and action-menu proof",
        required=(
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
            "visual_loop/tapes/semantic_sidebar_filter.tape",
            "visual_loop/screenshots/semantic_sidebar_filter.png",
            "visual_loop/tapes/semantic_quit_confirm.tape",
            "visual_loop/screenshots/semantic_quit_confirm.png",
        ),
    ),
    CorpusGroup(
        name="marketplace_blueprints",
        description="Agent Blueprint marketplace, source provenance, validation, and lifecycle proof",
        required=(
            "visual_loop/tapes/semantic_agent_blueprint_active_marker.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_active_marker_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_active_marker_detail.png",
            "visual_loop/tapes/semantic_agent_blueprint_management.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_install.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_installed.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validate.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_delete_confirm.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_updated.png",
            "visual_loop/tapes/semantic_agent_blueprint_sources.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_registry.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_add_source.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_added.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_remove_confirm.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_install_row.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_installed.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png",
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
            "visual_loop/tapes/semantic_agent_blueprint_commands.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_commands_palette.png",
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
        ),
    ),
    CorpusGroup(
        name="benchmark_live_replay",
        description="persisted CLIO/ALCF benchmark replay screenshots",
        required=(
            "visual_loop/tapes/live_clio_ndp.tape",
            "visual_loop/screenshots/live_clio_ndp_bottom.png",
            "visual_loop/screenshots/live_clio_ndp_after_pagedown.png",
            "visual_loop/screenshots/live_clio_ndp_after_end.png",
            "visual_loop/screenshots/live_clio_ndp_tool_detail.png",
            "visual_loop/tapes/live_clio_ndp_top.tape",
            "visual_loop/screenshots/live_clio_ndp_top.png",
            "visual_loop/screenshots/live_clio_ndp_tool_selection.png",
            "visual_loop/tapes/live_clio_nanoagents.tape",
            "visual_loop/screenshots/live_clio_nanoagents_collapsed.png",
            "visual_loop/screenshots/live_clio_nanoagents_expanded.png",
            "visual_loop/screenshots/live_clio_nanoagent_child_open.png",
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
            "visual_loop/tapes/live_clio_sidebar_errors.tape",
            "visual_loop/screenshots/live_clio_error_session.png",
            "visual_loop/screenshots/live_clio_error_detail.png",
            "visual_loop/tapes/live_clio_provenance_detail.tape",
            "visual_loop/screenshots/live_clio_provenance_selection.png",
            "visual_loop/screenshots/live_clio_provenance_detail.png",
        ),
    ),
    CorpusGroup(
        name="remote_alcf_replay",
        description="persisted ALCF provider-swap and sidebar-section replay proof",
        required=(
            "visual_loop/tapes/live_alcf_20260525_provider_swap.tape",
            "visual_loop/screenshots/live_alcf_20260525_provider_swap_top.png",
            "visual_loop/screenshots/live_alcf_20260525_provider_swap_bottom.png",
            "visual_loop/tapes/live_alcf_20260525_sidebar_sections.tape",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_header_focused.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sessions_collapsed.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_context_focused.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sections_collapsed.png",
            "visual_loop/screenshots/live_alcf_20260525_sidebar_sections_expanded.png",
        ),
    ),
    CorpusGroup(
        name="temporal_observability",
        description="JSONL/report gates for live semantic streaming and operator diagnostics",
        required=(
            "visual_loop/assert_live_observability.py",
            "visual_loop/test_assert_live_observability.py",
            "visual_loop/capture_live_observability.py",
            "visual_loop/capture_tui_mouse_latency_pty.py",
            "visual_loop/screenshots/gact_diag_clipboard_terminal.report.md",
            "visual_loop/screenshots/diagnostics_readiness.report.md",
            "visual_loop/screenshots/tui_mouse_latency_pty_manifest.json",
            "visual_loop/screenshots/tui_mouse_latency_pty_report.json",
            "visual_loop/screenshots/live_observability_20260601_131300.jsonl",
            "visual_loop/screenshots/live_observability_20260601_131300.report.md",
            "visual_loop/screenshots/live_observability_20260601_131300.strict.report.md",
            "visual_loop/screenshots/live_observability_clio_semantic_live_events.jsonl",
            "visual_loop/screenshots/live_observability_clio_semantic_live_events.report.md",
            "visual_loop/screenshots/live_observability_clio_semantic_live_events.strict.report.md",
        ),
    ),
)


def report_verdict(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("- verdict:"):
            continue
        if "`PASS`" in line:
            return "PASS"
        if "`FAIL`" in line:
            return "FAIL"
        return line.removeprefix("- verdict:").strip().strip("`")
    return None


def strict_report_missing_items(path: Path) -> list[str]:
    if not path.exists() or not path.is_file():
        return []
    missing: list[str] = []
    in_missing_section = False
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            in_missing_section = stripped in {
                "## Missing Before Completion",
                "## Runtime Provenance Agreement",
            }
            continue
        if not in_missing_section or not stripped.startswith("- ") or line.startswith("  - "):
            continue
        text = stripped[2:].strip()
        if not text or text.startswith("verdict:") or text.startswith("matched:"):
            continue
        missing.append(text.strip("`"))
    return missing


def tracked_paths(root: Path) -> set[str]:
    proc = subprocess.run(
        ["git", "ls-files", "--", "visual_loop"],
        cwd=root,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def requires_git_tracking(rel: str) -> bool:
    return not rel.endswith(".gif")


def check_group(root: Path, group: CorpusGroup, *, tracked: set[str] | None = None) -> list[str]:
    missing: list[str] = []
    for rel in group.required:
        path = root / rel
        if not path.exists():
            missing.append(rel + " (missing)")
        elif path.is_file() and path.stat().st_size == 0:
            missing.append(rel + " (empty)")
        elif tracked is not None and requires_git_tracking(rel) and rel not in tracked:
            missing.append(rel + " (untracked)")
    return missing


def check_strict_live_reports(root: Path) -> dict[str, object]:
    reports = []
    ok = False
    for rel in STRICT_LIVE_REPORTS:
        path = root / rel
        verdict = report_verdict(path)
        if verdict == "PASS":
            ok = True
        reports.append(
            {
                "path": rel,
                "verdict": verdict or "missing",
                "missing": strict_report_missing_items(path),
            }
        )
    return {"ok": ok, "status": "pass" if ok else "not passing", "reports": reports}


def check_artifact_index(root: Path, rel: str, *, tracked: set[str] | None = None) -> dict[str, object]:
    path = root / rel
    if not path.exists():
        return {
            "ok": False,
            "path": rel,
            "referenced_count": 0,
            "missing": [rel + " (missing)"],
        }
    artifacts = coverage_index_artifacts(path)
    missing: list[str] = []
    for artifact in artifacts:
        artifact_path = root / artifact
        if not artifact_path.exists():
            missing.append(artifact + " (missing)")
        elif artifact_path.is_file() and artifact_path.stat().st_size == 0:
            missing.append(artifact + " (empty)")
        elif tracked is not None and requires_git_tracking(artifact) and artifact not in tracked:
            missing.append(artifact + " (untracked)")
    return {
        "ok": not missing,
        "path": rel,
        "referenced_count": len(artifacts),
        "missing": missing,
    }


def check_artifact_indices(root: Path, *, tracked: set[str] | None = None) -> list[dict[str, object]]:
    indices: list[dict[str, object]] = []
    for rel in ARTIFACT_INDEX_FILES:
        index_tracked = tracked if rel in TRACKED_ARTIFACT_INDEX_FILES else None
        indices.append(check_artifact_index(root, rel, tracked=index_tracked))
    return indices


def check_coverage_index(root: Path, *, tracked: set[str] | None = None) -> dict[str, object]:
    return check_artifact_index(root, "visual_loop/COVERAGE.md", tracked=tracked)


def check_unindexed_artifacts(root: Path) -> dict[str, object]:
    coverage = set(indexed_artifacts(root))
    manifest = set(manifest_artifacts())
    indexed = coverage | manifest
    existing = set(existing_visual_artifacts(root))
    unindexed = sorted(existing - indexed)
    return {
        "ok": not unindexed,
        "existing_count": len(existing),
        "indexed_count": len(existing & indexed),
        "unindexed_count": len(unindexed),
        "unindexed": unindexed,
    }


def check_corpus(
    root: Path,
    *,
    require_tracked: bool = False,
    require_strict_live_pass: bool = False,
    require_indexed: bool = False,
    require_ndp_demo_ready: bool = False,
    ndp_report_path: Path | None = None,
) -> dict[str, object]:
    tracked = tracked_paths(root) if require_tracked else None
    groups = []
    ok = True
    for group in CORPUS_GROUPS:
        missing = check_group(root, group, tracked=tracked)
        if missing:
            ok = False
        groups.append(
            {
                "name": group.name,
                "description": group.description,
                "required_count": len(group.required),
                "missing": missing,
            }
        )
    artifact_indices = check_artifact_indices(root, tracked=tracked)
    if any(not index["ok"] for index in artifact_indices):
        ok = False
    unindexed = check_unindexed_artifacts(root)
    if require_indexed and not unindexed["ok"]:
        ok = False
    slash_commands = check_slash_command_coverage.audit(root)
    if not slash_commands["ok"]:
        ok = False
    ndp_demo = check_ndp_demo_readiness.check_readiness(
        root,
        ndp_report_path or check_ndp_demo_readiness.DEFAULT_REPORT,
    )
    if require_ndp_demo_ready and not ndp_demo["ok"]:
        ok = False
    missing_capture_ledger_result = check_missing_capture_ledger(root)
    if not missing_capture_ledger_result["ok"]:
        ok = False
    result: dict[str, object] = {
        "ok": ok,
        "ndp_demo_required": require_ndp_demo_ready,
        "groups": groups,
        "artifact_indices": artifact_indices,
        "coverage_index": artifact_indices[0],
        "unindexed_artifacts": unindexed,
        "slash_command_coverage": slash_commands,
        "ndp_demo_readiness": ndp_demo,
        "missing_capture_ledger": missing_capture_ledger_result,
    }
    missing_capture_report = check_missing_capture_report_sync(root, result)
    result["missing_capture_report"] = missing_capture_report
    if not missing_capture_report["ok"]:
        result["ok"] = False
    if require_strict_live_pass:
        strict = check_strict_live_reports(root)
        result["strict_live_pass"] = strict
        if not strict["ok"]:
            result["ok"] = False
    return result


def print_text_report(result: dict[str, object], *, include_deferred: bool = False) -> None:
    print("# Visual Loop Corpus Check")
    print()
    print(f"- verdict: `{'PASS' if result['ok'] else 'FAIL'}`")
    print()
    for group in result["groups"]:
        assert isinstance(group, dict)
        missing = group["missing"]
        assert isinstance(missing, list)
        print(f"## {group['name']}")
        print()
        print(f"- purpose: {group['description']}")
        print(f"- required artifacts: {group['required_count']}")
        if missing:
            print("- missing/empty:")
            for item in missing:
                print(f"  - {item}")
        else:
            print("- status: present")
        print()
    coverage = result.get("coverage_index")
    if isinstance(coverage, dict):
        print("## coverage_index")
        print()
        print(f"- path: {coverage.get('path')}")
        print(f"- referenced artifacts: {coverage.get('referenced_count')}")
        missing = coverage.get("missing", [])
        if isinstance(missing, list) and missing:
            print("- missing/empty:")
            for item in missing:
                print(f"  - {item}")
        else:
            print("- status: present")
        print()
    indices = result.get("artifact_indices")
    if isinstance(indices, list) and len(indices) > 1:
        print("## artifact_indices")
        print()
        for index in indices:
            if not isinstance(index, dict):
                continue
            print(f"### {index.get('path')}")
            print()
            print(f"- referenced artifacts: {index.get('referenced_count')}")
            missing = index.get("missing", [])
            if isinstance(missing, list) and missing:
                print("- missing/empty:")
                for item in missing:
                    print(f"  - {item}")
            else:
                print("- status: present")
            print()
    unindexed = result.get("unindexed_artifacts")
    if isinstance(unindexed, dict):
        print("## unindexed_artifacts")
        print()
        print(f"- existing artifacts: {unindexed.get('existing_count')}")
        print(f"- indexed artifacts: {unindexed.get('indexed_count')}")
        print(f"- unindexed artifacts: {unindexed.get('unindexed_count')}")
        items = unindexed.get("unindexed", [])
        if isinstance(items, list) and items:
            print("- examples:")
            for item in items[:25]:
                print(f"  - {item}")
            if len(items) > 25:
                print(f"  - ... {len(items) - 25} more")
        else:
            print("- status: all artifacts indexed")
        print()
    slash = result.get("slash_command_coverage")
    if isinstance(slash, dict):
        print("## slash_command_coverage")
        print()
        print(f"- status: {'present' if slash.get('ok') else 'drift detected'}")
        print(f"- canonical commands: {len(slash.get('canonical', []))}")
        print(f"- folded commands: {len(slash.get('folded', []))}")
        print(f"- help commands: {len(slash.get('help_commands', []))}")
        print(f"- built-in palette commands: {len(slash.get('builtin_palette', []))}")
        for key, label in (
            ("missing_from_ledger", "missing from slash ledger"),
            ("missing_from_help", "missing from Help Commands"),
            ("folded_in_help", "folded but still in Help Commands"),
            ("canonical_not_builtin_or_help", "canonical without source/help evidence"),
        ):
            values = slash.get(key, [])
            if isinstance(values, list) and values:
                print(f"- {label}:")
                for value in values:
                    print(f"  - {value}")
        print()
    ndp = result.get("ndp_demo_readiness")
    if isinstance(ndp, dict):
        print("## ndp_demo_readiness")
        print()
        report = ndp.get("report", {})
        summary = ndp.get("summary", {})
        required = bool(result.get("ndp_demo_required"))
        if required:
            print(f"- status: {'ready' if ndp.get('ok') else 'not ready'}")
        else:
            print(
                "- status: "
                + ("ready" if ndp.get("ok") else "informational; not required by this gate")
            )
        if isinstance(report, dict):
            print(f"- report: {report.get('path')}")
            print(f"- report exists: {str(bool(report.get('exists'))).lower()}")
        if isinstance(summary, dict):
            print(f"- CLIO artifact proof: {summary.get('clio_report_ready')}/{summary.get('case_count')}")
            print(f"- deterministic TUI proof: {summary.get('deterministic_tui_ready')}/{summary.get('case_count')}")
            print(f"- real TUI still captures: {summary.get('real_tui_stills')}/{summary.get('case_count')}")
            print(f"- short GIF recordings: {summary.get('short_recordings')}/{summary.get('case_count')}")
            print(
                "- live-run streaming proof manifests: "
                f"{summary.get('streaming_proof_ready')}/{summary.get('case_count')}"
            )
            print(f"- ready cases: {summary.get('ready_for_real_demo')}/{summary.get('case_count')}")
        cases = ndp.get("cases", [])
        if required and isinstance(cases, list):
            for case in cases:
                if not isinstance(case, dict) or case.get("ready_for_real_demo"):
                    continue
                print(
                    "- missing: {title} (visuals={visual}, streaming={streaming})".format(
                        title=case.get("title"),
                        visual="yes"
                        if case.get("real_tui_recording", {}).get("visual_ok")
                        else "no",
                        streaming="yes"
                        if case.get("real_tui_recording", {}).get("streaming_ok")
                        else "no",
                    )
                )
        print()
    strict = result.get("strict_live_pass")
    if isinstance(strict, dict):
        print("## strict_live_pass")
        print()
        print(f"- status: {strict.get('status') or ('pass' if strict.get('ok') else 'not passing')}")
        reports = strict.get("reports", [])
        if isinstance(reports, list):
            for report in reports:
                if isinstance(report, dict):
                    print(f"- {report.get('path')}: `{report.get('verdict')}`")
                    missing = report.get("missing", [])
                    if isinstance(missing, list) and missing:
                        for item in missing:
                            print(f"  - missing: {item}")
        print()
    ledger = result.get("missing_capture_ledger")
    if isinstance(ledger, dict):
        print("## missing_capture_ledger")
        print()
        print(f"- path: {ledger.get('path')}")
        print(f"- deferred captures: {ledger.get('count')}")
        print(f"- issue refs: {'present' if ledger.get('ok') else 'missing'}")
        missing_issue_refs = ledger.get("missing_issue_refs", [])
        if isinstance(missing_issue_refs, list) and missing_issue_refs:
            print("- missing issue refs:")
            for row in missing_issue_refs:
                if not isinstance(row, dict):
                    continue
                print(
                    f"  - {row.get('priority')} · {row.get('area')}: "
                    f"{row.get('missing_capture')}"
                )
        priorities = ledger.get("priorities", {})
        if isinstance(priorities, dict) and priorities:
            print("- priorities:")
            for priority, count in priorities.items():
                print(f"  - {priority}: {count}")
        else:
            print("- priorities: none")
        if include_deferred:
            rows = ledger.get("rows", [])
            if isinstance(rows, list) and rows:
                print("- rows:")
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    print(
                        f"  - {row.get('priority')} · {row.get('area')}: "
                        f"{row.get('missing_capture')}"
                    )
        print()
    missing_report = result.get("missing_capture_report")
    if isinstance(missing_report, dict):
        print("## missing_capture_report")
        print()
        print(f"- path: {missing_report.get('path')}")
        print(f"- status: {missing_report.get('state')}")
        print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root to inspect")
    parser.add_argument("--json", action="store_true", help="print JSON instead of Markdown")
    parser.add_argument(
        "--require-git-tracked",
        action="store_true",
        help="fail required artifacts that exist locally but are not tracked by git",
    )
    parser.add_argument(
        "--require-strict-live-pass",
        action="store_true",
        help="fail unless at least one maintained strict live-observability report has verdict PASS",
    )
    parser.add_argument(
        "--require-indexed",
        action="store_true",
        help="fail when tapes/screenshots exist but are not referenced by visual-loop index files or the required manifest",
    )
    parser.add_argument(
        "--ndp-demo-report",
        default=str(check_ndp_demo_readiness.DEFAULT_REPORT),
        help="four-case NDP evidence report to summarize in the corpus output",
    )
    parser.add_argument(
        "--require-ndp-demo-ready",
        action="store_true",
        help="fail unless every NDP demo case has artifact proof, real TUI visuals, and streaming proof",
    )
    parser.add_argument(
        "--include-deferred",
        action="store_true",
        help="include the Missing Or Deferred capture ledger rows in the Markdown report",
    )
    parser.add_argument(
        "--write-deferred-report",
        help="write a generated Markdown backlog from the Missing Or Deferred capture ledger",
    )
    args = parser.parse_args(argv)

    result = check_corpus(
        Path(args.root),
        require_tracked=args.require_git_tracked,
        require_strict_live_pass=args.require_strict_live_pass,
        require_indexed=args.require_indexed,
        require_ndp_demo_ready=args.require_ndp_demo_ready,
        ndp_report_path=Path(args.ndp_demo_report),
    )
    if args.write_deferred_report:
        write_missing_capture_report(result, Path(args.write_deferred_report))
        result = check_corpus(
            Path(args.root),
            require_tracked=args.require_git_tracked,
            require_strict_live_pass=args.require_strict_live_pass,
            require_indexed=args.require_indexed,
            require_ndp_demo_ready=args.require_ndp_demo_ready,
            ndp_report_path=Path(args.ndp_demo_report),
        )
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print_text_report(result, include_deferred=args.include_deferred)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

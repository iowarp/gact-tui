#!/usr/bin/env python3
"""Check that the visual-loop acceptance corpus is present.

This is intentionally a filesystem health check, not image diffing. It gives
release hardening a fast gate that catches missing tapes, screenshots, and
temporal proof artifacts before a reviewer starts manual visual inspection.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CorpusGroup:
    name: str
    description: str
    required: tuple[str, ...]


STRICT_LIVE_REPORTS: tuple[str, ...] = (
    "visual_loop/screenshots/live_observability_clio_semantic_live_events.strict.report.md",
)


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
            "visual_loop/screenshots/semantic_live_events_running.png",
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
            "visual_loop/tapes/semantic_file_viewer_module.tape",
            "visual_loop/screenshots/semantic_file_viewer_module_initial.png",
            "visual_loop/screenshots/semantic_file_viewer_module_expanded.png",
            "visual_loop/screenshots/semantic_file_viewer_module_detail.png",
        ),
    ),
    CorpusGroup(
        name="settings_provider",
        description="settings tabs, provider setup, and white-background modal smoke",
        required=(
            "visual_loop/tapes/semantic_settings_lists.tape",
            "visual_loop/screenshots/semantic_settings_agent.png",
            "visual_loop/screenshots/semantic_settings_theme.png",
            "visual_loop/screenshots/semantic_settings_tui.png",
            "visual_loop/screenshots/semantic_settings_language.png",
            "visual_loop/tapes/semantic_provider_setup.tape",
            "visual_loop/screenshots/semantic_provider_setup.png",
            "visual_loop/screenshots/semantic_provider_setup_provider_changed.png",
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
        name="questions_retry_permissions",
        description="ask-user, retry, permissions, and action modals",
        required=(
            "visual_loop/tapes/issue57_ask_user_retry.tape",
            "visual_loop/screenshots/issue57_ask_user_retry.png",
            "visual_loop/screenshots/issue57_ask_user_answer_modal.png",
            "visual_loop/screenshots/issue57_retry_model_modal.png",
            "visual_loop/screenshots/issue57_retry_notes_modal.png",
            "visual_loop/tapes/semantic_permissions_inspector.tape",
            "visual_loop/screenshots/semantic_permissions_inspector.png",
            "visual_loop/tapes/semantic_conversation_actions.tape",
            "visual_loop/screenshots/semantic_conversation_actions.png",
        ),
    ),
    CorpusGroup(
        name="marketplace_blueprints",
        description="Agent Blueprint marketplace, source provenance, validation, and lifecycle proof",
        required=(
            "visual_loop/tapes/semantic_agent_blueprint_management.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_management_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_install.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_installed.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validate.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_validation_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_builtin_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_workspace_detail.png",
            "visual_loop/screenshots/semantic_agent_blueprint_management_updated.png",
            "visual_loop/tapes/semantic_agent_blueprint_sources.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_catalog.png",
            "visual_loop/screenshots/semantic_agent_blueprint_sources_detail.png",
            "visual_loop/tapes/semantic_agent_blueprint_commands.tape",
            "visual_loop/screenshots/semantic_agent_blueprint_commands_palette.png",
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
            "visual_loop/tapes/live_clio_nanoagents.tape",
            "visual_loop/screenshots/live_clio_nanoagents_collapsed.png",
            "visual_loop/screenshots/live_clio_nanoagents_expanded.png",
            "visual_loop/screenshots/live_clio_nanoagent_child_open.png",
            "visual_loop/tapes/live_clio_sidebar_errors.tape",
            "visual_loop/screenshots/live_clio_error_session.png",
            "visual_loop/screenshots/live_clio_error_detail.png",
            "visual_loop/tapes/live_clio_provenance_detail.tape",
            "visual_loop/screenshots/live_clio_provenance_selection.png",
            "visual_loop/screenshots/live_clio_provenance_detail.png",
        ),
    ),
    CorpusGroup(
        name="temporal_observability",
        description="JSONL/report gates for live semantic streaming",
        required=(
            "visual_loop/assert_live_observability.py",
            "visual_loop/test_assert_live_observability.py",
            "visual_loop/capture_live_observability.py",
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


def check_group(root: Path, group: CorpusGroup, *, tracked: set[str] | None = None) -> list[str]:
    missing: list[str] = []
    for rel in group.required:
        path = root / rel
        if not path.exists():
            missing.append(rel + " (missing)")
        elif path.is_file() and path.stat().st_size == 0:
            missing.append(rel + " (empty)")
        elif tracked is not None and rel not in tracked:
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


def check_corpus(root: Path, *, require_tracked: bool = False, require_strict_live_pass: bool = False) -> dict[str, object]:
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
    result: dict[str, object] = {"ok": ok, "groups": groups}
    if require_strict_live_pass:
        strict = check_strict_live_reports(root)
        result["strict_live_pass"] = strict
        if not strict["ok"]:
            result["ok"] = False
    return result


def print_text_report(result: dict[str, object]) -> None:
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
    args = parser.parse_args(argv)

    result = check_corpus(
        Path(args.root),
        require_tracked=args.require_git_tracked,
        require_strict_live_pass=args.require_strict_live_pass,
    )
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print_text_report(result)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

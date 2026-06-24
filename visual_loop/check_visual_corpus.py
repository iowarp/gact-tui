#!/usr/bin/env python3
"""Check that the visual-loop acceptance corpus is present.

This is intentionally a filesystem health check, not image diffing. It gives
release hardening a fast gate that catches missing tapes, screenshots, and
temporal proof artifacts before a reviewer starts manual visual inspection.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import check_ndp_demo_readiness
import check_slash_command_coverage
from visual_corpus_artifacts import (
    ARTIFACT_EXTENSIONS,
    ARTIFACT_INDEX_FILES,
    MISSING_CAPTURE_REPORT,
    TRACKED_ARTIFACT_INDEX_FILES,
    MissingCapture,
    check_missing_capture_ledger,
    check_missing_capture_report_sync,
    coverage_index_artifacts,
    indexed_artifacts,
    looks_like_visual_artifact,
    missing_capture_ledger,
    normalize_coverage_artifact,
    render_missing_capture_report,
    write_missing_capture_report,
)
from visual_corpus_checks import (
    check_artifact_index,
    check_artifact_indices,
    check_coverage_index,
    check_group,
    check_strict_live_reports,
    check_unindexed_artifacts,
    report_verdict,
    requires_git_tracking,
    strict_report_missing_items,
    tracked_paths,
)
from visual_corpus_manifest import (
    CORPUS_GROUPS,
    STRICT_LIVE_REPORTS,
    CorpusGroup,
    existing_visual_artifacts,
    manifest_artifacts,
)
from visual_corpus_report import print_text_report

__all__ = [
    "ARTIFACT_EXTENSIONS",
    "ARTIFACT_INDEX_FILES",
    "CORPUS_GROUPS",
    "MISSING_CAPTURE_REPORT",
    "STRICT_LIVE_REPORTS",
    "TRACKED_ARTIFACT_INDEX_FILES",
    "CorpusGroup",
    "MissingCapture",
    "check_artifact_index",
    "check_artifact_indices",
    "check_corpus",
    "check_coverage_index",
    "check_group",
    "check_missing_capture_ledger",
    "check_missing_capture_report_sync",
    "check_strict_live_reports",
    "check_unindexed_artifacts",
    "coverage_index_artifacts",
    "existing_visual_artifacts",
    "indexed_artifacts",
    "looks_like_visual_artifact",
    "manifest_artifacts",
    "missing_capture_ledger",
    "normalize_coverage_artifact",
    "print_text_report",
    "render_missing_capture_report",
    "report_verdict",
    "requires_git_tracking",
    "strict_report_missing_items",
    "tracked_paths",
    "write_missing_capture_report",
]


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

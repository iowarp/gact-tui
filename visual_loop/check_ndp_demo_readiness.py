#!/usr/bin/env python3
"""Audit four-case NDP demo evidence without starting CLIO.

The demo has two different proof levels:

- CLIO evidence: the benchmark report says the real agent produced the named
  artifact.
- TUI evidence: the visual-loop corpus has recordings of a human operating the
  TUI while the case runs.

This checker keeps those separate so deterministic fixtures cannot be mistaken
for real end-to-end demo recordings.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


from ndp_demo_readiness_model import (
    CASES,
    DEFAULT_REPORT,
    GIF_SIGNATURES,
    PNG_SIGNATURE,
    REAL_CAPTURE_SUFFIXES,
    REAL_RECORDING_SUFFIX,
    REAL_STILL_CAPTURE_SUFFIXES,
    REQUIRED_MANIFEST_FIELDS,
    DemoCase,
    artifact_ok_pattern,
    bool_field,
    case_status,
    check_readiness,
    existing_paths,
    int_value,
    real_capture_artifact_status,
    real_capture_artifact_statuses,
    real_capture_manifest_path,
    real_capture_manifest_status,
    real_capture_paths,
    real_recording_path,
    real_still_capture_paths,
    report_case_evidence,
)
from ndp_demo_readiness_report import render_markdown, write_markdown_report

__all__ = [
    "CASES",
    "DEFAULT_REPORT",
    "GIF_SIGNATURES",
    "PNG_SIGNATURE",
    "REAL_CAPTURE_SUFFIXES",
    "REAL_RECORDING_SUFFIX",
    "REAL_STILL_CAPTURE_SUFFIXES",
    "REQUIRED_MANIFEST_FIELDS",
    "DemoCase",
    "artifact_ok_pattern",
    "bool_field",
    "case_status",
    "check_readiness",
    "existing_paths",
    "int_value",
    "main",
    "real_capture_artifact_status",
    "real_capture_artifact_statuses",
    "real_capture_manifest_path",
    "real_capture_manifest_status",
    "real_capture_paths",
    "real_recording_path",
    "real_still_capture_paths",
    "render_markdown",
    "report_case_evidence",
    "write_markdown_report",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="gact-tui repository root")
    parser.add_argument("--report", default=str(DEFAULT_REPORT), help="four-case CLIO evidence report")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of Markdown")
    parser.add_argument(
        "--write-report",
        help="also write the Markdown readiness report to this path",
    )
    parser.add_argument("--strict", action="store_true", help="exit non-zero unless every case has real TUI proof")
    args = parser.parse_args()

    result = check_readiness(Path(args.root), Path(args.report))
    if args.write_report:
        write_markdown_report(result, Path(args.write_report))
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(render_markdown(result), end="")
    if args.strict and not result["ok"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

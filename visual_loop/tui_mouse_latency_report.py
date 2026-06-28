"""Validation helpers for PTY-driven TUI mouse latency captures."""

from __future__ import annotations

import json
import pathlib


def read_json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_report(report_path: pathlib.Path) -> dict:
    report = read_json(report_path)
    interactions = report.get("interactions")
    if not isinstance(interactions, list):
        raise RuntimeError("latency report missing interactions list")
    sections = report.get("sections")
    if not isinstance(sections, list):
        raise RuntimeError("latency report missing section summaries")

    click_rows = [
        row for row in interactions
        if isinstance(row, dict) and "click" in str(row.get("kind", ""))
    ]
    click_targets = {
        str(row.get("last_hit_target", ""))
        for row in click_rows
        if row.get("last_hit_target")
    }
    click_labels = {
        str(row.get("target_label", ""))
        for row in click_rows
        if row.get("target_label")
    }
    wheel_rows = [
        row for row in interactions
        if isinstance(row, dict) and "wheel" in str(row.get("kind", ""))
    ]
    section_summaries = [
        {
            "surface": str(row.get("surface", "")),
            "sample_count": int(row.get("sample_count") or 0),
            "click_count": int(row.get("click_count") or 0),
            "wheel_count": int(row.get("wheel_count") or 0),
            "key_count": int(row.get("key_count") or 0),
            "slowest_p95_ms": float(row.get("slowest_p95_ms") or 0),
            "slowest_max_ms": float(row.get("slowest_max_ms") or 0),
            "target_labels": row.get("target_labels") if isinstance(row.get("target_labels"), list) else [],
        }
        for row in sections
        if isinstance(row, dict)
    ]
    click_sections = {
        str(row["surface"])
        for row in section_summaries
        if int(row.get("click_count") or 0) > 0
    }
    wheel_sections = {
        str(row["surface"])
        for row in section_summaries
        if int(row.get("wheel_count") or 0) > 0
    }
    required_click_sections = {"header", "left sidebar", "conversation", "input"}
    required_wheel_sections = {"conversation"}
    missing_click_sections = sorted(required_click_sections - click_sections)
    missing_wheel_sections = sorted(required_wheel_sections - wheel_sections)
    if len(click_targets) < 2:
        raise RuntimeError(f"expected at least two target-labeled click rows, got {click_rows!r}")
    if not click_labels:
        raise RuntimeError(f"expected click target labels, got {click_rows!r}")
    if not wheel_rows:
        raise RuntimeError("expected at least one wheel latency row")
    if missing_click_sections:
        raise RuntimeError(f"missing required click latency sections: {missing_click_sections}; sections={section_summaries!r}")
    if missing_wheel_sections:
        raise RuntimeError(f"missing required wheel latency sections: {missing_wheel_sections}; sections={section_summaries!r}")
    return {
        "sample_count": int(report.get("sample_count") or 0),
        "surface_count": int(report.get("surface_count") or 0),
        "click_section_count": len(click_sections),
        "click_sections": sorted(click_sections),
        "wheel_sections": sorted(wheel_sections),
        "section_latency_summary": section_summaries,
        "click_target_count": len(click_targets),
        "click_targets": sorted(click_targets),
        "click_target_labels": sorted(click_labels),
        "wheel_rows": [
            {
                "surface": row.get("surface"),
                "kind": row.get("kind"),
                "target_label": row.get("target_label"),
                "last_hit_target": row.get("last_hit_target"),
            }
            for row in wheel_rows
        ],
    }

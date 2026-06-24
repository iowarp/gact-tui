"""Markdown report rendering for the visual corpus gate."""

from __future__ import annotations


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

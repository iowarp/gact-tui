"""Filesystem and index checks for the visual-loop acceptance corpus."""

from __future__ import annotations

import subprocess
from pathlib import Path

from visual_corpus_artifacts import (
    ARTIFACT_INDEX_FILES,
    TRACKED_ARTIFACT_INDEX_FILES,
    coverage_index_artifacts,
    indexed_artifacts,
)
from visual_corpus_manifest import (
    STRICT_LIVE_REPORTS,
    CorpusGroup,
    existing_visual_artifacts,
    manifest_artifacts,
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

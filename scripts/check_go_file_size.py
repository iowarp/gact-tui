#!/usr/bin/env python3
"""Ratchet guards against re-accretion in the gact-tui Go source tree.

Ported from clio-agent's ``scripts/check_file_size.py`` (iowarp/clio-agent#714,
#767). Two independent ratchets run here:

1. **Per-file line-count ratchet** over ``tui/``, ``emulator/`` and
   ``adapters/`` (``*.go``). A file **not** in :data:`SIZE_BASELINE` may not
   exceed :data:`DEFAULT_MAX_LINES` -- a brand-new god-file fails. A file **in**
   :data:`SIZE_BASELINE` (a known-oversized file awaiting decomposition) may not
   exceed its *recorded* line count -- it can shrink but never regrow.

2. **Package file-count freeze** for the flat ``tui/internal/ui`` package
   (iowarp/gact-tui#234). The 626-file mega-package may not grow; every new
   ``ui`` file must instead land in an extracted subpackage. The freeze count
   ratchets DOWN as clusters are extracted (e.g. slice U2 -> render/).

Both baselines may only ratchet **DOWN** (house precedent:
clio-agent ``check_silent_fallbacks.py::BASELINE_TOTAL``). When a file shrinks
under the cap, or the ``ui`` package sheds files, the same PR that shrank it
lowers the number here. Ratchet-down reports are advisory: they never fail.

Warn-then-enforce: by default this check is **advisory** -- it prints offenders
and exits 0 so CI stays green while the backlog is worked down. Pass
``--enforce`` (or set the flip date below) to make offenders fail the build.

    FLIP-TO-ENFORCING: on or after 2026-09-01, wire the CI step / ``make
    check-size`` target to pass ``--enforce`` (or delete this note and make
    ``--enforce`` the default). Until then the guard only warns.

Run locally::

    python3 scripts/check_go_file_size.py            # warn-only
    python3 scripts/check_go_file_size.py --enforce  # fail on offenders
    python3 scripts/check_go_file_size.py --max 600
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import NamedTuple

# Default maximum number of lines a single *non-baselined* Go file may contain.
# New files must stay under this cap.
DEFAULT_MAX_LINES = 600

# Source trees scanned for the per-file size ratchet, relative to the repo root.
SIZE_SCAN_ROOTS = ("tui", "emulator", "adapters")

# Per-file ratchet baseline: the known-oversized Go files at their current line
# counts, recorded so they cannot regrow. This mapping may only ratchet DOWN --
# when a file shrinks, lower its number here (or drop the entry once it falls
# under DEFAULT_MAX_LINES) in the same change. Paths are relative to the
# repository root and use forward slashes.
SIZE_BASELINE: dict[str, int] = {
    "emulator/internal/server/handlers_catalog_test.go": 1129,
    "emulator/internal/scenario/scenario_test.go": 719,
    "tui/internal/ui/execution_timeline_test.go": 698,
    "tui/internal/ui/execution_render.go": 646,
    "tui/internal/cli/commands.go": 606,
}

# The flat mega-package under active decomposition (iowarp/gact-tui#234). Only
# *.go files directly in this directory count (subpackages -- widget/, textutil/,
# locale/, testdata/ -- are excluded; they are the extraction precedent). This
# number is a FREEZE: it may only ratchet DOWN as clusters are extracted.
UI_PACKAGE_DIR = "tui/internal/ui"
UI_PACKAGE_FREEZE = 626


class SizeFailure(NamedTuple):
    """A Go file that breaks the size ratchet (fails under --enforce)."""

    rel: str
    count: int
    kind: str  # "new" (non-baselined over cap) or "regressed" (over recorded)
    limit: int  # the cap it broke (DEFAULT_MAX_LINES or the recorded baseline)


class RatchetDown(NamedTuple):
    """A baselined file that shrank -- advisory, not a failure."""

    rel: str
    count: int
    baseline: int
    under_cap: bool  # True once count <= max_lines (drop the entry entirely)


class PackageFailure(NamedTuple):
    """The ui package grew past its frozen file count."""

    directory: str
    count: int
    frozen: int


class Result(NamedTuple):
    """Outcome of a scan. Failures fail the build only under --enforce."""

    size_failures: list[SizeFailure]
    ratchet_downs: list[RatchetDown]
    package_failure: PackageFailure | None
    package_ratchet_down: int | None  # new (lower) count when ui shed files


def _repo_root() -> Path:
    """Return the repository root (parent of the ``scripts`` directory)."""
    return Path(__file__).resolve().parent.parent


def _count_lines(path: Path) -> int:
    """Return the number of lines in ``path``."""
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        return sum(1 for _ in handle)


def check_file_sizes(
    repo_root: Path,
    *,
    scan_roots: tuple[str, ...] = SIZE_SCAN_ROOTS,
    max_lines: int = DEFAULT_MAX_LINES,
    baseline: dict[str, int] | None = None,
) -> tuple[list[SizeFailure], list[RatchetDown]]:
    """Evaluate the per-file line-count ratchet under ``scan_roots``.

    Args:
        repo_root: Repository root; scan roots and baseline keys are relative
            to it (forward-slash paths).
        scan_roots: Top-level directories to walk for ``*.go`` files.
        max_lines: Cap applied to files not present in ``baseline``.
        baseline: Per-file recorded line counts. Defaults to
            :data:`SIZE_BASELINE`.

    Returns:
        A ``(failures, ratchet_downs)`` pair splitting build-failing offenders
        from advisory ratchet-down reports.
    """
    if baseline is None:
        baseline = SIZE_BASELINE

    failures: list[SizeFailure] = []
    ratchet_downs: list[RatchetDown] = []
    for root in scan_roots:
        scan_root = repo_root / root
        if not scan_root.exists():
            continue
        for path in sorted(scan_root.rglob("*.go")):
            if "vendor" in path.parts:
                continue
            rel = path.relative_to(repo_root).as_posix()
            count = _count_lines(path)
            recorded = baseline.get(rel)
            if recorded is None:
                if count > max_lines:
                    failures.append(SizeFailure(rel, count, "new", max_lines))
                continue
            if count > recorded:
                failures.append(SizeFailure(rel, count, "regressed", recorded))
            elif count < recorded:
                ratchet_downs.append(
                    RatchetDown(rel, count, recorded, under_cap=count <= max_lines)
                )
    return failures, ratchet_downs


def check_ui_package(
    repo_root: Path,
    *,
    directory: str = UI_PACKAGE_DIR,
    frozen: int = UI_PACKAGE_FREEZE,
) -> tuple[PackageFailure | None, int | None]:
    """Evaluate the flat ui-package file-count freeze.

    Only ``*.go`` files directly in ``directory`` count (subpackages are
    excluded). Growth past ``frozen`` is a failure; shrinkage is an advisory
    ratchet-down.

    Returns:
        A ``(failure, ratchet_down)`` pair -- at most one is non-None.
    """
    pkg_dir = repo_root / directory
    count = sum(1 for p in pkg_dir.glob("*.go") if p.is_file())
    if count > frozen:
        return PackageFailure(directory, count, frozen), None
    if count < frozen:
        return None, count
    return None, None


def check(
    repo_root: Path,
    *,
    max_lines: int = DEFAULT_MAX_LINES,
) -> Result:
    """Run both ratchets and return the combined :class:`Result`."""
    size_failures, ratchet_downs = check_file_sizes(repo_root, max_lines=max_lines)
    package_failure, package_ratchet_down = check_ui_package(repo_root)
    return Result(
        size_failures=size_failures,
        ratchet_downs=ratchet_downs,
        package_failure=package_failure,
        package_ratchet_down=package_ratchet_down,
    )


def _print_report(result: Result, max_lines: int, *, enforce: bool) -> None:
    """Print the ratchet report (advisory ratchet-downs then offenders)."""
    for entry in result.ratchet_downs:
        if entry.under_cap:
            print(
                f"OK (ratchet down): {entry.rel} is now {entry.count} lines "
                f"(<= {max_lines}) -- remove it from SIZE_BASELINE in "
                "scripts/check_go_file_size.py."
            )
        else:
            print(
                f"OK (ratchet down): {entry.rel} shrank {entry.baseline} -> "
                f"{entry.count} -- lower its SIZE_BASELINE entry to "
                f"{entry.count} in scripts/check_go_file_size.py."
            )
    if result.package_ratchet_down is not None:
        print(
            f"OK (ratchet down): {UI_PACKAGE_DIR} shed files "
            f"({UI_PACKAGE_FREEZE} -> {result.package_ratchet_down}) -- lower "
            f"UI_PACKAGE_FREEZE to {result.package_ratchet_down} in "
            "scripts/check_go_file_size.py."
        )

    has_failures = bool(result.size_failures) or result.package_failure is not None
    if not has_failures:
        print(
            f"OK: no Go file under {'/'.join(SIZE_SCAN_ROOTS)} exceeds its size "
            f"ratchet (cap {max_lines} for new files), and {UI_PACKAGE_DIR} "
            f"holds {UI_PACKAGE_FREEZE} files (frozen)."
        )
        return

    verb = "FAIL" if enforce else "WARN"
    if result.size_failures:
        print(
            f"{verb}: {len(result.size_failures)} Go file(s) break the size "
            "ratchet (#234):"
        )
        for entry in result.size_failures:
            if entry.kind == "new":
                print(
                    f"  {entry.rel}:{entry.count} (new file exceeds cap "
                    f"{entry.limit})"
                )
            else:
                print(
                    f"  {entry.rel}:{entry.count} (regressed past recorded "
                    f"baseline {entry.limit})"
                )
    if result.package_failure is not None:
        pf = result.package_failure
        print(
            f"{verb}: {pf.directory} grew to {pf.count} files (frozen at "
            f"{pf.frozen}) (#234) -- new ui code must land in an extracted "
            "subpackage, not the flat package."
        )
    if not enforce:
        print(
            "(warn-only: this guard is advisory until 2026-09-01; run with "
            "--enforce to fail on these.)"
        )


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Return 0 unless ``--enforce`` and offenders exist."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max",
        type=int,
        default=DEFAULT_MAX_LINES,
        help=f"Cap for non-baselined files (default: {DEFAULT_MAX_LINES}).",
    )
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="Fail the build on offenders (default: warn-only).",
    )
    args = parser.parse_args(argv)

    repo_root = _repo_root()
    result = check(repo_root, max_lines=args.max)
    _print_report(result, args.max, enforce=args.enforce)

    has_failures = bool(result.size_failures) or result.package_failure is not None
    return 1 if (args.enforce and has_failures) else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Enforce the repo media policy: eval/run artifacts must never be tracked.

Git history here was bloated by committed *run artifacts* -- audit-session
dumps, raw captures, logs -- not by the curated screenshot baselines. ``.gitignore``
already lists these patterns, but ``git add -f`` walks straight past it, so the
mistake can (and did) recur. This check re-asserts the denylist as a CI gate:
if a tracked path matches an artifact pattern, the build fails.

What is allowed (NOT flagged): curated ``screenshots/**`` PNG/GIF baselines
(routed through Git LFS by ``.gitattributes``), brand/design art under
``apps/design`` / ``apps/branding``, and doc images under ``docs/``. Marketing
and website media are fine; the output of a test run is not.

Run locally::

    python3 scripts/check_media_policy.py            # scan tracked files
    python3 scripts/check_media_policy.py --selftest # verify the matcher
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys

# Each entry is (compiled pattern, human reason). A tracked path matching any of
# these is a policy violation. Patterns mirror the .gitignore artifact rules so
# a forced add can't slip an eval artifact past them.
_ARTIFACT_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|/)tui_audit_[^/]*/"), "visual-audit run-output directory (regenerable)"),
    (re.compile(r"^visual_loop/.*\.(png|gif|jpe?g|jsonl|log)$"), "visual_loop harness output (regenerable)"),
    (re.compile(r"^screenshots/.*\.(jsonl|log|json|html|txt)$"), "run dump under screenshots/ (not a curated baseline)"),
    (re.compile(r"^apps/web/screenshots/.*\.(jsonl|log|json|html|txt|webm|mp4)$"), "apps/web CI run dump (curated .png set is allowlisted in .gitignore)"),
    (re.compile(r"^[^/]+\.(png|gif|webm|mp4)$"), "stray media at the repo root (no root media is tracked)"),
    (re.compile(r"(^|/)(tui_audit|audit-run|capture)[^/]*\.(png|gif|jsonl|log)$"), "capture/audit run artifact"),
]


def violations(paths: list[str]) -> list[tuple[str, str]]:
    """Pure: return (path, reason) for every tracked path that breaks the policy."""
    out: list[tuple[str, str]] = []
    for p in paths:
        norm = p.replace("\\", "/")
        for pat, reason in _ARTIFACT_RULES:
            if pat.search(norm):
                out.append((p, reason))
                break
    return out


def _tracked_files() -> list[str]:
    res = subprocess.run(
        ["git", "ls-files"], capture_output=True, text=True, check=True
    )
    return [line for line in res.stdout.splitlines() if line]


def _selftest() -> int:
    should_fail = [
        "visual_loop/tui_audit_2026_07/run.png",
        "screenshots/session/tui_audit_run1/frame.png",
        "screenshots/foo/dump.jsonl",
        "apps/web/screenshots/audit/run.log",
        "stray.png",
    ]
    should_pass = [
        "screenshots/02-streaming.png",
        "apps/web/screenshots/connect-screen.png",  # curated, allowlisted in .gitignore
        "apps/design/assets/brand/Banner.png",
        "docs/ref/ours.png",
        "tui/testdata/tapes/x.tape",
        "README.md",
    ]
    bad = [p for p in should_fail if not violations([p])]
    good = [p for p in should_pass if violations([p])]
    if bad:
        print("SELFTEST FAIL: these should have been flagged:", bad)
    if good:
        print("SELFTEST FAIL: these should NOT have been flagged:", good)
    if bad or good:
        return 1
    print("SELFTEST OK: artifact patterns match, curated media is allowed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true", help="verify the matcher and exit")
    args = parser.parse_args(argv)
    if args.selftest:
        return _selftest()

    found = violations(_tracked_files())
    if not found:
        print("OK: no tracked eval/run artifacts; media policy holds.")
        return 0
    print("::error::media policy: tracked eval/run artifacts must be removed (git history keeps them):")
    for path, reason in found:
        print(f"  {path} — {reason}")
    print(
        "\nThese are regenerable CI/run outputs. Remove them from tracking "
        "(git rm --cached) and rely on .gitignore; curated baselines live under "
        "screenshots/ (LFS) and design/doc art under apps/design, apps/branding, docs/."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

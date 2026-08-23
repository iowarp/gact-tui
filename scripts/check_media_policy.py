#!/usr/bin/env python3
"""Enforce the repo media policy: doc images live ONLY in ``docs/screenshots/``.

Git history here was bloated by full-screen PNG churn scattered across
``screenshots/``, the retired web screenshots, and ``tui/screenshots/``. Those
folders were consolidated into a single curated home, ``docs/screenshots/``
(iowarp/gact-tui#235). This check enforces two things as a CI gate:

1. **Screenshots have exactly one home.** Any tracked ``.png``/``.gif``/
   ``.webm``/``.mp4`` must sit under an allowed prefix — ``docs/screenshots/``
   (the curated doc images), the branding/design dirs, functional build assets
   (desktop app icons), or visual-test fixtures. A new image anywhere else
   (including a re-introduced ``screenshots/`` tree) fails the build.
2. **Run artifacts are never tracked.** Audit-session dumps, raw captures, and
   logs (``.jsonl``/``.log``/``.html``/``.txt``) are regenerable CI output.
   ``.gitignore`` lists them, but ``git add -f`` walks past it, so the denylist
   is re-asserted here.

Run locally::

    python3 scripts/check_media_policy.py            # scan tracked files
    python3 scripts/check_media_policy.py --selftest # verify the matcher
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys

# Directory prefixes where committed images (png/gif/webm/mp4) are allowed.
# docs/screenshots/ is the SOLE home for doc screenshots; the rest are brand /
# design art, functional build assets, and visual-test fixtures — not doc media.
_ALLOWED_IMAGE_PREFIXES: tuple[str, ...] = (
    "docs/screenshots/",              # curated doc images (sole screenshot home)
    "branding/",                      # branding mechanism assets
    "docs/ref/",                      # small static design-reference images
    "ref/",                           # design reference
    "logo/",                          # logo art
    "desktop/src-tauri/icons/",       # functional desktop app icons (build input)
    "web/tests/",                     # visual-test fixtures (build input)
)

_IMAGE_RE = re.compile(r"\.(png|gif|webm|mp4|jpe?g)$", re.IGNORECASE)

# Each entry is (compiled pattern, human reason). A tracked path matching any of
# these is a policy violation. Patterns mirror the .gitignore artifact rules so
# a forced add can't slip an eval artifact past them.
_ARTIFACT_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(^|/)tui_audit_[^/]*/"), "visual-audit run-output directory (regenerable)"),
    (re.compile(r"^visual_loop/.*\.(png|gif|jpe?g|jsonl|log)$"), "visual_loop harness output (regenerable)"),
    (re.compile(r"(^|/)screenshots/.*\.(jsonl|log|json|html|txt)$"), "run dump under a screenshots/ tree (not a curated baseline)"),
    (re.compile(r"(^|/)(tui_audit|audit-run|capture)[^/]*\.(png|gif|jsonl|log)$"), "capture/audit run artifact"),
]


def violations(paths: list[str]) -> list[tuple[str, str]]:
    """Pure: return (path, reason) for every tracked path that breaks the policy."""
    out: list[tuple[str, str]] = []
    for p in paths:
        norm = p.replace("\\", "/")
        matched = False
        for pat, reason in _ARTIFACT_RULES:
            if pat.search(norm):
                out.append((p, reason))
                matched = True
                break
        if matched:
            continue
        # Any tracked image must live under an allowed prefix; docs/screenshots/
        # is the only home for doc screenshots.
        if _IMAGE_RE.search(norm) and not norm.startswith(_ALLOWED_IMAGE_PREFIXES):
            out.append((p, "image outside docs/screenshots/ or an allowed branding/asset dir"))
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
        "screenshots/02-streaming.png",         # old scattered home is now forbidden
        "apps/web/screenshots/connect-screen.png",  # ditto
        "tui/screenshots/tui-agentview-top.png",    # ditto
    ]
    should_pass = [
        "docs/screenshots/02-streaming.png",     # the sole curated screenshot home
        "docs/screenshots/multi-backend-picker.png",
        "docs/ref/ours.png",
        "desktop/src-tauri/icons/icon.png",  # functional desktop app icon
        "web/tests/visual/fixtures/MTA1_GNSS_timeseries_displacement.png",  # visual-test fixture
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
    print("::error::media policy violations (doc images live only in docs/screenshots/):")
    for path, reason in found:
        print(f"  {path} — {reason}")
    print(
        "\nCurated doc screenshots live under docs/screenshots/ (the sole home); "
        "brand/design art under design, branding, docs/ref; functional "
        "build assets under desktop/src-tauri/icons and web/tests. "
        "Run/eval outputs are regenerable — remove them from tracking (git rm "
        "--cached) and rely on .gitignore. Screenshots are tape-regenerated, not "
        "committed elsewhere; no Git LFS."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Audit slash-command discoverability against the visual coverage ledger."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


COMMAND_RE = re.compile(r"/[A-Za-z0-9][A-Za-z0-9_-]*")


def extract_table_commands(markdown: str, section: str) -> tuple[str, ...]:
    lines = markdown.splitlines()
    in_section = False
    commands: set[str] = set()
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("## "):
            in_section = stripped == f"## {section}"
            continue
        if not in_section or not stripped.startswith("|"):
            continue
        if stripped.startswith("| ---") or stripped.startswith("| Command"):
            continue
        first_cell = stripped.strip("|").split("|", 1)[0]
        commands.update(COMMAND_RE.findall(first_cell))
    return tuple(sorted(commands))


def extract_help_commands(app_source: str) -> tuple[str, ...]:
    marker = 'title: "Commands"'
    idx = app_source.find(marker)
    if idx < 0:
        return ()
    keys_idx = app_source.find("keys: []helpKey{", idx)
    if keys_idx < 0:
        return ()
    end_idx = app_source.find("\n\t\t},\n\t},", keys_idx)
    if end_idx < 0:
        return ()
    block = app_source[keys_idx:end_idx]
    return tuple(sorted(set(COMMAND_RE.findall(block))))


def extract_builtin_palette_commands(app_source: str) -> tuple[str, ...]:
    start = app_source.find("localCmds := []gact.Command{")
    if start < 0:
        return ()
    end = app_source.find("\n\tif a.caps.Capabilities.IntegrationHealth", start)
    if end < 0:
        return ()
    block = app_source[start:end]
    commands = set(re.findall(r'localCmd\("([^"]+)"', block))
    commands.update(re.findall(r'ID:\s*"([^"]+)"', block))
    return tuple(sorted(cmd for cmd in commands if COMMAND_RE.fullmatch(cmd)))


def audit(root: Path) -> dict[str, object]:
    app_path = root / "tui/internal/ui/app.go"
    ledger_path = root / "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md"
    missing_files = [
        rel
        for rel, path in (
            ("tui/internal/ui/app.go", app_path),
            ("visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md", ledger_path),
        )
        if not path.exists()
    ]
    if missing_files:
        return {
            "ok": False,
            "canonical": [],
            "folded": [],
            "help_commands": [],
            "builtin_palette": [],
            "missing_files": missing_files,
            "missing_from_ledger": [],
            "missing_from_help": [],
            "folded_in_help": [],
            "canonical_not_builtin_or_help": [],
        }
    app_source = app_path.read_text(encoding="utf-8")
    ledger = ledger_path.read_text(encoding="utf-8")

    canonical = set(extract_table_commands(ledger, "Canonical Commands"))
    folded = set(extract_table_commands(ledger, "Hidden Or Folded Commands"))
    help_commands = set(extract_help_commands(app_source))
    builtin_palette = set(extract_builtin_palette_commands(app_source))

    documented = canonical | folded
    missing_from_ledger = sorted(builtin_palette - documented)
    missing_from_help = sorted(canonical - help_commands)
    folded_in_help = sorted(folded & help_commands)
    canonical_not_builtin_or_help = sorted(canonical - builtin_palette - help_commands)

    ok = not (missing_from_ledger or missing_from_help or folded_in_help or canonical_not_builtin_or_help)
    return {
        "ok": ok,
        "canonical": sorted(canonical),
        "folded": sorted(folded),
        "help_commands": sorted(help_commands),
        "builtin_palette": sorted(builtin_palette),
        "missing_files": [],
        "missing_from_ledger": missing_from_ledger,
        "missing_from_help": missing_from_help,
        "folded_in_help": folded_in_help,
        "canonical_not_builtin_or_help": canonical_not_builtin_or_help,
    }


def render(result: dict[str, object]) -> str:
    lines = [
        "# Slash Command Coverage Check",
        "",
        f"- verdict: `{'PASS' if result['ok'] else 'FAIL'}`",
        f"- canonical commands: `{len(result['canonical'])}`",
        f"- folded commands: `{len(result['folded'])}`",
        f"- help commands: `{len(result['help_commands'])}`",
        f"- built-in palette commands: `{len(result['builtin_palette'])}`",
        "",
    ]
    checks = (
        ("missing_files", "Required source files missing"),
        ("missing_from_ledger", "Built-in palette commands missing from the slash ledger"),
        ("missing_from_help", "Canonical ledger commands missing from Help Commands"),
        ("folded_in_help", "Folded commands still advertised in Help Commands"),
        ("canonical_not_builtin_or_help", "Canonical commands with no source/help evidence"),
    )
    for key, title in checks:
        values = result[key]
        lines.append(f"## {title}")
        lines.append("")
        if values:
            lines.extend(f"- `{value}`" for value in values)
        else:
            lines.append("- none")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="repository root")
    args = parser.parse_args(argv)
    result = audit(Path(args.root))
    print(render(result), end="")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

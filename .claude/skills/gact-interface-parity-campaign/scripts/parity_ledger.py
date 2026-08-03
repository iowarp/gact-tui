"""Build the cross-surface capability parity ledger for gact-tui.

Joins three sources of truth per capability flag:
  1. BACKEND truth  - GET /v1/capabilities from every --backend URL given
                      (raw JSON keys, so vendor flags the Go client cannot
                      decode are still visible).
  2. GO-DECODE truth - the json tags of gact.CapabilityFlags in
                      emulator/pkg/gact/types.go (what the TUI and the Go
                      adapters can even *see*).
  3. TUI-MATRIX truth - the per-flag support class rows in
                      docs/TUI_ONE_ZERO_CAPABILITY_MATRIX.md
                      (full / partial / gated / none).

Verdicts (one per row; any verdict other than OK makes the exit code 1):
  OK                 - flag is decoded and has a matrix row (or is absent
                       everywhere).
  UNDECODED-BY-GO    - a backend advertises a key the Go struct does not
                       decode: the TUI is silently blind to it. This is the
                       "backend grew a flag" branch -> go to Phase 2
                       classification in the skill.
  NO-MATRIX-ROW      - decoded by Go but missing from the matrix doc
                       (should be impossible while
                       TestCapabilityMatrixDocCoversDoctorRows passes).
  STALE-MATRIX-ROW   - matrix documents a field the Go struct no longer
                       decodes (doc drift).

Usage (from the repo root, stdlib only, no third-party deps):
  python .claude/skills/gact-interface-parity-campaign/scripts/parity_ledger.py \
      --backend emulator=http://127.0.0.1:7797 \
      --backend clio=http://127.0.0.1:17800

With two or more backends the script also prints per-flag value
disagreements (emulator-vs-clio divergence), which is expected — see the
skill's Phase 1 "expected observations".
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
GO_TYPES = REPO_ROOT / "emulator" / "pkg" / "gact" / "types.go"
MATRIX_DOC = REPO_ROOT / "docs" / "TUI_ONE_ZERO_CAPABILITY_MATRIX.md"


def go_decoded_flags() -> list[str]:
    """Extract json tag names from the CapabilityFlags struct."""
    src = GO_TYPES.read_text(encoding="utf-8")
    m = re.search(r"type CapabilityFlags struct \{(.*?)\n\}", src, re.DOTALL)
    if not m:
        sys.exit(f"error: CapabilityFlags struct not found in {GO_TYPES}")
    return re.findall(r'json:"([a-z0-9_]+)', m.group(1))


def matrix_rows() -> dict[str, str]:
    """Backend-field -> support class, parsed like the Go doc test does."""
    rows: dict[str, str] = {}
    for line in MATRIX_DOC.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("|") or "`" not in line:
            continue
        cols = line.split("|")
        if len(cols) < 5:
            continue
        field = cols[2].strip().strip("`")
        support = cols[3].strip()
        if field and support and field != "Backend field":
            rows[field] = support
    return rows


def fetch_capabilities(url: str) -> dict:
    req = urllib.request.Request(url.rstrip("/") + "/v1/capabilities")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def render_value(v: object) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, dict):
        return f"map({len(v)})"
    s = str(v)
    return s if len(s) <= 18 else s[:15] + "..."


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--backend",
        action="append",
        default=[],
        metavar="NAME=URL",
        help="backend to probe, e.g. emulator=http://127.0.0.1:7797 (repeatable)",
    )
    args = ap.parse_args()

    backends: dict[str, dict] = {}
    for spec in args.backend:
        name, _, url = spec.partition("=")
        if not url:
            ap.error(f"--backend needs NAME=URL, got {spec!r}")
        try:
            backends[name] = fetch_capabilities(url)
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
            print(f"error: {name} ({url}): {e}", file=sys.stderr)
            print(
                "       (backend not reachable - do NOT substitute a default;"
                " bring the backend up or drop it from the invocation)",
                file=sys.stderr,
            )
            return 2

    decoded = go_decoded_flags()
    matrix = matrix_rows()

    for name, caps in backends.items():
        be = caps.get("backend", {})
        print(
            f"# {name}: contract_version={caps.get('contract_version')!r} "
            f"backend={be.get('name')} {be.get('version')} ({be.get('vendor')})"
        )

    flag_maps = {n: c.get("capabilities", {}) for n, c in backends.items()}
    universe: list[str] = list(decoded)
    for fm in flag_maps.values():
        universe += [k for k in fm if k not in universe]
    universe += [k for k in matrix if k not in universe]

    problems: list[str] = []
    diffs: list[str] = []
    names = list(backends)
    header = ["flag", *names, "go-decoded", "tui-matrix", "verdict"]
    print("\t".join(header))
    for flag in universe:
        vals = [render_value(flag_maps[n].get(flag)) for n in names]
        in_go = flag in decoded
        in_matrix = matrix.get(flag, "-")
        advertised = any(flag in flag_maps[n] for n in names)
        if advertised and not in_go:
            verdict = "UNDECODED-BY-GO"
        elif in_go and flag not in matrix:
            verdict = "NO-MATRIX-ROW"
        elif flag in matrix and not in_go:
            verdict = "STALE-MATRIX-ROW"
        else:
            verdict = "OK"
        if verdict != "OK":
            problems.append(f"{flag}: {verdict}")
        if len(names) >= 2:
            present = {n: flag_maps[n].get(flag) for n in names}
            if len({json.dumps(v, sort_keys=True) for v in present.values()}) > 1:
                diffs.append(f"{flag}: " + " vs ".join(f"{n}={render_value(v)}" for n, v in present.items()))
        print("\t".join([flag, *vals, "yes" if in_go else "NO", in_matrix, verdict]))

    if diffs:
        print(f"\n# {len(diffs)} backend-vs-backend value differences (expected between emulator and clio):")
        for d in diffs:
            print("#   " + d)
    if problems:
        print(f"\n{len(problems)} PROBLEM ROW(S):", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1
    print("\nledger clean: every advertised flag is decoded and has a matrix row")
    return 0


if __name__ == "__main__":
    sys.exit(main())

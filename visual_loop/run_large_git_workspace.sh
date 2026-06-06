#!/usr/bin/env bash
set -euo pipefail

port="${GACT_LARGE_GIT_WORKSPACE_PORT:-41954}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-large-git-workspace.log"
root="$(pwd)"
repo="$(mktemp -d)"
config_dir="$(mktemp -d)"

git -C "$repo" init -q
python3 - "$repo/analysis_report.py" <<'PY'
import sys
path = sys.argv[1]
with open(path, "w", encoding="utf-8") as f:
    f.write("def summarize(row):\n")
    f.write("    return row['station']\n\n")
    for i in range(1, 121):
        f.write(f"# baseline processing step {i:03d}\n")
PY
git -C "$repo" add analysis_report.py
git -C "$repo" commit -qm "seed report"
python3 - "$repo/analysis_report.py" <<'PY'
import sys
path = sys.argv[1]
with open(path, "w", encoding="utf-8") as f:
    f.write("def summarize(row):\n")
    f.write("    station = row.get('station', 'unknown')\n")
    f.write("    magnitude = float(row.get('magnitude', 0))\n")
    f.write("    return f'{station}: {magnitude:.2f}'\n\n")
    for i in range(1, 181):
        f.write(f"# enriched benchmark processing step {i:03d}: preserve station metadata and artifact provenance\n")
PY

"${root}/.tools/emulator-server" \
  -port "$port" \
  -timing fast >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$repo" "$config_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/sessions" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

cd "$repo"
XDG_CONFIG_HOME="$config_dir" "${root}/tui/gact" --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

#!/usr/bin/env bash
set -euo pipefail

port="${GACT_MEMORY_STRESS_PORT:-41959}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-memory-stress.log"
workspace_dir="$(mktemp -d)"

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-workspace=false \
  -seed-workspaces "memory:${workspace_dir}" >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$workspace_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

small_file="${workspace_dir}/seismic-notes.md"
large_file="${workspace_dir}/oversized-waveform-log.md"
cat >"$small_file" <<'EOF'
San Diego EarthScope waveform review notes.
Station CI.BAR BHZ produced compact SAC trace evidence for the benchmark.
EOF
python3 - "$large_file" <<'PY'
import sys
path = sys.argv[1]
with open(path, "w", encoding="utf-8") as f:
    for i in range(900):
        f.write(f"oversized waveform staging line {i}: San Diego EarthScope waveform catalog trace evidence repeated for exclusion proof.\n")
PY

session_id="$(
  BACKEND="$backend" python3 - <<'PY'
import json
import os
import urllib.request

backend = os.environ["BACKEND"]
workspaces = json.load(urllib.request.urlopen(backend + "/v1/workspaces", timeout=5))["workspaces"]
workspace_id = workspaces[0]["id"]
messages = [{
    "role": "user",
    "parts": [{
        "type": "text",
        "text": "San Diego EarthScope waveform trace search request: inspect station CI.BAR BHZ and compare SAC statistics.",
    }],
}, {
    "role": "assistant",
    "parts": [{
        "type": "text",
        "text": f"Memory hit {i}: San Diego EarthScope waveform trace evidence retained; station CI.BAR BHZ has usable SAC statistics and visualization context.",
    } for i in range(8)],
}]
blob = {
    "format": "gact-v1",
    "exported_at": "2026-06-06T00:00:00Z",
    "session": {
        "workspace_id": workspace_id,
        "title": "memory stress evidence",
        "status": "idle",
    },
    "messages": messages,
}
req = urllib.request.Request(
    backend + "/v1/sessions/import",
    data=json.dumps(blob).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=5) as resp:
    print(json.load(resp)["id"])
PY
)"

curl -fsS -X POST "${backend}/v1/sessions/${session_id}/context/files" \
  -H 'Content-Type: application/json' \
  --data "{\"path\":\"${small_file}\",\"mode\":\"read\"}" >/dev/null
curl -fsS -X POST "${backend}/v1/sessions/${session_id}/context/files" \
  -H 'Content-Type: application/json' \
  --data "{\"path\":\"${large_file}\",\"mode\":\"read\"}" >/dev/null

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

#!/usr/bin/env bash
set -euo pipefail

port="${GACT_QUESTION_DETAIL_PORT:-41939}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-agent-question-detail.log"
workspace_dir="$(mktemp -d)"
export_path="${TMPDIR:-/tmp}/gact-agent-question-detail-session.json"

cleanup() {
  kill "$srv" 2>/dev/null || true
  rm -rf "$workspace_dir" "$export_path"
}
trap cleanup EXIT INT TERM

.tools/emulator-server \
  -port "$port" \
  -timing fast \
  -seed-workspace=false \
  -seed-workspaces "demo:${workspace_dir}" >"$log" 2>&1 &
srv=$!

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/workspaces" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

workspace_id="$(curl -fsS "${backend}/v1/workspaces" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["workspaces"][0]["id"])')"

python3 - "$workspace_id" >"$export_path" <<'PY'
import json
import sys

workspace_id = sys.argv[1]
json.dump({
    "format": "gact-v1",
    "exported_at": "2026-06-05T00:00:00Z",
    "session": {
        "workspace_id": workspace_id,
        "title": "agent question detail",
        "status": "idle",
    },
    "messages": [
        {
            "role": "assistant",
            "parts": [
                {
                    "type": "agent_question",
                    "question": {
                        "id": "q_demo_path",
                        "prompt": "Pick the seismic workspace path.",
                        "agent_id": "planner",
                        "category": "ambiguity",
                        "expected_answer_type": "path",
                        "status": "open",
                        "options": [
                            {"label": "/workspace/demo", "description": "Use the active demo workspace."},
                            {"label": "/tmp/clio-scratch", "description": "Use a scratch workspace."}
                        ]
                    }
                }
            ],
        }
    ],
}, sys.stdout)
PY

session_id="$(curl -fsS -X POST "${backend}/v1/sessions/import" \
  -H 'Content-Type: application/json' \
  --data-binary "@${export_path}" |
  python3 -c 'import json,sys; data=json.load(sys.stdin); print(data["id"])')"

GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro

#!/usr/bin/env bash
set -euo pipefail

port="${GACT_ASK_USER_STRESS_PORT:-41958}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-ask-user-stress.log"

.tools/emulator-server -port "$port" -timing fast >"$log" 2>&1 &
srv=$!
tui_pid=""
producer_pid=""
cleanup() {
  if [ -n "${producer_pid:-}" ]; then
    kill "$producer_pid" 2>/dev/null || true
  fi
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

session_id="$(
  BACKEND="$backend" python3 - <<'PY'
import json
import os
import urllib.request

backend = os.environ["BACKEND"]
blob = {
    "format": "gact-v1",
    "exported_at": "2026-06-06T00:00:00Z",
    "session": {
        "workspace_id": "ws_default",
        "title": "ask-user stress lifecycle",
        "status": "idle",
    },
    "messages": [
        {
            "role": "assistant",
            "parts": [{"type": "text", "text": "Ready to exercise live ask-user lifecycle states."}],
        }
    ],
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

(
  BACKEND="$backend" SESSION_ID="$session_id" python3 - <<'PY'
import json
import os
import time
import urllib.parse
import urllib.request

backend = os.environ["BACKEND"]
sid = os.environ["SESSION_ID"]

def post(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(backend + path, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.load(resp)

def get(path):
    with urllib.request.urlopen(backend + path, timeout=5) as resp:
        return json.load(resp)

def wait_status(qid, status, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = get(f"/v1/sessions/{urllib.parse.quote(sid)}/questions")
        for q in data.get("questions", []):
            if q.get("id") == qid and q.get("status") == status:
                return q
        time.sleep(0.2)
    raise TimeoutError(f"question {qid} did not reach {status}")

time.sleep(1.0)

q1 = post(f"/v1/sessions/{urllib.parse.quote(sid)}/questions", {
    "prompt": "Which evidence source should the seismic workflow inspect first?",
    "kind": "choice",
    "source": "seismic_orchestrator",
    "turn_id": "turn_choice",
    "options": [
        {"value": "earthscope", "label": "EarthScope", "description": "Use waveform discovery and SAC traces."},
        {"value": "ndp", "label": "NDP catalog", "description": "Use staged catalog resources first."},
    ],
})
wait_status(q1["id"], "answered")

q2 = post(f"/v1/sessions/{urllib.parse.quote(sid)}/questions", {
    "prompt": "Add a short operator note for the benchmark evidence report.",
    "kind": "freeform",
    "source": "analysis_expert",
    "turn_id": "turn_freeform",
})
wait_status(q2["id"], "answered")

q3 = post(f"/v1/sessions/{urllib.parse.quote(sid)}/questions", {
    "prompt": "Cancel this stalled fallback branch before continuing the demo?",
    "kind": "confirmation",
    "source": "visualization_expert",
    "turn_id": "turn_cancel",
})
wait_status(q3["id"], "cancelled")
PY
) &
producer_pid=$!

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

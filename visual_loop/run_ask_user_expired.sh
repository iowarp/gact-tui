#!/usr/bin/env bash
set -euo pipefail

port="${GACT_ASK_USER_EXPIRED_PORT:-41959}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-ask-user-expired.log"

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
        "title": "ask-user timeout lifecycle",
        "status": "idle",
    },
    "messages": [
        {
            "role": "assistant",
            "parts": [{"type": "text", "text": "Ready to exercise ask-user expiry state."}],
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

time.sleep(1.0)
q = post(f"/v1/sessions/{urllib.parse.quote(sid)}/questions", {
    "prompt": "This routing question will time out before the operator answers. What should happen next?",
    "kind": "confirmation",
    "source": "routing_orchestrator",
    "turn_id": "turn_expired",
})
time.sleep(1.5)
post(f"/v1/sessions/{urllib.parse.quote(sid)}/questions/{urllib.parse.quote(q['id'])}/expire")
PY
) &
producer_pid=$!

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

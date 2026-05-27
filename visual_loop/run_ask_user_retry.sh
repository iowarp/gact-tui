#!/usr/bin/env bash
set -euo pipefail

port="${GACT_ASK_USER_RETRY_PORT:-41957}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-ask-user-retry.log"

.tools/emulator-server -port "$port" -timing fast >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
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
    "exported_at": "2026-05-27T00:00:00Z",
    "session": {
        "workspace_id": "ws_default",
        "title": "ask-user retry evidence",
        "status": "waiting_user",
    },
    "messages": [
        {
            "role": "assistant",
            "parts": [
                {
                    "type": "agent_question",
                    "question": {
                        "id": "q_dataset",
                        "prompt": "Which dataset should I inspect before continuing?",
                        "agent_id": "data_expert",
                        "category": "clarification",
                        "expected_answer_type": "choice",
                        "allow_freeform": True,
                        "choices": [
                            {"id": "csv", "label": "CSV"},
                            {"id": "parquet", "label": "Parquet"},
                        ],
                    },
                },
                {
                    "type": "retry_attempt",
                    "retry_attempt": {
                        "id": "attempt_2",
                        "original_message_id": "msg_original",
                        "status": "started",
                        "notes": "Use the CSV instead of the Parquet file.",
                        "model": {"provider_id": "anthropic", "model_id": "claude-sonnet"},
                        "warning": "Retrying with a different model may recompute provider-side KV cache.",
                    },
                },
            ],
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

env GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

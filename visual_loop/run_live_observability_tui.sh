#!/usr/bin/env bash
set -euo pipefail

backend="${GACT_BACKEND:-http://127.0.0.1:17800}"
stamp="$(date -u +%Y%m%d_%H%M%S)"
prompt="Search the National Data Platform for a small seismic waveform dataset. Use the NDP/catalog tooling if available, report one concrete candidate, and do not invent missing data."
workspace_id="$(
  curl -fsS "${backend}/v1/workspaces" |
    python -c 'import json,sys; rows=json.load(sys.stdin).get("workspaces", []); print(rows[0]["id"] if rows else "")'
)"

session_id="$(
  curl -fsS -X POST "${backend}/v1/sessions" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"codex tui live observability ${stamp}\",\"workspace_id\":\"${workspace_id}\"}" |
    python -c 'import json,sys; print(json.load(sys.stdin)["id"])'
)"

(
  sleep 1.5
  body="$(python -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "${prompt}")"
  curl -fsS -X POST "${backend}/v1/sessions/${session_id}/messages" \
    -H 'Content-Type: application/json' \
    --data-binary "${body}" >/dev/null
) >/tmp/gact-live-observability-post.log 2>&1 &

env GACT_ATTACH_SESSION_ID="${session_id}" ./tui/gact --backend "${backend}" --no-intro

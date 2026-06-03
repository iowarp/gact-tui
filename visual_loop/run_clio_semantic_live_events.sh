#!/usr/bin/env bash
set -euo pipefail

port="${CLIO_SEMANTIC_LIVE_PORT:-17910}"
backend="http://127.0.0.1:${port}"
clio_dir="${CLIO_AGENT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../clio-agent" && pwd)}"
tmp_dir="$(mktemp -d)"
app_module="${tmp_dir}/live_clio_semantic_app.py"
sessions_path="${tmp_dir}/sessions.json"
log="${TMPDIR:-/tmp}/gact-clio-semantic-live.log"
config_path="${tmp_dir}/gact-config.json"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions"],
    "right": []
  }
}
JSON

cat >"${app_module}" <<PY
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from clio_agent.gact.app import (
    _active_semantic_trace_id,
    _active_semantic_turn_id,
    _emit_semantic_event,
    build_app,
)


@dataclass
class Pred:
    answer: str = (
        "The live CLIO semantic stream reported the NDP catalog search "
        "before this final answer was written."
    )
    selected_expert: str = "data"
    routing_rationale: str = "Seismic dataset lookup routes to the data expert."


class LiveSemanticAgent:
    def forward(self, question: str, session_id: str):
        from clio_agent.tools.execution import _GLOBAL_TOOL_OBSERVER

        assert _GLOBAL_TOOL_OBSERVER is not None
        turn_id = _active_semantic_turn_id()
        trace_id = _active_semantic_trace_id()
        _emit_semantic_event(
            app,
            session_id,
            "delegation.started",
            turn_id=turn_id,
            trace_id=trace_id,
            status="running",
            summary="data delegated NDP catalog work to ndp_catalog.",
            actor={"agent_id": "data", "role": "parent_expert"},
            subject={"agent_id": "ndp_catalog", "role": "child_expert"},
            payload={
                "stage": "delegate.started",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
                "execution_mode": "visual_fixture",
            },
        )
        args = {"search_terms": "seismic", "limit": 5}
        _GLOBAL_TOOL_OBSERVER("NdpSearchDatasets", args, "started", None)
        time.sleep(4.0)
        _GLOBAL_TOOL_OBSERVER("NdpSearchDatasets", args, "completed", None)
        _emit_semantic_event(
            app,
            session_id,
            "delegation.completed",
            turn_id=turn_id,
            trace_id=trace_id,
            summary="ndp_catalog returned NDP search evidence to data.",
            actor={"agent_id": "ndp_catalog", "role": "child_expert"},
            subject={"agent_id": "data", "role": "parent_expert"},
            payload={
                "stage": "delegate.completed",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
                "return_to": "data",
                "duration_ms": 4000,
                "execution_mode": "visual_fixture",
                "output_summary": "NDP catalog search completed.",
            },
        )
        _emit_semantic_event(
            app,
            session_id,
            "delegation.parent_resumed",
            turn_id=turn_id,
            trace_id=trace_id,
            summary="data resumed after ndp_catalog.",
            actor={"agent_id": "data", "role": "parent_expert"},
            subject={"agent_id": "ndp_catalog", "role": "child_expert"},
            payload={
                "stage": "parent.resumed",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
                "resumed_from": "ndp_catalog",
                "return_payload": "compact_result",
                "execution_mode": "visual_fixture",
            },
        )
        pred = Pred()
        pred.expert_handoffs = [
            {
                "stage": "delegate.started",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
                "status": "running",
                "execution_mode": "visual_fixture",
            },
            {
                "stage": "delegate.completed",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
                "status": "completed",
                "return_to": "data",
                "execution_mode": "visual_fixture",
                "output_summary": "NDP catalog search completed.",
            },
            {
                "stage": "parent.resumed",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
                "status": "completed",
                "resumed_from": "ndp_catalog",
                "execution_mode": "visual_fixture",
            },
        ]
        return pred


app = build_app(sessions_path=Path(r"${sessions_path}"), agent=LiveSemanticAgent())
PY

server_pid=""
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  if [ -n "${server_pid:-}" ]; then
    kill "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

(
  cd "$clio_dir"
  PYTHONPATH="${tmp_dir}:${PYTHONPATH:-}" \
    CLIO_SEMANTIC_TRACE_BACKEND=none \
    uv run python -m uvicorn live_clio_semantic_app:app \
      --host 127.0.0.1 \
      --port "$port" \
      --log-level warning
) >"$log" 2>&1 &
server_pid=$!

healthy=""
for _ in $(seq 1 120); do
  if curl -fsS "${backend}/v1/capabilities" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 0.1
done
if [ -z "$healthy" ]; then
  echo "CLIO fixture did not become healthy on ${backend}" >&2
  tail -n 120 "$log" >&2 || true
  exit 1
fi

session_id="$(
  curl -fsS -X POST "${backend}/v1/sessions" \
    -H 'Content-Type: application/json' \
    -d '{"title":"clio semantic live events"}' |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])'
)"

(
  sleep 1.0
  curl -fsS -X POST "${backend}/v1/sessions/${session_id}/messages" \
    -H 'Content-Type: application/json' \
    -d '{"parts":[{"type":"text","text":"Find a seismic dataset and show live semantic progress."}]}' >/dev/null
) &

env GACT_CONFIG="$config_path" GACT_ATTACH_SESSION_ID="$session_id" ./tui/gact --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

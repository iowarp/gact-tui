#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${GACT_FILE_VIEWER_PORT:-41909}"
backend="http://127.0.0.1:${port}"
session_id="ses_seed_ws_default_1"
log="${TMPDIR:-/tmp}/gact-file-viewer.log"
config_dir="$(mktemp -d)"
fixture_dir="${TMPDIR:-/tmp}/gact-file-viewer-fixture"
config_path="${config_dir}/config.json"

cat >"${config_path}" <<'JSON'
{
  "sidebar_layout": {
    "left": ["sessions", "files", "context"]
  },
  "mouse_enabled": true
}
JSON

rm -rf "$fixture_dir"
mkdir -p "${fixture_dir}/docs/api" "${fixture_dir}/src/ui"
cat >"${fixture_dir}/README.md" <<'EOF'
# Visual fixture

This workspace has representative files for the local file viewer.
EOF
cat >"${fixture_dir}/docs/guide.md" <<'EOF'
# File Preview Guide

The detail viewer should render Markdown tables instead of showing raw pipes.

| Artifact | Status | Notes |
| --- | --- | --- |
| Markdown | ready | rendered and raw modes |
| JSON | ready | pretty and raw modes |
| CSV | ready | compact table preview |
EOF
printf 'openapi: 3.1.0\n' >"${fixture_dir}/docs/api/spec.yaml"
printf '{"artifact":{"kind":"timeseries","status":"ready"},"count":2}\n' >"${fixture_dir}/docs/result.json"
printf 'station,value\nMTA1,1.2\nPKRD,0.9\n' >"${fixture_dir}/docs/stations.csv"
printf 'package main\n\nfunc main() {}\n' >"${fixture_dir}/src/main.go"
printf 'module gact-fixture\n' >"${fixture_dir}/go.mod"

"${repo_root}/.tools/emulator-server" \
  -port "$port" \
  -timing fast \
  -seed-sessions ws_default=2 \
  -seed-messages "${session_id}=1" >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$config_dir" "$fixture_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/sessions" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

curl -fsS -X PATCH "${backend}/v1/workspaces/ws_default" \
  -H 'Content-Type: application/json' \
  --data "{\"name\":\"file viewer fixture\",\"root_path\":\"${fixture_dir}\"}" >/dev/null

cd "$fixture_dir"
env GACT_CONFIG="$config_path" GACT_ATTACH_SESSION_ID="$session_id" "${repo_root}/tui/gact" --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

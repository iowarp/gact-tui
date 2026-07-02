#!/usr/bin/env bash
# Live EarthScope streaming demo launcher.
#
#   demo.sh up      → start clio (:17801, SDK haiku) + web (:4173) + open Chrome
#   demo.sh live    → up, then drive a FRESH ndp_demo earthscope session in a
#                     headed Chrome (new session → prompt → enter) so you watch
#                     streaming + thinking + delegation/return semantics live,
#                     then it auto-reloads the session (reload-parity in the same
#                     window).
#   demo.sh reload <session_id>
#                   → up, then open that completed session headed (reload view).
#
# All paths are absolute; safe to run from anywhere.
set -u
MODE="${1:-up}"
SID_ARG="${2:-}"
GACT=D:/Libraries/Documents/projects/gact-tui
CLIO=D:/Libraries/Documents/projects/clio-agent
WEB="$GACT/apps/web"
BACKEND=http://127.0.0.1:17801
WEBURL=http://localhost:4173
WS_ID=ws_ndp_demo
WS_ROOT=D:/Libraries/Documents/projects/ndp-demo-workspace
QUERY='Find the nearest EarthScope GNSS station to Los Angeles, stage its time-series CSV, profile it, and create a displacement time-series plot.'
STAMP=$(date +%Y%m%d-%H%M%S)
EVID="$GACT/screenshots/live-demo-$STAMP"

clio_ready() { curl -s --max-time 4 "$BACKEND/v1/health" 2>/dev/null | grep -q '"name":"agent","status":"ready"'; }
web_up()    { curl -s --max-time 4 "$WEBURL" >/dev/null 2>&1; }

start_clio() {
  if clio_ready; then echo "clio already ready"; return; fi
  echo "starting clio (SDK haiku, PowerShell shell, audit) on :17801 ..."
  mkdir -p "$EVID"
  ( cd "$CLIO" && COLUMNS=400 \
      CLIO_LM_PROVIDER=claude_code CLIO_LM_MODEL=haiku CLIO_LM_API_BASE="claude-code://sdk" \
      CLIO_CLAUDE_CODE_TRANSPORT=sdk CLIO_ALLOWED_ROOTS="D:/Libraries/Documents/projects" \
      CLIO_STREAM_AUDIT_LOG="$EVID/backend-stream-audit.jsonl" \
      CLIO_SSE_EVENT_LOG="$EVID/backend-sse-events.jsonl" \
      uv run --no-sync python -c "import sys; sys.argv=['clio-agent-gact','--host','127.0.0.1','--port','17801']; from clio_agent.gact.app import main; main()" \
      > "$EVID/clio.out.log" 2> "$EVID/clio.err.log" & )
  echo -n "waiting for agent ready"
  for i in $(seq 1 60); do clio_ready && { echo " ready"; return; }; echo -n "."; sleep 3; done
  echo " TIMEOUT — check $EVID/clio.err.log"; exit 1
}

start_web() {
  if web_up; then echo "web already up at $WEBURL"; return; fi
  echo "building + starting web (:4173, clio brand) ..."
  ( cd "$GACT/apps" && GACT_BRAND=clio pnpm --filter @clio/web build > "$EVID/web-build.log" 2>&1 \
      && GACT_BRAND=clio pnpm --filter @clio/web preview > "$EVID/web.log" 2>&1 & )
  echo -n "waiting for web"
  for i in $(seq 1 40); do web_up && { echo " up"; return; }; echo -n "."; sleep 2; done
  echo " TIMEOUT — check $EVID/web.log"; exit 1
}

start_clio
start_web

case "$MODE" in
  up)
    echo "opening Chrome at $WEBURL"
    start "" chrome "$WEBURL" 2>/dev/null || cmd.exe /c start chrome "$WEBURL"
    echo "Ready. Click the completed 'ndp_demo' session to see the RELOAD render,"
    echo "or run:  bash $WEB/scripts/demo.sh live"
    ;;
  live)
    echo "driving a fresh ndp_demo earthscope session (headed) — watch the window"
    cd "$WEB" && CLIO_DEMO_HEADLESS=0 node scripts/record-web-demo.mjs \
      --headed --backend-url "$BACKEND" --web-url "$WEBURL" \
      --provider claude_code --model haiku --api-base "claude-code://sdk" --transport sdk \
      --blueprint earthscope-gnss-region \
      --workspace-id "$WS_ID" --workspace-name ndp_demo --workspace-root "$WS_ROOT" \
      --query "$QUERY" --out "$EVID/live"
    ;;
  reload)
    [ -z "$SID_ARG" ] && { echo "usage: demo.sh reload <session_id>"; exit 1; }
    cd "$WEB" && node scripts/record-web-demo.mjs \
      --headed --reload-only --backend-url "$BACKEND" --web-url "$WEBURL" \
      --workspace-id "$WS_ID" --session-id "$SID_ARG" --out "$EVID/reload"
    ;;
  *) echo "usage: demo.sh [up|live|reload <sid>]"; exit 1;;
esac

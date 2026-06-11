#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLIO_DIAGNOSTICS_CAPTURE_OWN_BACKEND=1 visual_loop/capture_live_diagnostics_tui.sh \
    --backend http://127.0.0.1:<PORT> \
    [--session <session-id>] [--out-dir visual_loop/screenshots]

This script records real CLIO/GACT diagnostics screenshots without managing
CLIO processes. It refuses to run unless CLIO_DIAGNOSTICS_CAPTURE_OWN_BACKEND=1
is set, so the caller must affirm that the backend URL is an isolated CLIO
instance they own. For active-stream metrics proof, start the benchmark turn in
that owned backend first and pass the running session id with --session.
EOF
}

backend=""
session_id="${GACT_DIAGNOSTICS_CAPTURE_SESSION:-}"
out_dir="visual_loop/screenshots"
width="1500"
height="900"
doctor_name="live_clio_doctor_partial_gaps.png"
metrics_name="live_clio_metrics_active_stream.png"
gif_name="live_clio_diagnostics_capture.gif"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)
      backend="${2:-}"
      shift 2
      ;;
    --session)
      session_id="${2:-}"
      shift 2
      ;;
    --out-dir)
      out_dir="${2:-}"
      shift 2
      ;;
    --width)
      width="${2:-}"
      shift 2
      ;;
    --height)
      height="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${CLIO_DIAGNOSTICS_CAPTURE_OWN_BACKEND:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_DIAGNOSTICS_CAPTURE_OWN_BACKEND=1 after confirming this backend is your isolated CLIO instance" >&2
  exit 2
fi
if [[ -z "$backend" ]]; then
  usage >&2
  exit 2
fi
if [[ ! -x ./tui/gact ]]; then
  echo "missing ./tui/gact; run: go build -p 1 -o tui/gact ./tui" >&2
  exit 2
fi

validate_capture_artifact() {
  local path="$1"
  if [[ ! -s "$path" ]]; then
    echo "capture artifact missing or empty: $path" >&2
    return 1
  fi
  python3 - "$path" <<'PY'
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
if not path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
    raise SystemExit(f"invalid PNG capture: {path}")
PY
}

mkdir -p "$out_dir"

backend_q="$(printf '%q' "$backend")"
launch="./tui/gact --backend ${backend_q} --no-intro"
if [[ -n "$session_id" ]]; then
  session_q="$(printf '%q' "$session_id")"
  launch="GACT_ATTACH_SESSION_ID=${session_q} ${launch}"
fi

tape="$(mktemp "${TMPDIR:-/tmp}/gact-live-diagnostics.XXXXXX.tape")"
cleanup() {
  rm -f "$tape"
}
trap cleanup EXIT

cat >"$tape" <<EOF
Output "${out_dir}/${gif_name}"

Set Shell "bash"
Set FontSize 14
Set Width ${width}
Set Height ${height}

Hide
Type "${launch}"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/doctor"
Enter
Wait+Screen /Doctor/
Sleep 700ms
Screenshot "${out_dir}/${doctor_name}"
Escape
Sleep 300ms

Type "/metrics"
Enter
Wait+Screen /Operations Metrics/
Sleep 700ms
Screenshot "${out_dir}/${metrics_name}"
Escape
Sleep 300ms

Type "q"
EOF

vhs "$tape"

validate_capture_artifact "${out_dir}/${doctor_name}"
validate_capture_artifact "${out_dir}/${metrics_name}"

python3 - "$backend" "$session_id" "${out_dir}/${doctor_name}" "${out_dir}/${metrics_name}" "${out_dir}/live_clio_diagnostics_manifest.json" <<'PY'
import json
import pathlib
import sys
import urllib.error
import urllib.request

backend, session_id, doctor, metrics, manifest = sys.argv[1:6]

def get_json(path):
    try:
        req = urllib.request.Request(
            backend.rstrip("/") + path,
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {}

health = get_json("/v1/health")
capabilities = get_json("/v1/capabilities")
metrics_payload = get_json("/v1/metrics")
session_payload = get_json(f"/v1/sessions/{session_id}") if session_id else {}

flags = capabilities.get("capabilities")
if not isinstance(flags, dict):
    flags = {}
explicit_gaps = flags.get("x_clio_capability_gaps")
explicit_gap_count = len(explicit_gaps) if isinstance(explicit_gaps, dict) else 0
false_capability_count = sum(1 for value in flags.values() if value is False)
capabilities_gap_count = explicit_gap_count or false_capability_count

sessions = metrics_payload.get("sessions")
if not isinstance(sessions, dict):
    sessions = {}
active_sessions = int(sessions.get("active") or 0)
latencies = metrics_payload.get("latencies")
if not isinstance(latencies, dict):
    latencies = {}
sample_count = 0
for row in latencies.values():
    if isinstance(row, dict):
        try:
            sample_count += int(row.get("count") or 0)
        except (TypeError, ValueError):
            pass

session_status = str(session_payload.get("status") or "").lower()
active_stream_metrics = bool(
    session_id
    and active_sessions > 0
    and session_status in {"running", "pending", "waiting_permission"}
)

pathlib.Path(manifest).write_text(
    json.dumps(
        {
            "backend": backend,
            "captured_from_owned_backend": True,
            "session_id": session_id,
            "session_status": session_payload.get("status", ""),
            "doctor_screenshot": doctor,
            "metrics_screenshot": metrics,
            "health_status": health.get("status") or health.get("overall_status") or "unknown",
            "doctor_partial_gaps": capabilities_gap_count > 0,
            "capabilities_gap_count": capabilities_gap_count,
            "metrics_active_sessions": active_sessions,
            "metrics_sample_count": sample_count,
            "active_stream_metrics": active_stream_metrics,
            "note": (
                "Captured against caller-affirmed isolated CLIO backend; "
                "active-stream proof requires the passed session to be running "
                "during metrics capture."
            ),
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
PY

printf 'wrote %s and %s\n' "${out_dir}/${doctor_name}" "${out_dir}/${metrics_name}"

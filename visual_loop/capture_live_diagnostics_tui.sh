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

backend, session_id, doctor, metrics, manifest = sys.argv[1:6]
pathlib.Path(manifest).write_text(
    json.dumps(
        {
            "backend": backend,
            "session_id": session_id,
            "doctor_screenshot": doctor,
            "metrics_screenshot": metrics,
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

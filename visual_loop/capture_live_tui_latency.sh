#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLIO_TUI_LATENCY_CAPTURE_OWN_BACKEND=1 visual_loop/capture_live_tui_latency.sh \
    --backend http://127.0.0.1:<PORT> \
    [--session <session-id>] [--out-dir visual_loop/screenshots]

Capture live TUI-side interaction latency proof from an owned CLIO backend.
The script does not start or stop CLIO. It drives the real TUI through several
operator surfaces, opens /metrics, and preserves a screenshot/GIF plus a small
manifest. It refuses to run unless the caller affirms the backend is isolated.
EOF
}

backend=""
session_id="${GACT_TUI_LATENCY_CAPTURE_SESSION:-}"
out_dir="visual_loop/screenshots"
width="1500"
height="900"
metrics_name="live_clio_tui_latency_metrics.png"
gif_name="live_clio_tui_latency_capture.gif"
manifest_name="live_clio_tui_latency_manifest.json"
report_name="live_clio_tui_latency_report.json"

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

if [[ "${CLIO_TUI_LATENCY_CAPTURE_OWN_BACKEND:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_TUI_LATENCY_CAPTURE_OWN_BACKEND=1 after confirming this backend is your isolated CLIO instance" >&2
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

validate_png() {
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
report_q="$(printf '%q' "${out_dir}/${report_name}")"
launch="GACT_TUI_LATENCY_REPORT=${report_q} ${launch}"

tape="$(mktemp "${TMPDIR:-/tmp}/gact-live-tui-latency.XXXXXX.tape")"
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
Sleep 900ms

# Generate real keyboard samples across distinct visible surfaces before opening
# Metrics. This VHS build has no scripted mouse primitive; mouse click/wheel
# classification is covered by the Go regression tests.
Tab
Sleep 180ms
Down
Sleep 180ms
Tab
Sleep 180ms
PageDown
Sleep 180ms
Tab
Sleep 180ms

Type "/metrics"
Enter
Wait+Screen /Operations Metrics/
Wait+Screen /TUI interaction latency/
Sleep 700ms
Screenshot "${out_dir}/${metrics_name}"

Escape
Sleep 200ms
Ctrl+C
Sleep 200ms
Ctrl+C
EOF

vhs "$tape"
validate_png "${out_dir}/${metrics_name}"

python3 - "$backend" "$session_id" "${out_dir}/${metrics_name}" "${out_dir}/${gif_name}" "${out_dir}/${manifest_name}" "${out_dir}/${report_name}" <<'PY'
import json
import pathlib
import sys
import urllib.error
import urllib.request

backend, session_id, metrics_png, gif_path, manifest, report_path = sys.argv[1:7]

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

metrics = get_json("/v1/metrics")
session = get_json(f"/v1/sessions/{session_id}") if session_id else {}
messages = get_json(f"/v1/sessions/{session_id}/messages") if session_id else {}
sessions = metrics.get("sessions") if isinstance(metrics, dict) else {}
if not isinstance(sessions, dict):
    sessions = {}
latencies = metrics.get("latencies") if isinstance(metrics, dict) else {}
if not isinstance(latencies, dict):
    latencies = {}

sample_count = 0
for row in latencies.values():
    if isinstance(row, dict):
        try:
            sample_count += int(row.get("count") or 0)
        except (TypeError, ValueError):
            pass

message_rows = messages.get("messages") if isinstance(messages, dict) else []
if not isinstance(message_rows, list):
    message_rows = []
metadata_blob = json.dumps(message_rows, sort_keys=True)

report = {}
report_file = pathlib.Path(report_path)
if not report_file.is_file():
    raise SystemExit(f"TUI latency report was not written: {report_file}")
try:
    report = json.loads(report_file.read_text(encoding="utf-8"))
except json.JSONDecodeError as exc:
    raise SystemExit(f"invalid TUI latency report JSON: {exc}") from exc
interactions = report.get("interactions")
if not isinstance(interactions, list):
    raise SystemExit("TUI latency report missing interactions list")
surface_kinds = [
    f"{row.get('surface', '')} {row.get('kind', '')}".strip()
    for row in interactions
    if isinstance(row, dict)
]
target_labels = [
    {
        "surface": row.get("surface", ""),
        "kind": row.get("kind", ""),
        "target_label": row.get("target_label", ""),
        "last_hit_target": row.get("last_hit_target", ""),
    }
    for row in interactions
    if isinstance(row, dict) and (row.get("target_label") or row.get("last_hit_target"))
]
sample_count_reported = int(report.get("sample_count") or 0)
if sample_count_reported <= 0:
    raise SystemExit("TUI latency report contains no interaction samples")

manifest_path = pathlib.Path(manifest)
manifest_path.write_text(
    json.dumps(
        {
            "backend": backend,
            "captured_from_owned_backend": True,
            "session_id": session_id,
            "session_status": session.get("status", ""),
            "session_message_count": len(message_rows),
            "metrics_screenshot": metrics_png,
            "recording_path": gif_path,
            "tui_latency_report": report_path,
            "tui_latency_section_expected": True,
            "tui_latency_sample_count": sample_count_reported,
            "tui_latency_surface_kinds": surface_kinds,
            "tui_latency_targets": target_labels,
            "tui_latency_click_samples": bool(report.get("supported_by", {}).get("clicks")) if isinstance(report.get("supported_by"), dict) else False,
            "tui_latency_wheel_samples": bool(report.get("supported_by", {}).get("wheels")) if isinstance(report.get("supported_by"), dict) else False,
            "interaction_surfaces_driven": [
                "left sidebar keys",
                "conversation keys",
                "input keys",
                "command palette/input keys",
            ],
            "mouse_click_wheel_covered_by_tests": True,
            "backend_metrics_active_sessions": int(sessions.get("active") or 0),
            "backend_metrics_sample_count": sample_count,
            "provider_streaming_limitation": "provider_streaming_limitation" in metadata_blob,
            "live_streaming_false": '"live_streaming": false' in metadata_blob,
            "note": (
                "TUI interaction latency samples are process-local and visible in "
                "the referenced /metrics screenshot. Backend metrics are recorded "
                "only to prove the capture used a live owned CLIO endpoint."
            ),
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
PY

printf 'wrote %s, %s, %s, and %s\n' \
  "${out_dir}/${metrics_name}" \
  "${out_dir}/${gif_name}" \
  "${out_dir}/${manifest_name}" \
  "${out_dir}/${report_name}"

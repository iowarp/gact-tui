#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLIO_NDP_CAPTURE_OWN_BACKEND=1 visual_loop/capture_ndp_demo_tui.sh \
    --backend http://127.0.0.1:<PORT> \
    --case california_nws_warnings|fresno_cimis_weather|san_diego_earthscope|california_wildfire \
    [--workspace <workspace-id-or-name-or-root>] \
    [--agent-blueprint <blueprint-id>] [--out-dir visual_loop/screenshots]

This script records a real CLIO/GACT TUI run without managing CLIO processes.
It refuses to run unless CLIO_NDP_CAPTURE_OWN_BACKEND=1 is set, so a caller has
to affirm that the backend URL is an isolated CLIO instance they own.
EOF
}

backend=""
case_id=""
agent_blueprint=""
workspace_selector="${GACT_NDP_CAPTURE_WORKSPACE:-}"
out_dir="visual_loop/screenshots"
width="1500"
height="900"
early_wait="6s"
live_wait="28s"
completion_timeout="900"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)
      backend="${2:-}"
      shift 2
      ;;
    --case)
      case_id="${2:-}"
      shift 2
      ;;
    --agent-blueprint)
      agent_blueprint="${2:-}"
      shift 2
      ;;
    --workspace)
      workspace_selector="${2:-}"
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
    --early-wait)
      early_wait="${2:-}"
      shift 2
      ;;
    --live-wait)
      live_wait="${2:-}"
      shift 2
      ;;
    --completion-timeout)
      completion_timeout="${2:-}"
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

if [[ "${CLIO_NDP_CAPTURE_OWN_BACKEND:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_NDP_CAPTURE_OWN_BACKEND=1 after confirming this backend is your isolated CLIO instance" >&2
  exit 2
fi
if [[ -z "$backend" || -z "$case_id" ]]; then
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
  case "$path" in
    *.png)
      python3 - "$path" <<'PY'
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
if not path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
    raise SystemExit(f"invalid PNG capture: {path}")
PY
      ;;
    *.gif)
      python3 - "$path" <<'PY'
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
header = path.read_bytes()[:6]
if header not in (b"GIF87a", b"GIF89a"):
    raise SystemExit(f"invalid GIF capture: {path}")
PY
      ;;
  esac
}

case "$case_id" in
  san_diego_earthscope)
    stem="ndp_tui_real_san_diego_earthscope"
    title="NDP real San Diego EarthScope"
    title_wait="NDP real San Diego"
    artifact_name="sac_traces_earthscope_CI_BAR_--_BHZ_2026-05-29T021201.png"
    prompt="Explore recent seismic activity around the San Diego area. Resolve the requested geography, find public EarthScope or earthquake catalog evidence, analyze the events and station context, and produce an artifact suitable for discussion."
    ;;
  california_wildfire)
    stem="ndp_tui_real_wildfire"
    title="NDP real California wildfire"
    title_wait="NDP real California"
    artifact_name="current_wildfires_ca.json"
    prompt="Find live or current California wildfire feature data through NDP. Query the ArcGIS feature records when available, summarize active California wildfire records, and produce the artifact current_wildfires_ca.json."
    ;;
  california_nws_warnings)
    stem="ndp_tui_real_california_nws_warnings"
    title="NDP real California NWS warnings"
    title_wait="NDP real California"
    artifact_name="california_nws_warnings.json"
    prompt="Find and query California National Weather Service warning or advisory feature data through NDP. Normalize epoch timestamps into ISO timestamps for readable analysis, summarize active warning records, and produce the artifact california_nws_warnings.json."
    ;;
  fresno_cimis_weather)
    stem="ndp_tui_real_fresno_cimis"
    title="NDP real Fresno CIMIS weather"
    title_wait="NDP real Fresno"
    artifact_name="cimis_fresno_weather.png"
    prompt="Use NDP to locate and stage CIMIS Station 80 Fresno State hourly weather data. Profile temperature, humidity, and wind fields across the staged CSV, then produce a weather time-series visualization artifact cimis_fresno_weather.png."
    ;;
  *)
    echo "unknown case: $case_id" >&2
    usage >&2
    exit 2
    ;;
esac

mkdir -p "$out_dir"
session_id="$(
  python3 - "$backend" "$title" "$agent_blueprint" "$workspace_selector" <<'PY'
import json
import sys
import urllib.request

backend, title, blueprint, workspace_selector = sys.argv[1:5]

def request(method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        backend.rstrip("/") + path,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}

def resolve_workspace(selector):
    if not selector:
        return ""
    rows = request("GET", "/v1/workspaces").get("workspaces", [])
    exact_id = [w for w in rows if str(w.get("id", "")) == selector]
    if exact_id:
        return str(exact_id[0]["id"])
    exact_name = [w for w in rows if str(w.get("name", "")) == selector]
    if exact_name:
        return str(exact_name[0]["id"])
    exact_root = [w for w in rows if str(w.get("root_path", "")) == selector]
    if exact_root:
        return str(exact_root[0]["id"])
    raise SystemExit(f"workspace not found for selector: {selector}")

workspace_id = resolve_workspace(workspace_selector)
body = {"title": title}
if workspace_id:
    body["workspace_id"] = workspace_id
session = request("POST", "/v1/sessions", body)
sid = str(session["id"])
if workspace_id and str(session.get("workspace_id", "")) != workspace_id:
    raise SystemExit(
        f"created session in {session.get('workspace_id')}, expected {workspace_id}"
    )
if blueprint:
    request("POST", f"/v1/sessions/{sid}/agent-blueprint", {"blueprint_id": blueprint})
print(json.dumps({"session_id": sid, "workspace_id": str(session.get("workspace_id", ""))}))
PY
)"
session_id="$(python3 - "$session_id" <<'PY'
import json
import sys
print(json.loads(sys.argv[1])["session_id"])
PY
)"

prompt_escaped="$(python3 - "$prompt" <<'PY'
import sys
print(sys.argv[1].replace("\\", "\\\\").replace('"', '\\"'))
PY
)"

tape="$(mktemp "${TMPDIR:-/tmp}/ndp-real-${case_id}.XXXXXX.tape")"
cleanup() {
  rm -f "$tape"
}
trap cleanup EXIT

cat >"$tape" <<EOF
Output "${out_dir}/${stem}_short.gif"

Set Shell "bash"
Set FontSize 14
Set Width ${width}
Set Height ${height}

Hide
Type "GACT_ATTACH_SESSION_ID=${session_id} ./tui/gact --backend ${backend} --no-intro${workspace_selector:+ --workspace ${workspace_selector}}"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /${title_wait}/
Sleep 1200ms
Type "${prompt_escaped}"
Sleep 500ms
Screenshot "${out_dir}/${stem}_prompt.png"

Enter
Wait+Screen /thinking|running|event:|ASSISTANT/
Sleep ${early_wait}
Screenshot "${out_dir}/${stem}_early.png"

Sleep ${live_wait}
Screenshot "${out_dir}/${stem}_live.png"

Ctrl+Z
EOF

echo "recording ${case_id} in session ${session_id}"
vhs "$tape"
validate_capture_artifact "${out_dir}/${stem}_prompt.png"
validate_capture_artifact "${out_dir}/${stem}_early.png"
validate_capture_artifact "${out_dir}/${stem}_live.png"
validate_capture_artifact "${out_dir}/${stem}_short.gif"
python3 - "$backend" "$session_id" "$case_id" "$artifact_name" "${out_dir}/${stem}_manifest.json" "$completion_timeout" <<'PY'
import json
import sys
import time
import urllib.request

backend, session_id, case_id, artifact_name, manifest_path, timeout_raw = sys.argv[1:7]
completion_timeout = float(timeout_raw)

def get_json(path):
    req = urllib.request.Request(
        backend.rstrip("/") + path,
        headers={"Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}

deadline = time.monotonic() + completion_timeout
session = {}
messages = []
while True:
    session = get_json(f"/v1/sessions/{session_id}")
    messages = get_json(f"/v1/sessions/{session_id}/messages?limit=100").get("messages", [])
    status = str(session.get("status", "")).lower()
    has_assistant = any(message.get("role") == "assistant" for message in messages)
    if status not in {"running", "waiting_permission", "pending"} and has_assistant:
        break
    if time.monotonic() >= deadline:
        break
    time.sleep(2)

assistant_text = []
all_metadata = []
assistant_errors = []
semantic_event_types = set()
semantic_event_count = 0
live_observed_event_count = 0

def inspect_metadata(metadata):
    global semantic_event_count, live_observed_event_count
    if not isinstance(metadata, dict):
        return
    raw_event = metadata.get("raw_event")
    if isinstance(raw_event, dict):
        event_type = raw_event.get("event_type")
        if isinstance(event_type, str) and event_type:
            semantic_event_types.add(event_type)
        semantic_event_count += 1
        if raw_event.get("live_observed") is True:
            live_observed_event_count += 1
    elif metadata.get("semantic_event") is True:
        event_type = metadata.get("event_type")
        if isinstance(event_type, str) and event_type:
            semantic_event_types.add(event_type)
        semantic_event_count += 1

for message in messages:
    if message.get("role") == "assistant":
        error_info = message.get("error_info")
        if isinstance(error_info, dict):
            assistant_errors.append(error_info)
        for part in message.get("parts") or []:
            text = part.get("text")
            if isinstance(text, str):
                assistant_text.append(text)
            metadata = part.get("metadata")
            if isinstance(metadata, dict):
                all_metadata.append(metadata)
                inspect_metadata(metadata)
        metadata = message.get("metadata")
        if isinstance(metadata, dict):
            all_metadata.append(metadata)
            inspect_metadata(metadata)

assistant_blob = "\n".join(assistant_text)
metadata_blob = json.dumps(all_metadata, sort_keys=True)
errors_blob = json.dumps(assistant_errors, sort_keys=True)
status = str(session.get("status", "")).lower()
manifest = {
    "case_id": case_id,
    "session_id": session_id,
    "backend": backend,
    "artifact_name": artifact_name,
    "session_status": session.get("status", ""),
    "assistant_message_count": sum(1 for message in messages if message.get("role") == "assistant"),
    "semantic_event_count": semantic_event_count,
    "live_observed_event_count": live_observed_event_count,
    "streaming_event_types": sorted(semantic_event_types),
    "verified_artifact": artifact_name in assistant_blob,
    "requested_user_input": "request_user_input" in assistant_blob,
    "provider_streaming_limitation": "provider_streaming_limitation" in metadata_blob,
    "live_streaming_false": '"live_streaming": false' in metadata_blob,
    "turn_cancelled": '"error": "cancelled"' in errors_blob or status == "cancelled",
    "completion_timeout": status in {"running", "waiting_permission", "pending"},
}
with open(manifest_path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
print("manifest:")
print("  " + manifest_path)
print("  verified_artifact=" + str(manifest["verified_artifact"]).lower())
print("  requested_user_input=" + str(manifest["requested_user_input"]).lower())
PY
echo "session_id=${session_id}"
echo "artifacts:"
echo "  ${out_dir}/${stem}_prompt.png"
echo "  ${out_dir}/${stem}_early.png"
echo "  ${out_dir}/${stem}_live.png"
echo "  ${out_dir}/${stem}_short.gif"

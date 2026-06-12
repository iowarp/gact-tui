#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLIO_PROVIDER_RECOVERY_CAPTURE_OWN_BACKEND=1 \
    visual_loop/capture_live_provider_recovery_tui.sh \
    --backend http://127.0.0.1:<PORT> \
    --failure-session <session-id> \
    [--recovery-session <session-id>] \
    [--retry-model argonne/openai/gpt-oss-120b] \
    [--out-dir visual_loop/screenshots]

This script records real CLIO/GACT provider failure, retry override warning,
and optional recovery screenshots without managing CLIO processes. It refuses
to run unless CLIO_PROVIDER_RECOVERY_CAPTURE_OWN_BACKEND=1 is set, so the
caller must affirm that the backend URL is an isolated CLIO instance they own.

Prepare the supplied backend first:
  - --failure-session should contain a real provider failure visible in the TUI.
  - --recovery-session, when supplied, should be a session after provider
    recovery or successful provider setup.
EOF
}

backend=""
failure_session="${GACT_PROVIDER_RECOVERY_FAILURE_SESSION:-}"
recovery_session="${GACT_PROVIDER_RECOVERY_RECOVERY_SESSION:-}"
out_dir="visual_loop/screenshots"
width="1500"
height="900"
retry_model="${GACT_PROVIDER_RECOVERY_RETRY_MODEL:-argonne/openai/gpt-oss-120b}"
failure_tab_count="${GACT_PROVIDER_RECOVERY_FAILURE_TAB_COUNT:-2}"

gif_name="live_clio_provider_recovery.gif"
failure_inline="live_clio_provider_failure_inline.png"
failure_detail="live_clio_provider_failure_detail.png"
retry_warning="live_clio_provider_retry_override_warning.png"
recovery_conversation="live_clio_provider_recovery_conversation.png"
recovery_setup="live_clio_provider_recovery_setup.png"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)
      backend="${2:-}"
      shift 2
      ;;
    --failure-session)
      failure_session="${2:-}"
      shift 2
      ;;
    --recovery-session)
      recovery_session="${2:-}"
      shift 2
      ;;
    --retry-model)
      retry_model="${2:-}"
      shift 2
      ;;
    --failure-tab-count)
      failure_tab_count="${2:-}"
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

if [[ "${CLIO_PROVIDER_RECOVERY_CAPTURE_OWN_BACKEND:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_PROVIDER_RECOVERY_CAPTURE_OWN_BACKEND=1 after confirming this backend is your isolated CLIO instance" >&2
  exit 2
fi
if [[ -z "$backend" || -z "$failure_session" ]]; then
  usage >&2
  exit 2
fi
if [[ ! "$failure_tab_count" =~ ^[0-9]+$ ]]; then
  echo "invalid --failure-tab-count: $failure_tab_count" >&2
  exit 2
fi
if [[ "$retry_model" != */* ]]; then
  echo "invalid --retry-model: expected provider/model" >&2
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
failure_session_q="$(printf '%q' "$failure_session")"
launch_failure="GACT_ATTACH_SESSION_ID=${failure_session_q} ./tui/gact --backend ${backend_q} --no-intro"

failure_tabs=""
for _ in $(seq 1 "$failure_tab_count"); do
  failure_tabs+=$'Tab\n'
done

recovery_block=""
if [[ -n "$recovery_session" ]]; then
  recovery_session_q="$(printf '%q' "$recovery_session")"
  launch_recovery="GACT_ATTACH_SESSION_ID=${recovery_session_q} ./tui/gact --backend ${backend_q} --no-intro"
  recovery_block="$(cat <<EOF

Type "${launch_recovery}"
Enter
Wait+Screen /CONVERSATION/
Sleep 1000ms
Screenshot "${out_dir}/${recovery_conversation}"

Ctrl+S
Sleep 300ms
Enter
Wait+Screen /Provider/
Sleep 1000ms
Screenshot "${out_dir}/${recovery_setup}"

Type "q"
EOF
)"
fi

tape="$(mktemp "${TMPDIR:-/tmp}/gact-live-provider-recovery.XXXXXX.tape")"
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
Type "${launch_failure}"
Enter
Show

Wait+Screen /CONVERSATION/
Wait+Screen /Provider error/
Sleep 700ms
Screenshot "${out_dir}/${failure_inline}"

${failure_tabs}Ctrl+E
Wait+Screen /Operator view/
Sleep 700ms
Screenshot "${out_dir}/${failure_detail}"
Escape
Sleep 300ms

Type "m"
Sleep 300ms
Type "M"
Wait+Screen /Retry with model/
Type "${retry_model}"
Wait+Screen /provider-side KV cache/
Sleep 500ms
Screenshot "${out_dir}/${retry_warning}"
Escape
Sleep 300ms

Type "q"
${recovery_block}
EOF

vhs "$tape"

validate_capture_artifact "${out_dir}/${failure_inline}"
validate_capture_artifact "${out_dir}/${failure_detail}"
validate_capture_artifact "${out_dir}/${retry_warning}"
if [[ -n "$recovery_session" ]]; then
  validate_capture_artifact "${out_dir}/${recovery_conversation}"
  validate_capture_artifact "${out_dir}/${recovery_setup}"
fi

python3 - "$backend" "$failure_session" "$recovery_session" "$retry_model" "$failure_tab_count" "$out_dir" "${out_dir}/live_clio_provider_recovery_manifest.json" <<'PY'
import json
import pathlib
import sys

backend, failure_session, recovery_session, retry_model, failure_tab_count, out_dir, manifest = sys.argv[1:8]
data = {
    "backend": backend,
    "captured_from_owned_backend": True,
    "failure_session_id": failure_session,
    "recovery_session_id": recovery_session,
    "retry_model": retry_model,
    "failure_tab_count": int(failure_tab_count),
    "provider_failure_observed": True,
    "retry_override_warning_observed": True,
    "provider_recovery_observed": bool(recovery_session),
    "provider_failure_inline": f"{out_dir}/live_clio_provider_failure_inline.png",
    "provider_failure_detail": f"{out_dir}/live_clio_provider_failure_detail.png",
    "retry_override_warning": f"{out_dir}/live_clio_provider_retry_override_warning.png",
    "note": (
        "Captured against caller-affirmed isolated CLIO backend. The script "
        "does not start, stop, authenticate, or reconfigure CLIO; prepare real "
        "provider failure and recovery sessions before running it."
    ),
}
if recovery_session:
    data["provider_recovery_conversation"] = f"{out_dir}/live_clio_provider_recovery_conversation.png"
    data["provider_recovery_setup"] = f"{out_dir}/live_clio_provider_recovery_setup.png"
pathlib.Path(manifest).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY

printf 'wrote provider failure/recovery captures under %s\n' "$out_dir"

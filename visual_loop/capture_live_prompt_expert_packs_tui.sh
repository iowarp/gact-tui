#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLIO_PROMPT_EXPERT_PACK_CAPTURE_OWN_BACKEND=1 \
  CLIO_PROMPT_EXPERT_PACK_CAPTURE_MUTATE=1 \
    visual_loop/capture_live_prompt_expert_packs_tui.sh \
    --backend http://127.0.0.1:<PORT> \
    --expert-pack-source <local-path-or-git-url> \
    [--session <session-id>] [--out-dir visual_loop/screenshots]

This script records real CLIO/GACT prompt-save and expert-pack lifecycle
screenshots. It performs writes against the supplied backend:
  - saves a prompt override to the codex profile
  - installs an expert pack from --expert-pack-source
  - updates the selected expert pack detail
  - deletes the selected expert pack detail

It refuses to run unless both guard environment variables are set. Use only
against an isolated backend/workspace where these mutations are expected.
EOF
}

backend=""
session_id="${GACT_PROMPT_EXPERT_PACK_CAPTURE_SESSION:-}"
out_dir="visual_loop/screenshots"
width="1500"
height="900"
expert_pack_source=""
expert_pack_down_count="${GACT_PROMPT_EXPERT_PACK_DOWN_COUNT:-1}"

gif_name="live_clio_prompt_expert_pack_lifecycle.gif"
prompt_catalog="live_clio_prompt_catalog.png"
prompt_detail="live_clio_prompt_detail.png"
prompt_editor="live_clio_prompt_save_editor.png"
prompt_saved="live_clio_prompt_save_success.png"
pack_catalog="live_clio_expert_pack_catalog.png"
pack_install="live_clio_expert_pack_install_source.png"
pack_install_success="live_clio_expert_pack_install_success.png"
pack_detail="live_clio_expert_pack_detail.png"
pack_update_success="live_clio_expert_pack_update_success.png"
pack_delete_confirm="live_clio_expert_pack_delete_confirm.png"
pack_delete_success="live_clio_expert_pack_delete_success.png"

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
    --expert-pack-source)
      expert_pack_source="${2:-}"
      shift 2
      ;;
    --expert-pack-down-count)
      expert_pack_down_count="${2:-}"
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

if [[ "${CLIO_PROMPT_EXPERT_PACK_CAPTURE_OWN_BACKEND:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_PROMPT_EXPERT_PACK_CAPTURE_OWN_BACKEND=1 after confirming this backend is isolated and owned by you" >&2
  exit 2
fi
if [[ "${CLIO_PROMPT_EXPERT_PACK_CAPTURE_MUTATE:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_PROMPT_EXPERT_PACK_CAPTURE_MUTATE=1 after confirming prompt and expert-pack lifecycle writes are expected" >&2
  exit 2
fi
if [[ -z "$backend" || -z "$expert_pack_source" ]]; then
  usage >&2
  exit 2
fi
if [[ ! "$expert_pack_down_count" =~ ^[0-9]+$ ]]; then
  echo "invalid --expert-pack-down-count: $expert_pack_down_count" >&2
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

pack_down_keys=""
for _ in $(seq 1 "$expert_pack_down_count"); do
  pack_down_keys+=$'Down\n'
done

tape="$(mktemp "${TMPDIR:-/tmp}/gact-live-prompt-expert-pack.XXXXXX.tape")"
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

Type "/prompts"
Enter
Wait+Screen /Prompts/
Sleep 700ms
Screenshot "${out_dir}/${prompt_catalog}"
Down
Enter
Wait+Screen /Prompt ·/
Sleep 500ms
Screenshot "${out_dir}/${prompt_detail}"
Down
Down
Type "e"
Wait+Screen /Edit prompt override/
Sleep 300ms
Type " live capture override"
Sleep 300ms
Screenshot "${out_dir}/${prompt_editor}"
Enter
Wait+Screen /saved prompt profile codex/
Sleep 700ms
Screenshot "${out_dir}/${prompt_saved}"
Ctrl+C
Sleep 200ms
Ctrl+C
Sleep 1000ms

Type "${launch}"
Enter
Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/expert-packs"
Enter
Wait+Screen /Expert Packs/
Sleep 700ms
Screenshot "${out_dir}/${pack_catalog}"
Type "i"
Wait+Screen /Install expert pack/
Sleep 300ms
Type "${expert_pack_source}"
Sleep 300ms
Screenshot "${out_dir}/${pack_install}"
Enter
Wait+Screen /Expert Packs/
Sleep 1200ms
Screenshot "${out_dir}/${pack_install_success}"

${pack_down_keys}Enter
Wait+Screen /Expert Pack ·/
Wait+Screen /Pack actions/
Sleep 700ms
Screenshot "${out_dir}/${pack_detail}"

Type "u"
Sleep 1200ms
Screenshot "${out_dir}/${pack_update_success}"

Type "d"
Wait+Screen /confirm deleting/
Sleep 500ms
Screenshot "${out_dir}/${pack_delete_confirm}"
Type "d"
Sleep 1200ms
Screenshot "${out_dir}/${pack_delete_success}"

Type "q"
EOF

vhs "$tape"

for artifact in \
  "$prompt_catalog" \
  "$prompt_detail" \
  "$prompt_editor" \
  "$prompt_saved" \
  "$pack_catalog" \
  "$pack_install" \
  "$pack_install_success" \
  "$pack_detail" \
  "$pack_update_success" \
  "$pack_delete_confirm" \
  "$pack_delete_success"; do
  validate_capture_artifact "${out_dir}/${artifact}"
done

python3 - "$backend" "$session_id" "$expert_pack_source" "$expert_pack_down_count" "$out_dir" "${out_dir}/live_clio_prompt_expert_pack_lifecycle_manifest.json" <<'PY'
import json
import pathlib
import sys

backend, session_id, source, down_count, out_dir, manifest = sys.argv[1:7]
pathlib.Path(manifest).write_text(
    json.dumps(
        {
            "backend": backend,
            "session_id": session_id,
            "expert_pack_source": source,
            "expert_pack_down_count": int(down_count),
            "prompt_catalog": f"{out_dir}/live_clio_prompt_catalog.png",
            "prompt_save_success": f"{out_dir}/live_clio_prompt_save_success.png",
            "expert_pack_install_success": f"{out_dir}/live_clio_expert_pack_install_success.png",
            "expert_pack_update_success": f"{out_dir}/live_clio_expert_pack_update_success.png",
            "expert_pack_delete_success": f"{out_dir}/live_clio_expert_pack_delete_success.png",
            "note": (
                "Captured against caller-affirmed isolated CLIO backend with "
                "explicit mutation consent. The script saves a prompt override "
                "and performs expert-pack install/update/delete lifecycle actions."
            ),
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
PY

printf 'wrote prompt/expert-pack lifecycle captures under %s\n' "$out_dir"

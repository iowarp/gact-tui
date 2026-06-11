#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  CLIO_RUNTIME_CATALOG_CAPTURE_OWN_BACKEND=1 visual_loop/capture_live_runtime_catalogs_tui.sh \
    --backend http://127.0.0.1:<PORT> \
    [--session <session-id>] [--out-dir visual_loop/screenshots]

This script records real CLIO/GACT runtime catalog screenshots without managing
CLIO processes. It refuses to run unless CLIO_RUNTIME_CATALOG_CAPTURE_OWN_BACKEND=1
is set, so the caller must affirm that the backend URL is an isolated CLIO
instance they own. It captures /tools, /mcp, and Agent Blueprint marketplace
source views as live catalog breadth evidence for #152.
EOF
}

backend=""
session_id="${GACT_RUNTIME_CATALOG_CAPTURE_SESSION:-}"
out_dir="visual_loop/screenshots"
width="1500"
height="900"
gif_name="live_clio_runtime_catalogs.gif"
tools_catalog="live_clio_runtime_tools_catalog.png"
tools_detail="live_clio_runtime_tools_detail.png"
mcp_catalog="live_clio_runtime_mcp_catalog.png"
mcp_detail="live_clio_runtime_mcp_detail.png"
source_catalog="live_clio_runtime_blueprint_sources.png"

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

if [[ "${CLIO_RUNTIME_CATALOG_CAPTURE_OWN_BACKEND:-}" != "1" ]]; then
  echo "refusing to run: set CLIO_RUNTIME_CATALOG_CAPTURE_OWN_BACKEND=1 after confirming this backend is your isolated CLIO instance" >&2
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

tape="$(mktemp "${TMPDIR:-/tmp}/gact-live-runtime-catalogs.XXXXXX.tape")"
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

Type "/tools"
Enter
Wait+Screen /Actions and MCP/
Sleep 700ms
Screenshot "${out_dir}/${tools_catalog}"
Down
Wait+Screen /Enter details/
Enter
Wait+Screen /Tool ·|Action/
Sleep 700ms
Screenshot "${out_dir}/${tools_detail}"
Escape
Sleep 300ms
Escape
Sleep 300ms

Type "/mcp"
Enter
Wait+Screen /MCP Connections/
Sleep 700ms
Screenshot "${out_dir}/${mcp_catalog}"
Down
Down
Down
Down
Down
Enter
Wait+Screen /Connection overview/
Sleep 700ms
Screenshot "${out_dir}/${mcp_detail}"
Escape
Sleep 300ms
Escape
Sleep 300ms

Type "/agent-blueprints"
Enter
Wait+Screen /Blueprint library/
Sleep 700ms
Type "s"
Wait+Screen /Marketplace sources/
Sleep 700ms
Screenshot "${out_dir}/${source_catalog}"

Type "q"
EOF

vhs "$tape"

for artifact in "$tools_catalog" "$tools_detail" "$mcp_catalog" "$mcp_detail" "$source_catalog"; do
  validate_capture_artifact "${out_dir}/${artifact}"
done

python3 - "$backend" "$session_id" "$out_dir" "$tools_catalog" "$tools_detail" "$mcp_catalog" "$mcp_detail" "$source_catalog" "${out_dir}/live_clio_runtime_catalogs_manifest.json" <<'PY'
import json
import pathlib
import sys

backend, session_id, out_dir, tools_catalog, tools_detail, mcp_catalog, mcp_detail, source_catalog, manifest = sys.argv[1:10]
pathlib.Path(manifest).write_text(
    json.dumps(
        {
            "backend": backend,
            "session_id": session_id,
            "tools_catalog": f"{out_dir}/{tools_catalog}",
            "tools_detail": f"{out_dir}/{tools_detail}",
            "mcp_catalog": f"{out_dir}/{mcp_catalog}",
            "mcp_detail": f"{out_dir}/{mcp_detail}",
            "agent_blueprint_sources": f"{out_dir}/{source_catalog}",
            "note": (
                "Captured against caller-affirmed isolated CLIO backend. "
                "Install/remove lifecycle proof still requires running the "
                "relevant registry-backed operations on that owned backend."
            ),
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
PY

printf 'wrote runtime catalog captures under %s\n' "$out_dir"

#!/usr/bin/env bash
set -euo pipefail

port="${GACT_DIRTY_GIT_WORKSPACE_PORT:-41946}"
backend="http://127.0.0.1:${port}"
log="${TMPDIR:-/tmp}/gact-dirty-git-workspace.log"
root="$(pwd)"
repo="$(mktemp -d)"
config_dir="$(mktemp -d)"

git -C "$repo" init -q
printf "before\n" >"${repo}/notes.txt"
git -C "$repo" add notes.txt
printf "after\n" >"${repo}/notes.txt"

"${root}/.tools/emulator-server" \
  -port "$port" \
  -timing fast >"$log" 2>&1 &
srv=$!
tui_pid=""
cleanup() {
  if [ -n "${tui_pid:-}" ]; then
    kill "$tui_pid" 2>/dev/null || true
  fi
  kill "$srv" 2>/dev/null || true
  rm -rf "$repo" "$config_dir"
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "${backend}/v1/sessions" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

cd "$repo"
XDG_CONFIG_HOME="$config_dir" "${root}/tui/gact" --backend "$backend" --no-intro &
tui_pid=$!
wait "$tui_pid"

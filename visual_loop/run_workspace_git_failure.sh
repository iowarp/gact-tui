#!/usr/bin/env bash
set -euo pipefail

real_git="$(command -v git)"
tmp_bin="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_bin"
}
trap cleanup EXIT

chmod +x visual_loop/fake_git_failure.sh
ln -sf "$(pwd)/visual_loop/fake_git_failure.sh" "$tmp_bin/git"
export GACT_REAL_GIT="$real_git"
export PATH="$tmp_bin:$PATH"

exec bash visual_loop/run_workspace_switch.sh

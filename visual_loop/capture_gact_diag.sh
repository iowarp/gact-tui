#!/usr/bin/env bash
set -euo pipefail

out="${1:-visual_loop/screenshots/gact_diag_clipboard_terminal.report.md}"
mkdir -p "$(dirname "$out")"

env \
  TERM="${GACT_DIAG_CAPTURE_TERM:-xterm-256color}" \
  TERM_PROGRAM="${GACT_DIAG_CAPTURE_TERM_PROGRAM:-visual-loop}" \
  COLORTERM="${GACT_DIAG_CAPTURE_COLORTERM:-truecolor}" \
  ./tui/gact diag >"$out"

required=(
  "mouse_capture:"
  "clipboard_native:"
  "clipboard_missing:"
  "clipboard_osc52:"
  "terminal_selection:"
  "path_gact_status: matches running binary"
  "clio_gact_status: matches running binary"
  "TERM="
  "TERM_PROGRAM="
)

for marker in "${required[@]}"; do
  if ! grep -Fq "$marker" "$out"; then
    echo "missing diagnostic marker: $marker" >&2
    exit 1
  fi
done

if grep -Eq '^  revision:.*\(dirty\)' "$out"; then
  echo "diagnostic report was captured from a dirty build; run make dev-install from a clean tracked tree first" >&2
  exit 1
fi

printf 'wrote %s\n' "$out"

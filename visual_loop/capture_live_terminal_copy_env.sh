#!/usr/bin/env bash
set -euo pipefail

out="${1:-visual_loop/screenshots/live_terminal_copy_env.report.md}"

term="${TERM:-}"
if [[ "${GACT_ALLOW_DUMB_TERMINAL_CAPTURE:-}" != "1" ]]; then
  if [[ -z "$term" || "$term" == "dumb" ]]; then
    cat >&2 <<'MSG'
Refusing live terminal copy capture because TERM is empty or dumb.

Run this helper from the real terminal emulator being verified. To smoke-test
the report generator in CI or a non-interactive shell, set
GACT_ALLOW_DUMB_TERMINAL_CAPTURE=1 and write to a temporary report.
MSG
    exit 1
  fi
fi

mkdir -p "$(dirname "$out")"
tmp="$(mktemp)"
diag_tmp="$(mktemp)"
trap 'rm -f "$tmp" "$diag_tmp"' EXIT

./tui/gact diag >"$diag_tmp"

{
  echo "# Live Terminal Copy Environment Report"
  echo
  echo "This report records the terminal and clipboard environment for manual"
  echo "copy/selection verification. It does not, by itself, prove drag-selection"
  echo "success; pair it with screenshots or a short recording when closing #150."
  echo
  echo "- captured_at: $(date -Is)"
  echo "- capture_mode: $([[ "${GACT_ALLOW_DUMB_TERMINAL_CAPTURE:-}" == "1" ]] && echo "forced-noninteractive" || echo "live-terminal")"
  echo "- cwd: $(pwd)"
  echo
  echo "## Terminal"
  echo
  printf -- "- TERM: %s\n" "${TERM:-"(unset)"}"
  printf -- "- TERM_PROGRAM: %s\n" "${TERM_PROGRAM:-"(unset)"}"
  printf -- "- COLORTERM: %s\n" "${COLORTERM:-"(unset)"}"
  printf -- "- WAYLAND_DISPLAY: %s\n" "${WAYLAND_DISPLAY:-"(unset)"}"
  printf -- "- DISPLAY: %s\n" "${DISPLAY:-"(unset)"}"
  printf -- "- WSL_DISTRO_NAME: %s\n" "${WSL_DISTRO_NAME:-"(unset)"}"
  printf -- "- WT_SESSION: %s\n" "${WT_SESSION:-"(unset)"}"
  printf -- "- SSH_TTY: %s\n" "${SSH_TTY:-"(unset)"}"
  printf -- "- TMUX: %s\n" "${TMUX:-"(unset)"}"
  printf -- "- VTE_VERSION: %s\n" "${VTE_VERSION:-"(unset)"}"
  echo
  echo "## GACT Diagnostics"
  echo
  echo '```text'
  cat "$diag_tmp"
  echo '```'
  echo
  echo "## Manual Copy/Selection Checklist"
  echo
  echo "- [ ] CLIO drag-copy mode with mouse capture enabled copies selected transcript text."
  echo "- [ ] Native terminal text selection works with mouse capture disabled."
  echo "- [ ] Alt-drag terminal selection works while mouse capture is enabled, if supported by this terminal."
  echo "- [ ] Detail-modal copy by key/button copies only the detail payload."
  echo "- [ ] Selected conversation block copy copies only the selected block."
  echo "- [ ] Clipboard failure path shows actionable diagnostics without backend noise."
} >"$tmp"

required=(
  "TERM:"
  "TERM_PROGRAM:"
  "mouse_capture:"
  "clipboard_native:"
  "clipboard_missing:"
  "clipboard_osc52:"
  "terminal_selection:"
  "path_gact_status: matches running binary"
  "clio_gact_status: matches running binary"
  "Manual Copy/Selection Checklist"
)

for marker in "${required[@]}"; do
  if ! grep -Fq "$marker" "$tmp"; then
    echo "missing live copy environment marker: $marker" >&2
    exit 1
  fi
done

if grep -Eq '^  revision:.*\(dirty\)' "$diag_tmp"; then
  echo "diagnostic report was captured from a dirty build; run make dev-install from a clean tracked tree first" >&2
  exit 1
fi

mv "$tmp" "$out"
printf 'wrote %s\n' "$out"

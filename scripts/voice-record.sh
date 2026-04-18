#!/usr/bin/env bash
# voice-record.sh — reference wrapper for the GACT TUI's --voice-cmd hook.
#
# Contract (GACT v0.1):
#   - run synchronously
#   - write audio bytes to stdout (audio/wav by default; the TUI tags the
#     POST as audio/wav so emit a WAV stream)
#   - exit 0 on success, non-zero with a short stderr message on failure
#
# Usage:
#   gact --voice-cmd "scripts/voice-record.sh"
#   GACT_VOICE_CMD="scripts/voice-record.sh" gact
#   # or in $XDG_CONFIG_HOME/gact/config.json:
#   #   {"voice_command": "scripts/voice-record.sh"}
#
# Recording stops after $VOICE_DURATION seconds (default 6). Override
# per-invocation:
#   VOICE_DURATION=10 gact --voice-cmd "scripts/voice-record.sh"
#
# Picks the first available recorder:
#   - arecord    (alsa-utils, Linux)
#   - sox / rec  (libsox, Linux + macOS)
#   - ffmpeg     (cross-platform, falls back to default input device)
#
# All recorders are configured to emit 16 kHz mono signed 16-bit PCM WAV
# on stdout — a shape every speech-to-text backend handles.

set -euo pipefail

DURATION="${VOICE_DURATION:-6}"

if command -v arecord >/dev/null 2>&1; then
	exec arecord -q -f S16_LE -r 16000 -c 1 -d "$DURATION" -t wav 2>/dev/null
fi

if command -v rec >/dev/null 2>&1; then
	exec rec -q -t wav -r 16000 -c 1 -b 16 -e signed - trim 0 "$DURATION" 2>/dev/null
fi

if command -v sox >/dev/null 2>&1; then
	exec sox -q -d -t wav -r 16000 -c 1 -b 16 -e signed - trim 0 "$DURATION" 2>/dev/null
fi

if command -v ffmpeg >/dev/null 2>&1; then
	# -f auto: ffmpeg will pick alsa on Linux, avfoundation on macOS, dshow
	# on Windows under WSL etc. Users on niche setups should set the input
	# device explicitly (see ffmpeg -devices).
	exec ffmpeg -hide_banner -loglevel error \
		-f "$( [ "$(uname)" = "Darwin" ] && echo avfoundation || echo alsa )" \
		-i "default" -t "$DURATION" -ar 16000 -ac 1 -f wav - 2>/dev/null
fi

echo "voice-record.sh: no recorder found (install arecord, sox/rec, or ffmpeg)" >&2
exit 1

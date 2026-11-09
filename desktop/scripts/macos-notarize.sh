#!/usr/bin/env bash
# Notarize and staple macOS artifacts with notarytool.
#
# Usage:
#   macos-notarize.sh PATH.app|PATH.dmg|PATH.zip ...
#
# An .app is zipped with ditto (which preserves signatures) for submission
# and the ticket is stapled to the .app itself. A .dmg is submitted and
# stapled directly; sign it first (Tauri signs the DMG it builds when a
# signing identity is set). Stapling lets Gatekeeper verify the download
# offline on first launch.
#
# Credentials, in order of preference:
#   APPLE_API_KEY + APPLE_API_ISSUER + APPLE_API_KEY_PATH (.p8 file)
#   APPLE_ID + APPLE_PASSWORD (app-specific) + APPLE_TEAM_ID
# macos-signing-setup.sh writes APPLE_API_KEY_PATH from the
# APPLE_API_PRIVATE_KEY secret.

set -euo pipefail

log() { printf '[macos-notarize] %s\n' "$*"; }
die() { printf '[macos-notarize] error: %s\n' "$*" >&2; exit 1; }

[ $# -gt 0 ] || die "pass at least one .app, .dmg or .zip"

AUTH=()
if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  [ -f "$APPLE_API_KEY_PATH" ] || die "APPLE_API_KEY_PATH does not exist: $APPLE_API_KEY_PATH"
  AUTH=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  AUTH=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
else
  die "no notarization credentials (API key trio or Apple ID trio)"
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/macos-notarize.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

json_field() {
  # json_field <file> <key>; plutil reads JSON on every supported macOS.
  plutil -extract "$2" raw -o - "$1" 2>/dev/null || true
}

notarize_one() {
  local target="${1%/}" upload result id status
  case "$target" in
    *.app)
      upload="$WORK/$(basename "$target" .app).zip"
      ditto -c -k --sequesterRsrc --keepParent "$target" "$upload"
      ;;
    *.dmg|*.zip|*.pkg) upload="$target" ;;
    *) die "unsupported artifact: $target" ;;
  esac

  log "submitting $(basename "$target")"
  result="$WORK/submit.json"
  xcrun notarytool submit "$upload" "${AUTH[@]}" --wait --timeout 45m --output-format json >"$result" || true
  id="$(json_field "$result" id)"
  status="$(json_field "$result" status)"
  log "submission ${id:-unknown}: ${status:-no status}"
  if [ "$status" != "Accepted" ]; then
    cat "$result" >&2 || true
    if [ -n "$id" ]; then
      xcrun notarytool log "$id" "${AUTH[@]}" >&2 || true
    fi
    die "notarization failed for $target"
  fi

  case "$target" in
    *.zip) log "zip archives cannot be stapled; the ticket is available online" ;;
    *)
      xcrun stapler staple "$target"
      xcrun stapler validate "$target"
      ;;
  esac
}

for artifact in "$@"; do
  notarize_one "$artifact"
done

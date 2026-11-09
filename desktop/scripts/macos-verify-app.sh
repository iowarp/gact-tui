#!/usr/bin/env bash
# Verify a built macOS app bundle or DMG the way Gatekeeper and the notary
# service will see it.
#
# Usage:
#   macos-verify-app.sh [--require-notarized] PATH.app|PATH.dmg ...
#
# Always checked (ad-hoc and Developer ID builds):
#   - codesign --verify --deep --strict on the app;
#   - every Mach-O inside Contents/ is validly signed with the hardened
#     runtime (a single unsigned nested binary fails notarization);
#   - the main executable carries the hardened runtime.
# With --require-notarized (release builds with Apple credentials):
#   - spctl -a -t exec accepts the app (Developer ID + notarized);
#   - spctl -a -t open accepts the DMG;
#   - stapler validate passes for the app and the DMG.
# Without it, the spctl verdict is printed for information only: ad-hoc
# builds are always rejected by Gatekeeper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=macos-macho-lib.sh
. "$SCRIPT_DIR/macos-macho-lib.sh"

REQUIRE_NOTARIZED=0
TARGETS=()

log() { printf '[macos-verify-app] %s\n' "$*"; }
die() { printf '[macos-verify-app] error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --require-notarized) REQUIRE_NOTARIZED=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) TARGETS+=("$1"); shift ;;
  esac
done
[ "${#TARGETS[@]}" -gt 0 ] || die "pass at least one .app or .dmg"
[ "$(uname -s)" = Darwin ] || die "verification needs macOS"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/macos-verify-app.XXXXXX")"
MOUNTS=()
cleanup() {
  local mount
  for mount in ${MOUNTS[@]+"${MOUNTS[@]}"}; do
    hdiutil detach -quiet "$mount" >/dev/null 2>&1 || hdiutil detach -force -quiet "$mount" >/dev/null 2>&1 || true
  done
  rm -rf "$WORK"
}
trap cleanup EXIT

gatekeeper() {
  # gatekeeper <type> <path>
  local verdict status=0
  if [ "$1" = open ]; then
    verdict="$(spctl -a -vvv -t open --context context:primary-signature "$2" 2>&1)" || status=$?
  else
    verdict="$(spctl -a -vvv -t exec "$2" 2>&1)" || status=$?
  fi
  printf '%s\n' "$verdict" | sed 's/^/    /'
  if [ "$REQUIRE_NOTARIZED" -eq 1 ]; then
    [ "$status" -eq 0 ] || die "Gatekeeper rejected $2"
    xcrun stapler validate "$2" || die "no stapled notarization ticket on $2"
  fi
}

verify_app() {
  local app="$1" main kind path flags failures=0 count=0
  [ -d "$app/Contents" ] || die "not an app bundle: $app"
  log "app: $app"
  local deep status=0
  deep="$(codesign --verify --deep --strict --verbose=2 "$app" 2>&1)" || status=$?
  printf '%s\n' "$deep" | sed 's/^/    /'
  [ "$status" -eq 0 ] || die "codesign --verify --deep --strict failed for $app"

  codesign -dv --verbose=2 "$app" 2>&1 | grep -E '^(Identifier|Authority|TeamIdentifier|Timestamp|Signature)=' | sed 's/^/    /' || true
  main="$(codesign -dv "$app" 2>&1 | sed -n 's/^Executable=//p')"
  case "$(codesign_flags "$main")" in
    *runtime*) ;;
    *) die "main executable lacks the hardened runtime: $main" ;;
  esac

  macho_list "$app/Contents" >"$WORK/macho.tsv"
  while IFS=$'\t' read -r kind path; do
    count=$((count + 1))
    if ! codesign --verify --strict "$path" >/dev/null 2>&1; then
      log "  unsigned or invalid: ${path#"$app"/}"
      failures=$((failures + 1))
      continue
    fi
    flags="$(codesign_flags "$path")"
    case "$flags" in
      *runtime*) ;;
      *) log "  no hardened runtime ($flags): ${path#"$app"/}"; failures=$((failures + 1)) ;;
    esac
  done <"$WORK/macho.tsv"
  [ "$failures" -eq 0 ] || die "$failures of $count nested Mach-O files are not signed with the hardened runtime"
  log "  $count nested Mach-O files signed with the hardened runtime"

  log "  Gatekeeper (exec):"
  gatekeeper exec "$app"
}

verify_dmg() {
  local dmg="$1" mount app found=0
  log "dmg: $dmg"
  if codesign --verify --strict "$dmg" >/dev/null 2>&1; then
    codesign -dv --verbose=2 "$dmg" 2>&1 | grep -E '^(Authority|Signature)=' | sed 's/^/    /' || true
  else
    log "  DMG carries no valid signature"
    [ "$REQUIRE_NOTARIZED" -eq 0 ] || die "release DMG must be signed"
  fi
  log "  Gatekeeper (open):"
  gatekeeper open "$dmg"

  mount="$WORK/mount-${#MOUNTS[@]}"
  mkdir -p "$mount"
  hdiutil attach -nobrowse -readonly -noautoopen -quiet -mountpoint "$mount" "$dmg"
  MOUNTS+=("$mount")
  for app in "$mount"/*.app; do
    [ -d "$app" ] || continue
    found=1
    verify_app "$app"
  done
  [ "$found" -eq 1 ] || die "no .app inside $dmg"
}

for target in "${TARGETS[@]}"; do
  case "$target" in
    *.dmg) verify_dmg "$target" ;;
    *.app|*.app/) verify_app "${target%/}" ;;
    *) die "unsupported target (want .app or .dmg): $target" ;;
  esac
done
log "all checks passed"

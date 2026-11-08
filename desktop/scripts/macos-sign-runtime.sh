#!/usr/bin/env bash
# Sign every Mach-O file in the bundled runtime before `tauri build` copies it
# into Contents/Resources/gact-runtime.
#
# Tauri signs only the main executable, externalBin sidecars and frameworks.
# Notarization rejects an app that carries any unsigned nested Mach-O, so the
# runtime (Python, its extension modules, uv, packaged CLI tools and the
# bundled git) is signed here, inside-out, with the hardened runtime and a
# secure timestamp. Tauri copies the files byte-for-byte, so these embedded
# signatures survive into the bundle and the outer app signature seals them.
#
# Usage:
#   macos-sign-runtime.sh [options] [RUNTIME_DIR]
#
#   RUNTIME_DIR          default: desktop/src-tauri/gact-runtime
#   --identity ID        signing identity; default $APPLE_SIGNING_IDENTITY,
#                        else "-" (ad-hoc, no timestamp)
#   --entitlements FILE  entitlements for executables; default
#                        src-tauri/entitlements/runtime.entitlements
#   --keychain PATH      keychain holding the identity; default
#                        $APPLE_KEYCHAIN_PATH
#   --no-compile         skip precompiling Python bytecode
#   --thin ARCH          thin universal Mach-O files to ARCH (arm64 or
#                        x86_64) with lipo before signing
#   --verify-only        only check that every Mach-O is already signed
#   --jobs N             parallel codesign processes (default 4)
#
# Before signing, the bundled interpreter precompiles its library with
# unchecked-hash .pyc files. Timestamp-based .pyc files go stale when the
# bundle copy changes mtimes, and the runtime runs with -B, so every launch
# would otherwise recompile the whole import graph in memory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=macos-macho-lib.sh
. "$SCRIPT_DIR/macos-macho-lib.sh"

RUNTIME="$SCRIPT_DIR/../src-tauri/gact-runtime"
IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
ENTITLEMENTS="$SCRIPT_DIR/../src-tauri/entitlements/runtime.entitlements"
KEYCHAIN="${APPLE_KEYCHAIN_PATH:-}"
COMPILE=1
VERIFY_ONLY=0
JOBS=4
THIN_ARCH=""

log() { printf '[macos-sign-runtime] %s\n' "$*"; }
die() { printf '[macos-sign-runtime] error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --identity) IDENTITY="${2:?--identity needs a value}"; shift 2 ;;
    --entitlements) ENTITLEMENTS="${2:?--entitlements needs a file}"; shift 2 ;;
    --keychain) KEYCHAIN="${2:?--keychain needs a path}"; shift 2 ;;
    --no-compile) COMPILE=0; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --thin) THIN_ARCH="${2:?--thin needs an architecture}"; shift 2 ;;
    --jobs) JOBS="${2:?--jobs needs a number}"; shift 2 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) RUNTIME="$1"; shift ;;
  esac
done
[ -n "$IDENTITY" ] || IDENTITY="-"

[ "$(uname -s)" = Darwin ] || die "codesign is only available on macOS"
[ -d "$RUNTIME" ] || die "runtime directory not found: $RUNTIME"
RUNTIME="$(cd "$RUNTIME" && pwd)"
[ -f "$ENTITLEMENTS" ] || die "entitlements file not found: $ENTITLEMENTS"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/macos-sign-runtime.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

compile_python() {
  local py=""
  if [ -d "$RUNTIME/python/bin" ]; then
    py="$(find "$RUNTIME/python/bin" -maxdepth 1 -type f -name 'python3.[0-9]*' | sort | head -n 1)"
  fi
  if [ -z "$py" ] || [ ! -d "$RUNTIME/python/lib" ]; then
    log "no bundled Python found; skipping bytecode precompile"
    return
  fi
  log "precompiling $(basename "$py") library with unchecked-hash bytecode"
  # Some packages ship deliberately invalid .py fixtures (test data,
  # templates), which make compileall exit 1. Missing .pyc for those files
  # is harmless; a genuinely broken interpreter fails the import smoke below.
  if ! "$py" -I -m compileall -q -f -j0 --invalidation-mode unchecked-hash -x '/(tests?|testing)/' "$RUNTIME/python/lib" >"$WORK/compileall.log" 2>&1; then
    log "compileall reported files it could not compile (kept as source):"
    grep -E '^\*\*\*|Error' "$WORK/compileall.log" | head -n 20 || true
  fi
  "$py" -I -c 'import encodings, json, ssl, sqlite3' \
    || die "bundled Python failed its import smoke after precompile"
}

# Universal files carry slices for an architecture the per-arch runtime
# cannot run anyway; dropping them saves space and signing time.
thin_runtime() {
  local kind path mode thinned=0 skipped=0
  # Check the developer dir first: /usr/bin/lipo is a stub that pops the
  # "install developer tools" dialog on machines without them.
  xcode-select -p >/dev/null 2>&1 || die "--thin needs lipo from the Xcode command line tools"
  while IFS=$'\t' read -r kind path; do
    case "$(file -b "$path")" in
      "Mach-O universal"*) ;;
      *) continue ;;
    esac
    if ! lipo "$path" -verify_arch "$THIN_ARCH" 2>/dev/null; then
      log "no $THIN_ARCH slice, left universal: ${path#"$RUNTIME"/}"
      skipped=$((skipped + 1))
      continue
    fi
    mode="$(stat -f %Lp "$path")"
    lipo "$path" -thin "$THIN_ARCH" -output "$WORK/thin" || die "lipo failed: $path"
    mv -f "$WORK/thin" "$path"
    chmod "$mode" "$path"
    thinned=$((thinned + 1))
  done <"$WORK/macho.tsv"
  log "thinned $thinned universal file(s) to $THIN_ARCH ($skipped without that slice)"
}

codesign_args() {
  CODESIGN_ARGS=(--force --sign "$IDENTITY" --options runtime)
  if [ "$IDENTITY" = "-" ]; then
    CODESIGN_ARGS+=(--timestamp=none)
  else
    CODESIGN_ARGS+=(--timestamp)
  fi
  if [ -n "$KEYCHAIN" ]; then
    CODESIGN_ARGS+=(--keychain "$KEYCHAIN")
  fi
}

# sign_list <list-file> [--entitlements FILE]
sign_list() {
  local list="$1"
  shift
  [ -s "$list" ] || return 0
  codesign_args
  CODESIGN_ARGS+=("$@")
  tr '\n' '\0' <"$list" | xargs -0 chmod u+w
  if ! tr '\n' '\0' <"$list" \
      | xargs -0 -n 32 -P "$JOBS" codesign "${CODESIGN_ARGS[@]}" 2>"$WORK/codesign.log"; then
    grep -v 'replacing existing signature' "$WORK/codesign.log" >&2 || true
    die "codesign failed"
  fi
}

is_code_bundle() {
  [ -f "$1/Contents/Info.plist" ] || [ -f "$1/Resources/Info.plist" ] || [ -d "$1/Versions" ]
}

verify_runtime() {
  local failures=0 kind path flags info
  while IFS=$'\t' read -r kind path; do
    if ! codesign --verify --strict "$path" 2>"$WORK/verify.log"; then
      log "not validly signed: ${path#"$RUNTIME"/}"
      sed 's/^/    /' "$WORK/verify.log"
      failures=$((failures + 1))
      continue
    fi
    flags="$(codesign_flags "$path")"
    case "$flags" in
      *runtime*) ;;
      *) log "missing hardened runtime ($flags): ${path#"$RUNTIME"/}"; failures=$((failures + 1)); continue ;;
    esac
    if [ "$IDENTITY" != "-" ]; then
      info="$(codesign -dv --verbose=2 "$path" 2>&1)"
      case "$info" in
        *"Timestamp="*) ;;
        *) log "missing secure timestamp: ${path#"$RUNTIME"/}"; failures=$((failures + 1)) ;;
      esac
    fi
    if [ "$kind" = exec ]; then
      if ! codesign -d --entitlements - "$path" 2>/dev/null | grep -q 'disable-library-validation'; then
        log "executable lacks runtime entitlements: ${path#"$RUNTIME"/}"
        failures=$((failures + 1))
      fi
    fi
  done <"$WORK/macho.tsv"
  [ "$failures" -eq 0 ] || die "$failures runtime file(s) failed verification"
}

log "runtime: $RUNTIME"
if [ "$VERIFY_ONLY" -eq 0 ]; then
  xattr -cr "$RUNTIME"
  if [ "$COMPILE" -eq 1 ]; then
    compile_python
  fi
fi

macho_list "$RUNTIME" >"$WORK/macho.tsv"
if [ "$VERIFY_ONLY" -eq 0 ] && [ -n "$THIN_ARCH" ]; then
  thin_runtime
fi
awk -F'\t' '$1 == "lib" { print $2 }' "$WORK/macho.tsv" >"$WORK/libs.txt"
awk -F'\t' '$1 == "exec" { print $2 }' "$WORK/macho.tsv" >"$WORK/execs.txt"
: >"$WORK/bundles.txt"
while IFS= read -r dir; do
  if is_code_bundle "$dir"; then
    printf '%s\n' "$dir" >>"$WORK/bundles.txt"
  fi
done < <(nested_bundle_list "$RUNTIME")

LIBS=$(wc -l <"$WORK/libs.txt" | tr -d ' ')
EXECS=$(wc -l <"$WORK/execs.txt" | tr -d ' ')
BUNDLES=$(wc -l <"$WORK/bundles.txt" | tr -d ' ')
log "found $((LIBS + EXECS)) Mach-O files: $LIBS libraries, $EXECS executables; $BUNDLES nested bundles"
if [ $((LIBS + EXECS)) -eq 0 ] && [ "$BUNDLES" -eq 0 ]; then
  log "no Mach-O files to sign"
  exit 0
fi

if [ "$VERIFY_ONLY" -eq 0 ]; then
  if [ "$IDENTITY" = "-" ]; then
    log "identity: ad-hoc (-); hardened runtime, no timestamp"
  else
    log "identity: $IDENTITY; hardened runtime with secure timestamp"
  fi
  # Inside-out: libraries, then executables, then the bundles that contain them.
  sign_list "$WORK/libs.txt"
  sign_list "$WORK/execs.txt" --entitlements "$ENTITLEMENTS"
  while IFS= read -r bundle; do
    printf '%s\n' "$bundle" >"$WORK/one-bundle.txt"
    sign_list "$WORK/one-bundle.txt" --entitlements "$ENTITLEMENTS"
  done <"$WORK/bundles.txt"
fi

verify_runtime
log "verified $((LIBS + EXECS)) Mach-O files and $BUNDLES bundles"

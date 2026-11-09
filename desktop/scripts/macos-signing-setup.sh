#!/usr/bin/env bash
# CI helper for macOS Developer ID signing and notarization credentials.
#
#   macos-signing-setup.sh setup     # import certificate, write API key
#   macos-signing-setup.sh cleanup   # delete the temporary keychain and key
#
# `setup` never fails when credentials are absent (forks, pull requests from
# forks, repos without the secrets). It reports what it found through
# $GITHUB_OUTPUT so later steps can skip cleanly:
#   signing=true|false    a Developer ID certificate was imported
#   notarize=true|false   signing is on and notarization credentials exist
#   identity=<name>       the signing identity ("-" when signing=false)
# and exports through $GITHUB_ENV exactly the variables the Tauri bundler and
# macos-sign-runtime.sh read:
#   APPLE_SIGNING_IDENTITY  the identity, or "-" for an ad-hoc build
#   APPLE_KEYCHAIN_PATH     the temporary keychain (signing only)
#   APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH
#     or APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID   (notarize=true only)
# Pass the secrets to this step only. Tauri treats a set-but-empty
# notarization variable as configured, and it creates its own keychain when it
# sees APPLE_CERTIFICATE, so later steps must not receive them directly.
#
# Inputs (repository secrets):
#   APPLE_CERTIFICATE           base64 of the Developer ID Application .p12
#   APPLE_CERTIFICATE_PASSWORD  password of that .p12
#   APPLE_SIGNING_IDENTITY      optional; e.g. "Developer ID Application:
#                               Name (TEAMID)". Discovered from the
#                               certificate when empty.
#   KEYCHAIN_PASSWORD           optional; random when empty
# Notarization, either an App Store Connect API key (preferred):
#   APPLE_API_KEY               key ID
#   APPLE_API_ISSUER            issuer ID
#   APPLE_API_PRIVATE_KEY       contents of AuthKey_<KEYID>.p8 (PEM or base64)
# or an Apple ID:
#   APPLE_ID, APPLE_PASSWORD (app-specific password), APPLE_TEAM_ID

set -euo pipefail

log() { printf '[macos-signing-setup] %s\n' "$*"; }

TEMP_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
KEYCHAIN_PATH="$TEMP_ROOT/clio-signing.keychain-db"
KEY_DIR="$TEMP_ROOT/clio-notary-key"

output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >>"$GITHUB_OUTPUT"
  fi
  log "$1=$2"
}

export_env() {
  if [ -n "${GITHUB_ENV:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >>"$GITHUB_ENV"
  fi
}

mask() {
  if [ -n "${GITHUB_ACTIONS:-}" ] && [ -n "$1" ]; then
    printf '::add-mask::%s\n' "$1"
  fi
}

setup() {
  if [ -z "${APPLE_CERTIFICATE:-}" ] || [ -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]; then
    log "APPLE_CERTIFICATE / APPLE_CERTIFICATE_PASSWORD not set: building ad-hoc signed"
    export_env APPLE_SIGNING_IDENTITY -
    output signing false
    output notarize false
    output identity -
    return 0
  fi

  local keychain_password="${KEYCHAIN_PASSWORD:-}"
  if [ -z "$keychain_password" ]; then
    keychain_password="$(openssl rand -hex 24)"
  fi
  mask "$keychain_password"

  local p12="$TEMP_ROOT/clio-signing.p12"
  printf '%s' "$APPLE_CERTIFICATE" | base64 --decode >"$p12"

  security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  security create-keychain -p "$keychain_password" "$KEYCHAIN_PATH"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
  security unlock-keychain -p "$keychain_password" "$KEYCHAIN_PATH"
  security import "$p12" -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" \
    -f pkcs12 -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productsign >/dev/null
  rm -f "$p12"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
    -k "$keychain_password" "$KEYCHAIN_PATH" >/dev/null
  # Keep the login keychain searchable and put ours first.
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | tr -d '"')

  local identity="${APPLE_SIGNING_IDENTITY:-}"
  if [ -z "$identity" ]; then
    identity="$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" \
      | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -n 1)"
  fi
  if [ -z "$identity" ] || ! security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -Fq "$identity"; then
    security find-identity -v -p codesigning "$KEYCHAIN_PATH" >&2 || true
    log "error: no matching Developer ID Application identity in the imported certificate"
    exit 1
  fi
  export_env APPLE_SIGNING_IDENTITY "$identity"
  export_env APPLE_KEYCHAIN_PATH "$KEYCHAIN_PATH"
  output signing true
  output identity "$identity"

  if [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_PRIVATE_KEY:-}" ]; then
    mkdir -p "$KEY_DIR"
    chmod 700 "$KEY_DIR"
    local key_path="$KEY_DIR/AuthKey_${APPLE_API_KEY}.p8"
    case "$APPLE_API_PRIVATE_KEY" in
      *"BEGIN PRIVATE KEY"*) printf '%s\n' "$APPLE_API_PRIVATE_KEY" >"$key_path" ;;
      *) printf '%s' "$APPLE_API_PRIVATE_KEY" | base64 --decode >"$key_path" ;;
    esac
    chmod 600 "$key_path"
    export_env APPLE_API_KEY "$APPLE_API_KEY"
    export_env APPLE_API_ISSUER "$APPLE_API_ISSUER"
    export_env APPLE_API_KEY_PATH "$key_path"
    log "notarization: App Store Connect API key $APPLE_API_KEY"
    output notarize true
  elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    log "notarization: Apple ID with team $APPLE_TEAM_ID"
    export_env APPLE_ID "$APPLE_ID"
    export_env APPLE_PASSWORD "$APPLE_PASSWORD"
    export_env APPLE_TEAM_ID "$APPLE_TEAM_ID"
    output notarize true
  else
    log "no notarization credentials: the build is signed but not notarized"
    output notarize false
  fi
}

cleanup() {
  if [ -f "$KEYCHAIN_PATH" ]; then
    security delete-keychain "$KEYCHAIN_PATH" || true
    log "deleted $KEYCHAIN_PATH"
  fi
  rm -rf "$KEY_DIR"
}

case "${1:-}" in
  setup) setup ;;
  cleanup) cleanup ;;
  *) echo "usage: $0 setup|cleanup" >&2; exit 64 ;;
esac

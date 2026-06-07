#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "clone" ]; then
  echo "Cloning into '${3:-workspace}'..." >&2
  echo "fatal: repository '${2:-unknown}' not found" >&2
  exit 128
fi

exec "${GACT_REAL_GIT:-git}" "$@"

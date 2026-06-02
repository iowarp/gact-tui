#!/usr/bin/env bash
# Build the embedded clio-agent runtime for the BUNDLED CLIO Desktop
# installer variant (macOS / Linux).
#
# Creates a RELOCATABLE Python virtual environment under
# apps/desktop/src-tauri/clio-runtime/.venv with clio-agent installed
# from git (no extras). Tauri's bundle.resources packs the whole
# clio-runtime/ tree into the installer; the sidecar-launcher resolves
# it at runtime relative to its own executable (priority 0), so the
# bundled app works fully offline with no system clio-agent install.
#
# Heavy optional dependencies are deliberately excluded by installing
# WITHOUT extras:
#   - codex_cli_bin (~243 MB)  — [codex] extra (openai-codex git dep)
#   - scipy (~100 MB), numpy   — [optimizers] extra
#   - mypy / pytest            — [dev] extra
# Base deps that DO ship (required by clio_agent.gact.app at runtime):
#   pyarrow (~82 MB), matplotlib (~23 MB), h5py, litellm, fastapi,
#   uvicorn, sse-starlette, dspy, fastmcp, …
#
# Env:
#   CLIO_REF   git ref of clio-agent to install (default: develop)
#
# Usage:
#   ./build-clio-runtime.sh

set -euo pipefail

REF="${CLIO_REF:-develop}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_TAURI="$DESKTOP/src-tauri"
TARGET="$SRC_TAURI/clio-runtime"
VENV="$TARGET/.venv"
VENV_PY="$VENV/bin/python"
GACT_BIN="$VENV/bin/clio-agent-gact"
REPO_URL="git+https://github.com/iowarp/clio-agent.git"

dir_size_mb() {
  # Portable du across GNU (Linux) and BSD (macOS) coreutils.
  if [ ! -d "$1" ]; then echo "0"; return; fi
  du -sm "$1" 2>/dev/null | awk '{print $1}'
}

# --- preconditions ----------------------------------------------------
if ! command -v uv >/dev/null 2>&1; then
  cat >&2 <<'EOF'
build-clio-runtime: 'uv' is required but not found on PATH.
Install it from https://docs.astral.sh/uv/ (e.g.
  curl -LsSf https://astral.sh/uv/install.sh | sh
) then re-run. uv builds the relocatable Python env that ships in the
bundled installer.
EOF
  exit 1
fi
echo "[build-clio-runtime] uv: $(command -v uv) ($(uv --version))"

# Always rebuild from clean so a stale tree can't leak into the bundle.
if [ -d "$TARGET" ]; then
  echo "[build-clio-runtime] removing existing $TARGET before rebuild"
  rm -rf "$TARGET"
fi
mkdir -p "$TARGET"

# --- create relocatable venv -----------------------------------------
echo "[build-clio-runtime] creating relocatable venv (python 3.12) at $VENV"
uv venv --relocatable --python 3.12 "$VENV"

# --- install clio-agent (NO extras) ----------------------------------
SPEC="clio-agent @ ${REPO_URL}@${REF}"
echo "[build-clio-runtime] installing: $SPEC (no extras)"
uv pip install --python "$VENV_PY" "$SPEC"

SIZE_BEFORE="$(dir_size_mb "$TARGET")"
echo "[build-clio-runtime] size before prune: ${SIZE_BEFORE} MB"

# --- prune ------------------------------------------------------------
SITE_PKGS="$(echo "$VENV"/lib/python*/site-packages)"

# 1. __pycache__ dirs + loose *.pyc
find "$VENV" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find "$VENV" -type f -name '*.pyc' -delete 2>/dev/null || true

if [ -d "$SITE_PKGS" ]; then
  # 2. in-package tests/ trees in vendored deps (clio_agent ships none)
  find "$SITE_PKGS" -mindepth 2 -maxdepth 2 -type d \( -name tests -o -name test \) \
    -exec rm -rf {} + 2>/dev/null || true
  # 3. *.dist-info/RECORD bloat (not needed at runtime)
  find "$SITE_PKGS" -mindepth 2 -maxdepth 2 -type f -path '*.dist-info/RECORD' \
    -delete 2>/dev/null || true

  # 4. Installer-hostile files. NSIS aborts on file names containing
  #    parentheses/brackets, and litellm ships benchmark DATA files named
  #    exactly that way (litellm/proxy/.../guardrail_benchmarks/results/
  #    "block_..._(....yaml).json" — found by the 0.7.0 release test).
  #    They are data, never imported at runtime. Remove the known dir,
  #    sweep any other offender, then HARD-FAIL if any survive — better
  #    to fail here in seconds than 30 minutes later inside the bundler.
  rm -rf "$SITE_PKGS/litellm/proxy/guardrails/guardrail_hooks/litellm_content_filter/guardrail_benchmarks" || true
  find "$VENV" -type f -name '*[()][]()*' -delete 2>/dev/null || true
  find "$VENV" -type f \( -name '*(*' -o -name '*)*' -o -name '*\[*' -o -name '*\]*' \) -delete 2>/dev/null || true
  remaining="$(find "$VENV" -type f \( -name '*(*' -o -name '*)*' -o -name '*\[*' -o -name '*\]*' \) | head -20)"
  if [ -n "$remaining" ]; then
    echo "build-clio-runtime: installer-hostile filenames remain after prune:" >&2
    echo "$remaining" >&2
    exit 1
  fi
fi

SIZE_AFTER="$(dir_size_mb "$TARGET")"
echo "[build-clio-runtime] size after prune:  ${SIZE_AFTER} MB (was ${SIZE_BEFORE} MB)"

# --- sanity: --help must exit 0 --------------------------------------
if [ ! -x "$GACT_BIN" ]; then
  echo "build-clio-runtime: expected $GACT_BIN to exist after install but it does not" >&2
  exit 1
fi
echo "[build-clio-runtime] sanity: $GACT_BIN --help"
"$GACT_BIN" --help >/dev/null

echo "[build-clio-runtime] OK — relocatable runtime ready at $TARGET (${SIZE_AFTER} MB)"

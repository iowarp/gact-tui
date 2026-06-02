#!/bin/sh
# clio-tui container entrypoint.
#
# Starts clio-agent-gact on loopback in the background, waits for it to answer
# /v1/capabilities, then exec's the gact TUI pointed at it. Any arguments to
# `docker run ... clio-tui <args>` are forwarded to gact (so `--help`,
# `--theme light`, subcommands, etc. all work).
set -eu

CLIO_HOST="${CLIO_GACT_HOST:-127.0.0.1}"
CLIO_PORT="${CLIO_GACT_PORT:-7777}"
export GACT_BACKEND="${GACT_BACKEND:-http://${CLIO_HOST}:${CLIO_PORT}}"

# Fast path: pure-CLI / introspection invocations (e.g. `--help`, `--version`,
# `man`) must NOT pay the cost of booting clio. If the first arg looks like a
# help/version/man flag, just exec gact directly.
case "${1:-}" in
    -h|--help|help|--version|version|man|env)
        exec gact "$@"
        ;;
esac

clio_pid=""

shutdown() {
    [ -n "$clio_pid" ] && kill -TERM "$clio_pid" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 0
}
trap shutdown TERM INT

echo "[clio-tui] starting clio-agent-gact on ${CLIO_HOST}:${CLIO_PORT} ..." >&2
clio-agent-gact --host "$CLIO_HOST" --port "$CLIO_PORT" &
clio_pid=$!

echo "[clio-tui] waiting for clio to become ready ..." >&2
ready=""
i=0
while [ "$i" -lt 60 ]; do
    if ! kill -0 "$clio_pid" 2>/dev/null; then
        echo "[clio-tui] FATAL: clio-agent-gact exited during startup" >&2
        exit 1
    fi
    if curl -fsS "http://${CLIO_HOST}:${CLIO_PORT}/v1/capabilities" >/dev/null 2>&1; then
        ready="yes"
        break
    fi
    i=$((i + 1))
    sleep 0.5
done

if [ -z "$ready" ]; then
    echo "[clio-tui] WARNING: clio did not answer /v1/capabilities in time;" \
         "launching the TUI anyway — it will show a connect error." >&2
else
    echo "[clio-tui] clio ready at ${GACT_BACKEND}; launching TUI." >&2
fi

# Hand the terminal to the TUI. clio keeps running in the background; when the
# TUI exits, the container exits and the trap tears clio down.
exec gact "$@"

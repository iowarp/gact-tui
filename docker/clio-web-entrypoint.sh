#!/bin/sh
# clio-web container entrypoint.
#
# Starts clio-agent-gact on loopback in the background, waits for it to answer
# /v1/capabilities, then starts nginx in the foreground. SIGTERM/SIGINT tear
# both down so `docker stop` is clean.
set -eu

CLIO_HOST="${CLIO_GACT_HOST:-127.0.0.1}"
CLIO_PORT="${CLIO_GACT_PORT:-7777}"

clio_pid=""
nginx_pid=""

shutdown() {
    # Stop nginx first (stops accepting browser traffic), then clio.
    [ -n "$nginx_pid" ] && kill -TERM "$nginx_pid" 2>/dev/null || true
    [ -n "$clio_pid" ] && kill -TERM "$clio_pid" 2>/dev/null || true
    wait 2>/dev/null || true
    exit 0
}
trap shutdown TERM INT

echo "[clio-web] starting clio-agent-gact on ${CLIO_HOST}:${CLIO_PORT} ..."
# Run clio as the unprivileged 'clio' user; nginx master needs root to bind :80.
if command -v setpriv >/dev/null 2>&1; then
    setpriv --reuid clio --regid clio --init-groups \
        clio-agent-gact --host "$CLIO_HOST" --port "$CLIO_PORT" &
else
    su -s /bin/sh clio -c "clio-agent-gact --host '$CLIO_HOST' --port '$CLIO_PORT'" &
fi
clio_pid=$!

# Wait (up to ~30s) for the capabilities probe to return 200.
echo "[clio-web] waiting for clio to become ready ..."
ready=""
i=0
while [ "$i" -lt 60 ]; do
    if ! kill -0 "$clio_pid" 2>/dev/null; then
        echo "[clio-web] FATAL: clio-agent-gact exited during startup" >&2
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
    echo "[clio-web] WARNING: clio did not answer /v1/capabilities in time;" \
         "starting nginx anyway (the proxy will 502 until clio is up)." >&2
else
    echo "[clio-web] clio is ready."
fi

echo "[clio-web] starting nginx on :80 ..."
nginx -g 'daemon off;' &
nginx_pid=$!

# Wait on whichever child exits first; if either dies, tear the rest down.
wait -n 2>/dev/null || wait
shutdown

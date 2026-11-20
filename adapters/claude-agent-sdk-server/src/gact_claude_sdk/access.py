"""Who may call the adapter: loopback ``Host`` names and the bearer token.

The adapter drives Claude in the user's workspace, including answering its
permission requests. Anything that reaches the port could do the same: another
account on the computer, a network peer, or a web page that rebinds its own
domain to 127.0.0.1. So the CLI serves the app behind :class:`AccessMiddleware`.
"""

from __future__ import annotations

import hmac
import ipaddress
import os
import secrets

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

TOKEN_ENV = "GACT_ADAPTER_TOKEN"


def adapter_token(value: str | None) -> tuple[str, bool]:
    """The configured token (argument, else ``GACT_ADAPTER_TOKEN``), or a new one.

    Returns the token and whether it was generated, so the CLI can print it.
    """
    for candidate in (value, os.environ.get(TOKEN_ENV)):
        if candidate and candidate.strip():
            return candidate.strip(), False
    return secrets.token_hex(24), True


def is_loopback_host(host: str) -> bool:
    """Whether a bind address or ``Host`` name is this computer's loopback."""
    host = host.strip().strip("[]").lower()
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _host_name(header: str) -> str:
    header = header.strip().lower()
    if header.startswith("["):
        return header[1 : header.find("]")] if "]" in header else header
    return header.rsplit(":", 1)[0] if header.count(":") == 1 else header


class AccessMiddleware:
    """Admit a request whose ``Host`` is loopback or allowed and that carries the token.

    ``GET /v1/health`` needs no token.
    """

    def __init__(self, app: ASGIApp, *, token: str, allowed_hosts: frozenset[str]) -> None:
        self._app = app
        self._expected = f"Bearer {token}".encode()
        self._allowed = frozenset(host.lower() for host in allowed_hosts)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope["headers"]}
        host = _host_name(headers.get("host", ""))
        if not (is_loopback_host(host) or host in self._allowed):
            await PlainTextResponse(
                "host not allowed; add it with --allowed-hosts", status_code=403
            )(scope, receive, send)
            return
        if scope.get("path") != "/v1/health" and not hmac.compare_digest(
            headers.get("authorization", "").encode(), self._expected
        ):
            await PlainTextResponse(
                "a valid bearer token is required",
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
            return
        await self._app(scope, receive, send)

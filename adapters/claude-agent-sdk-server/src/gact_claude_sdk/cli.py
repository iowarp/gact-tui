"""CLI entry point — `gact-claude-agent-sdk-server --cwd ... --port ...`."""

from __future__ import annotations

import argparse
import os
import sys

import uvicorn

from .access import TOKEN_ENV, AccessMiddleware, adapter_token
from .server import make_app


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="gact-claude-agent-sdk-server",
        description=(
            "GACT v0.1 sidecar that exposes Anthropic's claude-agent-sdk "
            "library through the GACT REST + SSE contract. Run alongside "
            "the gact TUI; uses the same OAuth the SDK already uses."
        ),
    )
    parser.add_argument(
        "--cwd",
        default=os.getcwd(),
        help="Workspace root (Claude Code is cwd-scoped). Defaults to $PWD.",
    )
    parser.add_argument(
        "--cli-path",
        default=None,
        help="Override path to the `claude` CLI. Defaults to the SDK's "
        "auto-detect (PATH lookup + bundled fallback).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind interface (default 127.0.0.1; use 0.0.0.0 to expose).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=7780,
        help="TCP port (default 7780).",
    )
    parser.add_argument(
        "--token",
        default=None,
        help=f"Bearer token clients must send (default ${TOKEN_ENV}, else a new one "
        "printed at startup).",
    )
    parser.add_argument(
        "--allowed-hosts",
        default="",
        help="Comma-separated Host names to answer besides loopback (for access by name).",
    )
    parser.add_argument(
        "--log-level",
        default="info",
        choices=["critical", "error", "warning", "info", "debug", "trace"],
        help="uvicorn log level (default info).",
    )
    args = parser.parse_args()

    token, generated = adapter_token(args.token)
    allowed = frozenset(h.strip() for h in args.allowed_hosts.split(",") if h.strip())
    app = AccessMiddleware(
        make_app(cwd=args.cwd, cli_path=args.cli_path), token=token, allowed_hosts=allowed
    )
    print(
        f"claude-agent-sdk adapter on http://{args.host}:{args.port} "
        f"→ cwd={args.cwd} cli={args.cli_path or '(sdk auto)'}",
        file=sys.stderr,
        flush=True,
    )
    if generated:
        print(
            f"clients connect with bearer token {token} "
            f"(set --token or ${TOKEN_ENV} to choose one)",
            file=sys.stderr,
            flush=True,
        )
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)


if __name__ == "__main__":
    main()

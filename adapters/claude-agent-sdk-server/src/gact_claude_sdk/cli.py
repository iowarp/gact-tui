"""CLI entry point — `gact-claude-agent-sdk-server --cwd ... --port ...`."""

from __future__ import annotations

import argparse
import os
import sys

import uvicorn

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
        "--log-level",
        default="info",
        choices=["critical", "error", "warning", "info", "debug", "trace"],
        help="uvicorn log level (default info).",
    )
    args = parser.parse_args()

    app = make_app(cwd=args.cwd, cli_path=args.cli_path)
    print(
        f"claude-agent-sdk adapter on http://{args.host}:{args.port} "
        f"→ cwd={args.cwd} cli={args.cli_path or '(sdk auto)'}",
        file=sys.stderr,
        flush=True,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level=args.log_level)


if __name__ == "__main__":
    main()

"""GACT v0.1 → claude-agent-sdk bridge.

A FastAPI sidecar that exposes Anthropic's `claude-agent-sdk` library
through the GACT REST + SSE contract, so the GACT TUI can drive
Claude Code via the same OAuth the SDK uses internally.
"""

__version__ = "0.1.0"

#!/usr/bin/env python3
"""Verify that a live CLIO development ARC can persist a real record."""

from __future__ import annotations

import json
from uuid import uuid4

from clio_agent.arc.storage import ClioCoreStore, make_arc_store


def main() -> int:
    """Write, read, and delete one sentinel through the configured CTE backend."""
    store = make_arc_store(backend="cte")
    if not isinstance(store, ClioCoreStore):
        raise RuntimeError("ARC probe degraded away from the required clio-core backend")

    name = f"__dev_preflight_{uuid4().hex}"
    payload = b"clio-dev-arc-write-read-delete-v1"
    store.put("segments", name, payload, search_text="development preflight sentinel")
    observed = store.get("segments", name)
    if observed != payload:
        raise RuntimeError(f"ARC probe read mismatch: {observed!r}")
    store.delete("segments", name)
    if store.get("segments", name) is not None:
        raise RuntimeError("ARC probe delete did not remove the sentinel")

    print(json.dumps({"arc": "cte", "write_read_delete": "ready"}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

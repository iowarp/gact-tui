"""Shared types for live-observability timeline checks."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Observation:
    index: int
    t: float
    event: str
    kind: str
    status: str = ""
    detail: str = ""


@dataclass(frozen=True)
class RuntimeAgreement:
    ok: bool
    missing: list[str]
    matched: list[str]

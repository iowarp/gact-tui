---
id: base-agent
title: Base Agent
display_name: Base Agent
version: 0.2.4
description: CLIO's configurable general-purpose agent with native workspace tools and no hidden routing hierarchy.
root_expert: base
# A2UI catalogs are a per-agent allowlist: from clio-agent 0.9.4.17 this
# agent may produce surfaces only against the catalogs listed here, in this
# preference order (nothing is implicit, the builtins included). An older
# runtime reads a builtins-only list as no pack catalogs and still offers its
# builtins, so this pack needs no clio-agent floor.
a2ui_catalogs:
  - clio-workspace
mcp_servers:
  web: clio-kit mcp-server web
blueprint:
  format: agent-blueprint-v1
experts:
  - experts/base.md
---

# Base Agent

One marketplace-owned agent with CLIO's native workspace tools. It handles
ordinary conversation and grounded workspace work without an internal fallback,
expert hierarchy, or hidden routing layer. It remains the clean TTFT/latency
baseline for any model while also serving as CLIO's default installed agent.

## The needle case (reproducible baseline)

1. Drop a `needle.md` in the workspace root containing a known number.
2. Attach this blueprint to a fresh session.
3. Ask: "Somewhere in this workspace there is a file named needle.md. Find
   it and tell me the number written inside it."
4. The run should take 2-4 LM calls (list/search, read, answer). Per-call
   TTFT from the stream audit log is the model's clean agent baseline,
   free of delegation resets and child spawn costs.

# Generic Agentic-Coder TUI Contract (GACT)

A REST + SSE contract between an **agentic-coder backend** (Crush, OpenCode, Goose, Gemini CLI, custom) and a **terminal UI frontend**, designed so one TUI can drive any conforming backend.

## Status

**v0.1 draft** — under active iteration. Not yet stable. Breaking changes possible until v1.0.

## Why this exists

Today, every agentic coder ships its own TUI tightly coupled to its agent loop. A user who wants the *Aider* experience with the *Goose* runtime, or the *Crush* sidebar with the *Gemini* models, has to switch tools entirely. This contract decouples the UX from the engine.

## What's in here

- [`SPEC.md`](./SPEC.md) — normative contract: versioning, hierarchy, endpoints, events, extensibility.
- `examples/` (TBD) — sample request/response/event payloads.
- `openapi/` (TBD) — machine-readable schema (OpenAPI 3.1 + JSON Schema for SSE events).

## Design principles

1. **Difficult-first.** Hierarchical (Workspace → Session → SubSession), MCP-aware, sub-agent capable. Easier to remove than to add.
2. **Extensible by default.** Capability discovery, versioned routes, vendor namespaces, open discriminated unions, reserved `x-` prefixes.
3. **Streaming-first.** SSE is the default for any non-trivial response.
4. **Backend-agnostic.** Reuses Anthropic Messages-API content blocks where applicable, MCP semantics where applicable, A2A discovery patterns where applicable. None of those are hard requirements; the contract is the superset.
5. **Forward-compatible.** A client must tolerate unknown event types, unknown part types, unknown capabilities, unknown vendor extensions — without crashing or losing the rest of the message.

## Compatibility targets

| Standard | Relationship |
|---|---|
| Anthropic Messages API | Content-block types align where they exist; we add a few |
| MCP (modelcontextprotocol.io) | First-class. `/v1/mcp/...` mirrors MCP's capability surface |
| A2A (Agent2Agent) | Discovery + agent-card pattern borrowed; transport differs |
| ACP (Agent Client Protocol) | Aligned where it overlaps with A2A; spec convergence TBD |

## Reading order

If you're new: read `SPEC.md` start to finish — it's structured to introduce concepts before referencing them.

If you're implementing a **backend adapter**: focus on §3 (Capabilities), §4 (Data model), §6 (Endpoints), §7 (Events).

If you're implementing the **TUI client**: also read §5 (Auth) and §8 (Extensibility) for the "what if the backend doesn't support X?" answers.

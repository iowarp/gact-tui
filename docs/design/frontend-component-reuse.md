# Frontend component reuse ledger

This ledger prevents the frontend from treating professional component libraries as a palette of
low-level primitives and then rebuilding their product surfaces inside `components/clio`.

The implementation rule is:

1. Use the sourced component directly when its domain and interaction model match.
2. Use a thin CLIO adapter only to translate GACT entities, authorization, or routing semantics.
3. Keep product-specific composition only when no selected library owns the behavior.
4. Record and review any departure before weakening the automated import ratchet.

`pnpm check:frontend-reuse` enforces the sourced composition of the major surfaces below. It is a
regression guard, not a substitute for browser review or accessibility testing.

| Product surface       | Sourced composition                                                         | CLIO-owned responsibility                                        |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Conversation          | AI Elements Conversation, Message, Chain of Thought, Plan, Task, Code Block | Causal GACT block grouping, virtualization, exact-message focus  |
| Composer              | AI Elements Prompt Input and Model Selector                                 | Capability gating, service commands, send/steer/stop mutations   |
| Tool activity         | AI Elements Tool                                                            | MCP-supplied display title, semantic summary, GACT state mapping |
| Artifacts and images  | AI Elements Artifact and Attachments                                        | Artifact byte custody, bounded preview loading, canvas routing   |
| Child agents          | pinned TheoKit SubAgentDispatch                                             | GACT state mapping and central-click versus canvas-open behavior |
| Approvals             | AI Elements Confirmation                                                    | Server-owned approval and question mutations                     |
| Resource canvas       | shadcn Tabs, AI Elements File Tree, ReUI Frame                              | Durable tab identity, server file/artifact/blueprint routes      |
| Observability         | ReUI Timeline and Frame, shadcn Tabs                                        | Causal grouping, process lanes, evidence correlation             |
| Context and inspector | AI Elements Context and File Tree, ReUI Timeline                            | Server snapshots, resource navigation, action availability       |
| Data and runs         | ReUI Data Grid                                                              | GACT columns, filtering, run mutations                           |
| A2UI catalog          | AI Elements Artifact, Code Block, Confirmation; ReUI Frame                  | Protocol validation, bindings, action allowlist                  |
| Reasoning defaults    | shadcn Select                                                               | Provider capability and persisted categorical value              |

The following custom composition is deliberate rather than a library imitation:

- Transcript virtualization and frame-batched streaming, because they preserve ordered GACT deltas
  and stable scroll anchoring across a 1,000-message session.
- The resizable, maximizable canvas tab model, because central-versus-canvas child routing and
  durable file/artifact tabs are CLIO workspace semantics.
- Observability process lanes and workflow topology, because they correlate authoritative runs,
  child sessions, tools, evidence, and recovery rather than displaying a generic activity list.
- Transport, decoding, reducers, authorization, and server mutations, which remain protocol and
  domain responsibilities and must not leak into registry components.

Raw event JSON, raw artifact URIs, dot-only status, and hand-built copies of a sourced component are
not valid fallbacks. Missing service data is labeled unavailable.

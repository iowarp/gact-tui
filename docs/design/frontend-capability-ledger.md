# Frontend capability ledger

This is the rebuild's product-parity ratchet. It is deliberately broader than any one review
comment. The old web applications are evidence that a capability and backend contract exist;
they are not a visual baseline. Flat-NDP and the working SPOTTER campaign remain the canonical
semantic references for agent-work surfaces.

## Status meanings

- **Accepted**: authoritative end-to-end workflow, responsive and keyboard behavior, failure and
  reconnect handling, automated coverage, and real-browser evidence are complete.
- **Implemented, not accepted**: a real workflow exists, but at least one acceptance dimension is
  incomplete.
- **Partial**: only part of the authoritative workflow or data is available.
- **Missing**: no usable replacement workflow exists.
- **Unavailable**: the server explicitly reports that the capability is unavailable. The client
  must say so and must not synthesize it.

No row becomes accepted because a route, tab, card, or test fixture exists.

## Product shell and navigation

| Capability                                       | Authoritative surface                                           | Current state             | Remaining acceptance work                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| Branded service identity and product terminology | `clio-agent` branding payload and brand config                  | Partial                   | Remove remaining hard-coded CLIO product copy; verify alternate scientific-domain branding. |
| Remembered connection auto-connect               | local connection preferences plus capability negotiation        | Implemented, not accepted | Native secure-token storage and failure/recovery browser evidence.                          |
| Connection/service switcher                      | saved endpoints, local discovery, SSH/native connection support | Partial                   | Native discovery, SSH/tunnel lifecycle, health details, and connection CRUD.                |
| Resizable navigation                             | shared resizable/sidebar components                             | Implemented, not accepted | Persisted width, collapse animation, keyboard and touch regression tests.                   |
| Workspace identity                               | GACT 0.3 `display_name`, secondary path                         | Implemented, not accepted | Collision cases and full-path discovery browser evidence.                                   |
| Pinned/recent workspaces and sessions            | workspace/session metadata                                      | Implemented, not accepted | Pin persistence after reconnect and dense archived-session recovery evidence.               |
| Global search and command menu                   | session/message/catalog search contracts                        | Implemented, not accepted | Cross-workspace policy failures, dense SPOTTER evidence, and final keyboard/axe coverage.   |
| Responsive navigation and resource drawers       | shared sheet/sidebar primitives                                 | Implemented, not accepted | Tablet/mobile visual and axe evidence after final composition.                              |

## Workspace and session lifecycle

| Capability                                   | Authoritative surface                           | Current state             | Remaining acceptance work                                                                           |
| -------------------------------------------- | ----------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| Create, rename, pin, archive, delete session | `/v1/sessions`                                  | Implemented, not accepted | Live disposable mutation, restore-after-reconnect, and destructive focus evidence.                  |
| Create, rename, pin, remove workspace        | `/v1/workspaces`                                | Implemented, not accepted | Grant/path validation, live browser tests, duplicate-name behavior.                                 |
| Session defaults and active agent/blueprint  | server defaults and blueprint assignment routes | Implemented, not accepted | Live blueprint-default activation, active assignment display, drift/failure, and recovery evidence. |
| Fork, branch, rewind, undo, compact          | session mutation routes                         | Implemented, not accepted | Live disposable-session mutation evidence, gap/reconciliation behavior, and permission failures.    |
| Import, export, share                        | session import/export/share routes              | Implemented, not accepted | Live round-trip, capability gating, expiry/failure evidence, and desktop save/open integration.     |
| Schedule and recurring session work          | session-scoped schedule routes                  | Implemented, not accepted | Live create/fire/cancel evidence, run linkage, permission failure, and reconnect behavior.          |

## Conversation and agent work

| Capability                                 | Authoritative surface                                     | Current state             | Remaining acceptance work                                                                 |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| Causal message ordering and live streaming | GACT 0.3 transcript/SSE                                   | Implemented, not accepted | Final real high-rate and gap/reconnect evidence.                                          |
| Reasoning semantics                        | persisted thinking parts and AI Elements chain of thought | Implemented, not accepted | Dense-session validation, redaction, unavailable cases, and final SPOTTER coverage.       |
| Tool title and visible outcome             | MCP/native declared titles and structured result          | Implemented, not accepted | Add typed result presentations for important scientific tools and dense SPOTTER evidence. |
| Tool input/output detail                   | authoritative tool parts                                  | Implemented, not accepted | Large outputs, logs, errors, diff/result affordances, keyboard tests.                     |
| Plans and tasks                            | plan/task parts and session task routes                   | Partial                   | Mutable plan/task operations, provenance, observability linkage.                          |
| Child agents                               | agent-task events, child session identity, runs           | Implemented, not accepted | Nested/fan-out density, mobile canvas, and final SPOTTER coverage.                        |
| Approvals and user questions               | permissions/question routes                               | Implemented, not accepted | Real allow/deny/session/workspace and reconnect cases.                                    |
| Cancellation, interruption, retry          | session/run/attempt routes                                | Implemented, not accepted | Real live cancellation and interruption acceptance.                                       |
| Attachments, mentions, voice               | capability negotiation and upload/catalog routes          | Partial                   | Honest capability gating; real upload/mention flow where available.                       |
| Composer routing/model/effort/edit modes   | provider/model/session contracts                          | Implemented, not accepted | Provider/model and all behavior-axis failure/reconnect evidence.                          |

## Files, artifacts, blueprints, and documents

| Capability                              | Authoritative surface                                       | Current state             | Remaining acceptance work                                                                     |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| Unified tabbed canvas                   | observability, child sessions, files, artifacts, blueprints | Implemented, not accepted | Reload persistence, mobile behavior, and final SPOTTER artifact evidence.                     |
| Text/code file viewer                   | workspace and blueprint raw-read routes                     | Implemented, not accepted | Search, go-to-line, refresh/conflict behavior, large-file limits.                             |
| Image, PDF, data, plot, map viewers     | file/artifact MIME and document routes                      | Implemented, not accepted | Live PDF/Tauri rendering, dense plot/map evidence, and image binary security regressions.     |
| Artifact preview and provenance         | artifact get/bytes/lineage/export/aliases                   | Implemented, not accepted | Alias selection, pinning, and final live lineage/export acceptance.                           |
| File changes/diffs and repository state | diff/repo-map/context-file routes                           | Implemented, not accepted | Live apply/reject failure evidence, changed-file tree, and authoritative git state/actions.   |
| Blueprint browser                       | blueprint list/detail/files                                 | Implemented, not accepted | Active assignment, validation details, MCP descriptors, live-browser tests.                   |
| Blueprint sources/marketplaces          | blueprint source CRUD/refresh                               | Implemented, not accepted | Authenticated source and failure/recovery browser evidence.                                   |
| Blueprint install/update/remove         | blueprint lifecycle routes                                  | Implemented, not accepted | Validation-first destructive workflows and progress/error evidence.                           |
| Expert packs                            | expert-pack lifecycle routes                                | Implemented, not accepted | Live install/update/remove failure and recovery evidence with a disposable marketplace.       |
| Document review/edit/renditions         | document and review routes                                  | Implemented, not accepted | Live pointer review, PDF rendition, embedded editors, conflicts, and native Tauri acceptance. |

## Observability and operations

| Capability                                | Authoritative surface                       | Current state             | Remaining acceptance work                                                               |
| ----------------------------------------- | ------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Observability pill and default canvas tab | run/task/tool/process/diff/context entities | Implemented, not accepted | Git state, plan files, dense SPOTTER evidence, and reconnect acceptance.                |
| Session activity timeline                 | scoped event/run/tool/process timestamps    | Partial                   | Complete causal categories, event detail, reconciliation markers.                       |
| Operational run explorer                  | `/v1/runs`                                  | Implemented, not accepted | Timeline/detail, remote-job cancellation semantics, and final dense-data evidence.      |
| Background processes                      | async-process registry and live events      | Implemented, not accepted | Live MCP-task logs/cancellation and terminal-state acceptance.                          |
| Context window and context files          | context state/files/frames/search/compact   | Implemented, not accepted | Dense frame inputs, gap recovery, and final SPOTTER context-composition evidence.       |
| Usage, token, and cost                    | usage snapshots/provenance                  | Partial                   | Authoritative endpoint projection and unavailable/stale explanations.                   |
| Sources and citations                     | citation/resource/artifact provenance       | Partial                   | Per-part citation actions and durable source/resource tabs.                             |
| Relay health and jobs                     | relay status plus relay-backed runs         | Partial                   | Doors/tools detail, remote-job actions, recovery, and configured-relay acceptance.      |
| Metrics and doctor                        | metrics/health/integration routes           | Implemented, not accepted | Dense metrics, remediation actions, refresh/failure, and native diagnostics evidence.   |
| Notifications                             | event/notification routes                   | Missing                   | Center, filtering, action routing, persistence.                                         |

## Settings and administration

The previous product exposed these real areas: connections/backends, session defaults, providers,
models, agents, relays, commands, prompts, agent blueprints, expert packs, MCP servers, hooks,
policies, memory, metrics, doctor, plugins, appearance, data/backups, and about. The replacement
now exposes live read surfaces for several catalogs and full blueprint/source lifecycle actions,
but every omitted mutation and administration workflow remains open. Route count never constitutes
"settings complete."

| Area                                | Current state             | Required workflow                                                               |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| Connections and desktop integration | Partial                   | CRUD, discovery, SSH/tunnels, credentials, lifecycle.                           |
| Session defaults                    | Implemented, not accepted | Blueprint-default activation, drift/failure, and recovery evidence.             |
| Providers and models                | Implemented, not accepted | Auth mutation, handshake failures, stale-catalog recovery, and native evidence. |
| Agents                              | Implemented, not accepted | Live disposable create/update/delete, overlays, and blueprint relationships.    |
| Relays                              | Partial                   | Configuration, exposed tools, jobs, and recovery.                               |
| Commands and prompts                | Implemented, not accepted | Live disposable override save/recovery and destructive-command confirmation.    |
| Scheduled work                      | Implemented, not accepted | Live create/fire/cancel, run linkage, failure, and reconnect evidence.          |
| Blueprints, sources, expert packs   | Implemented, not accepted | Full failure/progress acceptance with a disposable authenticated source.        |
| MCP servers                         | Partial                   | Prompt execution plus live disposable connection/failure/recovery acceptance.   |
| Hooks and policies                  | Implemented, not accepted | Live policy mutation/recovery and dense hook invocation audit.                  |
| Permissions                         | Implemented, not accepted | Live disposable rule mutation, precedence recovery, and complete audit history. |
| Memory                              | Partial                   | Summaries, context frames, retention, and operator actions.                     |
| Metrics and doctor                  | Implemented, not accepted | Dense data, remediation actions, refresh/failure, native acceptance.            |
| Plugins                             | Missing                   | Installed and available integrations with capability/source clarity.            |
| Appearance                          | Partial                   | Independent light/dark/system, wide-layout, and reduced-motion visual baselines.|
| Data and backups                    | Missing                   | Import/export/backup/retention/destructive reset.                               |
| About and updates                   | Partial                   | Licenses, updater state, native update flow, and failure evidence.              |

## A2UI and specialized interactive content

| Capability                             | Current state             | Remaining acceptance work                                                          |
| -------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Official A2UI lifecycle and validation | Implemented, not accepted | Record the coordinated producer branch SHA and complete the final security corpus. |
| Mermaid diagrams                       | Implemented, not accepted | Dense graph, keyboard/accessibility, invalid source evidence.                      |
| Code                                   | Implemented, not accepted | Large code and language coverage.                                                  |
| Tables                                 | Implemented, not accepted | Selection/action semantics and dense data.                                         |
| Scientific plots                       | Implemented, not accepted | Real NDP/SPOTTER data, zoom/inspection/export interaction.                         |
| Maps                                   | Implemented, not accepted | Dense geospatial layers, large-point behavior, and Tauri CSP/native validation.    |
| Action round trip                      | Implemented, not accepted | Client-local canvas/focus browser evidence and final paired branch SHAs.           |
| MCP Apps                               | Missing, separate path    | Sandboxed protocol implementation; never conflated with A2UI.                      |

## Native desktop and removal gates

| Capability                          | Current state             | Remaining acceptance work                                      |
| ----------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Typed Rust REST/SSE bridge          | Implemented, not accepted | Reconnect/sleep/wake and native binary/error acceptance.       |
| Supervisor and local discovery      | Partial                   | Full lifecycle evidence.                                       |
| Secure credentials                  | Missing                   | OS-backed storage and migration.                               |
| SSH/tunnels                         | Partial                   | Connection setup/auth UI and configured environment evidence.  |
| Menus, tray, updater, close cleanup | Partial                   | Native updater, close cleanup, and Windows/Linux acceptance.   |
| Old frontend and emulator removal   | Partial                   | Verify all removal ratchets only after replacement gates pass. |
| Exact paired repository SHAs        | Missing                   | Record after all mandatory gates; do not merge.                |

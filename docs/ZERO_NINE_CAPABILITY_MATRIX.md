# GACT TUI 0.9 Capability Matrix

Date: 2026-06-02

This matrix maps every decoded `CapabilityFlags` field to the intended TUI behavior. The Doctor capability tab renders the same support classes so users can distinguish backend support from TUI coverage.

Support classes:

- `full`: surfaced in the primary TUI or a drill-down view.
- `partial`: decoded and partially surfaced, but still tracked by a hardening issue.
- `gated`: decoded and intentionally disabled or hidden unless a backend/workflow makes it actionable.
- `none`: decoded but not user-surfaced in the current TUI.

| Capability | Backend field | TUI support | 0.9 status |
| --- | --- | --- | --- |
| Workspaces | `workspaces` | full | Workspace label and workspace-aware requests are surfaced. |
| Sessions | `sessions` | full | Session list, attach, create, messages, and SSE updates are surfaced. |
| Subagents | `subagents` | full | Nanoagent/subsession traces and child-session relationships are surfaced. |
| MCP | `mcp` | full | MCP catalog, detail, install/remove/call evidence are surfaced. |
| LSP | `lsp` | none | Not a CLIO 0.9 TUI workflow. Keep decoded but unsurfaced. |
| Files | `files` | full | File picker/viewer and context attachment are surfaced; tree/fuzzy polish remains tracked outside the capability gate. |
| Diffs | `diffs` | full | Diff list, detail, and actions are surfaced. |
| Permissions | `permissions` | full | Permission banners, actions, audit, and policy detail are surfaced. |
| Providers | `providers` | full | Provider/model/configuration flows are surfaced. |
| Commands | `commands` | full | Slash command palette and command details are surfaced. |
| Voice | `voice` | gated | Decoded, but CLIO has no 0.9 voice workflow. |
| Scheduled sessions | `scheduled_sessions` | none | Decoded only. |
| Hooks | `hooks` | gated | CLI support exists, but TUI management is not a 0.9 CLIO path. |
| Session tasks | `session_tasks` | full | Task badges and task detail are surfaced. |
| Metrics | `metrics` | full | Metrics command/detail and related chips are surfaced. |
| Session branching | `session_branching` | gated | Decoded, no primary CLIO workflow. |
| Session sharing | `session_sharing` | none | Decoded only. |
| Session export | `session_export` | gated | Decoded, export UI is not a 0.9 CLIO path. |
| Session summary | `session_summary` | partial | `/compact` calls `POST /v1/sessions/{id}/summarize`; summary display UX and release visual proof remain tracked by 1.0 hardening. |
| Attachment upload | `attachments_upload` | partial | Capability is decoded; file picker/send attachment UX needs release proof against live CLIO. |
| Cost tracking | `cost_tracking` | full | Header/footer cost chips and detail rows are surfaced. |
| Thinking blocks | `thinking_blocks` | full | Thinking parts and detail views are surfaced. |
| Edit modes | `edit_modes` | gated | Decoded, no separate edit-mode switch. |
| Plan mode | `plan_mode` | gated | Decoded, no separate plan-mode switch. |
| Message search | `search_messages` | full | Palette query/message search is surfaced. |
| Agent write | `agent_write` | full | Create, clone, edit/update, delete, and protected built-in behavior are surfaced. |
| Skills extraction | `skills_extraction` | full | Current-session extraction is surfaced from `/agents-list` and backed by CLIO `/v1/agents/extract`. |
| Agent routing | `agent_routing` | full | Routing decisions, expert handoffs, and route chains are surfaced. |
| Memory | `memory` | full | Memory chip, inspector, and context-frame details are surfaced. |
| Structured errors | `structured_errors` | full | Typed error parts and detail surfaces are surfaced. |
| Integration health | `integration_health` | full | Doctor health tab and integration rows are surfaced. |
| Tool telemetry | `tool_telemetry` | full | Tool cache/duration evidence and detail rows are surfaced. |
| CLIO cancellation | `x_clio_cancellation` | gated | Capability is visible in Doctor. TUI uses existing session/request cancel surfaces when a request is active; no standalone 0.9 management workflow is required. |
| CLIO executor cancellation | `x_clio_executor_cancellation` | gated | Capability is visible in Doctor. Executor cancellation is backend/runtime behavior surfaced through truthful request state and errors, not a separate catalog workflow. |
| CLIO text streaming | `x_clio_text_streaming` | full | Streaming state and fallback rendering are surfaced. |
| CLIO synthetic posthoc streaming | `x_clio_synthetic_posthoc_streaming` | full | Posthoc stream provenance/fallback is surfaced. |
| CLIO stream fallback reasons | `x_clio_stream_fallback_reasons` | full | Fallback reasons are decoded and shown in details. |
| CLIO direct delete permissions | `x_clio_direct_delete_permissions` | full | Direct permission delete policy is surfaced. |
| CLIO prompt registry | `x_clio_prompt_registry` | full | Browse, render preview, validate, save workspace/profile override, and reload result are surfaced. |
| CLIO expert packs | `x_clio_expert_packs` | full | Browse/detail/activate and validation metadata are surfaced for the current CLIO expert-pack API. |
| CLIO agent blueprints | `x_clio_agent_blueprints` | full | Browse, install, validate, activate per session, enable MCP descriptors, update/delete installed blueprints, and disabled destructive states for protected built-ins are surfaced. |
| CLIO user questions | `x_clio_user_questions` | full | Question SSE lifecycle and answer modal are surfaced. |
| CLIO retry attempts | `x_clio_retry_attempts` | full | Retry attempts and retry-with-model provenance are surfaced. |
| CLIO context frames | `x_clio_context_frames` | full | Frame list/detail fetch and memory-tool detail are surfaced. |
| CLIO semantic events | `x_clio_semantic_events` | full | Semantic execution events are reduced into live transcript evidence. |
| CLIO semantic trace backend | `x_clio_semantic_trace_backend` | full | Trace backend metadata is visible in Doctor. |
| CLIO semantic trace detail | `x_clio_semantic_trace_detail` | full | Trace detail metadata is visible in Doctor. |
| CLIO hook backend | `x_clio_hook_backend` | full | Hook backend metadata is visible in Doctor. |
| CLIO hook events | `x_clio_hook_events` | full | Hook event metadata is visible in Doctor. |
| CLIO context file content | `x_clio_files_content` | full | Context-file bytes are fetched from CLIO and rendered as text previews or binary-safe metadata in the detail view. The TUI also probes the endpoint when current CLIO exposes it but omits the vendor flag, surfacing real preview errors instead of hiding them behind a missing capability. |
| CLIO capability gaps | `x_clio_capability_gaps` | full | Doctor gaps tab and row detail are surfaced. |

Release rule: a new decoded capability cannot be added without assigning one of these support classes in `doctorCapabilityRows`; `TestDoctorCapabilityRowsCoverDecodedCapabilityFlags` enforces row coverage.

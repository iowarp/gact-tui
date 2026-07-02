package ui

// doctor_capability_rows.go defines capability row/bucket types and builds the capability row list.

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

type capBucket int

const (
	capCore capBucket = iota
	capExtra
	capV02
	capVendor
)

type capRow struct {
	name   string
	on     bool
	bucket capBucket
	ui     capUISupport
	notes  string
}

type capUISupport int

const (
	capUIFull capUISupport = iota
	capUIPartial
	capUIGated
	capUINotSurfaced
)

func doctorCapabilityRows(caps gact.Capabilities) []capRow {
	return []capRow{
		// Core surfaces (v0.1).
		{"workspaces", caps.Capabilities.Workspaces, capCore, capUIFull, "workspace switch and current workspace label"},
		{"sessions", caps.Capabilities.Sessions, capCore, capUIFull, "session list, create, attach, messages, SSE"},
		{"subagents", caps.Capabilities.Subagents, capCore, capUIFull, "subsessions/nanoagent traces and child sessions"},
		{"mcp", caps.Capabilities.MCP, capCore, capUIFull, "MCP catalog, detail, install/remove/call evidence, and POST /v1/mcp/servers/{id}/reconnect"},
		{"files", caps.Capabilities.Files, capCore, capUIFull, "file picker/viewer and context attachment"},
		{"diffs", caps.Capabilities.Diffs, capCore, capUIFull, "diff list/detail/actions"},
		{"permissions", caps.Capabilities.Permissions, capCore, capUIFull, "permission banner, actions, audit/policies"},
		{"providers", caps.Capabilities.Providers, capCore, capUIFull, "provider/model configuration modal"},
		{"commands", caps.Capabilities.Commands, capCore, capUIFull, "slash command palette and command detail"},
		{"metrics", caps.Capabilities.Metrics, capCore, capUIFull, "metrics command/detail"},
		// Useful but optional.
		{"session_branching", caps.Capabilities.SessionBranching, capExtra, capUIGated, "decoded and gated; no primary " + brandName() + " workflow"},
		{"session_export", caps.Capabilities.SessionExport, capExtra, capUIGated, "decoded and gated; export UI not a 1.0 " + brandName() + " path"},
		{"session_summary", caps.Capabilities.SessionSummary, capExtra, capUIFull, "/compact uses POST /v1/sessions/{id}/compact (focus key; legacy /summarize fallback), refreshes backend truth, renders selected-session summary, and surfaces errors"},
		{"attachments_upload", caps.Capabilities.AttachmentsUpload, capExtra, capUIFull, "file detail upload action POSTs /v1/sessions/{id}/attachments and merges returned context provenance"},
		{"multimodal_image_parts", caps.Capabilities.MultimodalImageParts, capExtra, capUIGated, "decoded and preserved by the message contract; terminal image attachment workflow remains gated behind file upload/provider support"},
		{"cost_tracking", caps.Capabilities.CostTracking, capExtra, capUIFull, "header/footer cost chips and detail rows"},
		{"thinking_blocks", caps.Capabilities.ThinkingBlocks, capExtra, capUIFull, "thinking part rendering and detail view"},
		{"edit_modes", caps.Capabilities.EditModes, capExtra, capUIGated, "decoded; no separate edit-mode switch"},
		{"plan_mode", caps.Capabilities.PlanMode, capExtra, capUIGated, "decoded; no separate plan-mode switch"},
		{"search_messages", caps.Capabilities.SearchMessages, capExtra, capUIFull, "palette query/message search"},
		{"session_tasks", caps.Capabilities.SessionTasks, capExtra, capUIFull, "task badges and task detail"},
		// v0.2 additions.
		{"agent_routing", caps.Capabilities.AgentRouting, capV02, capUIFull, "routing decisions, expert handoffs, route chains"},
		{"memory", caps.Capabilities.Memory, capV02, capUIFull, "memory chip, inspector, context frames"},
		{"structured_errors", caps.Capabilities.StructuredErrors, capV02, capUIFull, "typed error parts and detail surfaces"},
		{"integration_health", caps.Capabilities.IntegrationHealth, capV02, capUIFull, "doctor health tab and integration rows"},
		{"tool_telemetry", caps.Capabilities.ToolTelemetry, capV02, capUIFull, "tool cache/duration evidence"},
		// Vendor-specific (often unsupported).
		{"lsp", caps.Capabilities.LSP, capVendor, capUINotSurfaced, "not surfaced in current TUI"},
		{"voice", caps.Capabilities.Voice, capVendor, capUIGated, "voice command hook exists; no " + brandName() + " voice workflow"},
		{"scheduled_sessions", caps.Capabilities.ScheduledSessions, capVendor, capUINotSurfaced, "not surfaced in current TUI"},
		{"hooks", caps.Capabilities.Hooks, capVendor, capUIGated, "CLI support exists; TUI management not primary"},
		{"session_sharing", caps.Capabilities.SessionSharing, capVendor, capUINotSurfaced, "not surfaced in current TUI"},
		{"agent_write", caps.Capabilities.AgentWrite, capVendor, capUIFull, "create/clone/edit/delete surfaced with protected built-ins"},
		{"skills_extraction", caps.Capabilities.SkillsExtraction, capVendor, capUIFull, "current-session extraction surfaced from agents catalog"},
		{"x_clio_cancellation", caps.Capabilities.XClioCancellation != "" && caps.Capabilities.XClioCancellation != "none", capVendor, capUIPartial, "capability visible; Ctrl+X and /cancel post POST /v1/sessions/{id}/cancel when a session is active; #104 release proof remains required"},
		{"x_clio_executor_cancellation", caps.Capabilities.XClioExecutorCancellation, capVendor, capUIPartial, "capability visible; executor cancel is backend/runtime behavior surfaced through Ctrl+X, /cancel, truthful request state, and errors; #104 release proof remains required"},
		{"x_clio_text_streaming", caps.Capabilities.XClioTextStreaming != "" && caps.Capabilities.XClioTextStreaming != "none", capVendor, capUIFull, "streaming state and fallback rendering"},
		{"x_clio_synthetic_posthoc_streaming", caps.Capabilities.XClioSyntheticPosthocStreaming, capVendor, capUIFull, "posthoc stream provenance/fallback shown"},
		{"x_clio_stream_fallback_reasons", len(caps.Capabilities.XClioStreamFallbackReasons) > 0, capVendor, capUIFull, "fallback reasons decoded and shown in details"},
		{"x_clio_direct_delete_permissions", caps.Capabilities.XClioDirectDeletePermissions, capVendor, capUIFull, "direct permission delete policy surfaced"},
		{"x_clio_prompt_registry", caps.Capabilities.XClioPromptRegistry, capVendor, capUIFull, "browse/render/validate/save/reload profile overrides"},
		{"x_clio_expert_packs", caps.Capabilities.XClioExpertPacks, capVendor, capUIFull, "browse/detail/activate with validation metadata"},
		{"x_clio_agent_blueprints", caps.Capabilities.XClioAgentBlueprints, capVendor, capUIFull, "browse/install/validate/activate/update/delete/MCP enable"},
		{"x_clio_user_questions", caps.Capabilities.XClioUserQuestions, capVendor, capUIFull, "question SSE lifecycle and answer modal"},
		{"x_clio_retry_attempts", caps.Capabilities.XClioRetryAttempts, capVendor, capUIFull, "retry attempts and retry-with-model provenance"},
		{"x_clio_context_frames", caps.Capabilities.XClioContextFrames, capVendor, capUIFull, "frame list/detail fetch and memory tool detail"},
		{"x_clio_context_state", caps.Capabilities.XClioContextState, capVendor, capUIFull, "per-expert context usage view: segmented bar, memory inspector, footer indicator, and compact action"},
		{"x_clio_semantic_events", caps.Capabilities.XClioSemanticEvents, capVendor, capUIFull, "semantic.event and tool.call.* SSE frames reduce into live transcript evidence"},
		{"x_clio_semantic_trace_backend", caps.Capabilities.XClioSemanticTraceBackend != "", capVendor, capUIFull, "trace backend metadata visible"},
		{"x_clio_semantic_trace_detail", caps.Capabilities.XClioSemanticTraceDetail != "", capVendor, capUIFull, "trace detail metadata visible"},
		{"x_clio_hook_backend", caps.Capabilities.XClioHookBackend != "", capVendor, capUIFull, "hook backend metadata visible"},
		{"x_clio_hook_events", len(caps.Capabilities.XClioHookEvents) > 0, capVendor, capUIFull, "hook event metadata visible"},
		{"x_clio_files_content", caps.Capabilities.XClioFilesContent, capVendor, capUIFull, "GET /v1/sessions/{id}/context/files/content previews text, binary summaries, and truthful preview errors"},
		{"x_clio_capability_gaps", len(caps.Capabilities.XClioCapabilityGaps) > 0, capVendor, capUIFull, "doctor gaps tab and detail rows"},
	}
}

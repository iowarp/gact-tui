package ui

// doctor_capability_labels.go provides plain-text labels and meanings for capability rows.

import "strings"

func capUISupportPlainLabel(s capUISupport) string {
	switch s {
	case capUIFull:
		return "full"
	case capUIPartial:
		return "partial"
	case capUIGated:
		return "gated"
	case capUINotSurfaced:
		return "not surfaced"
	default:
		return "unknown"
	}
}

func capabilityDisplayName(name string) string {
	switch name {
	case "workspaces":
		return "Workspace switching"
	case "sessions":
		return "Session operations"
	case "subagents":
		return "Child agent sessions"
	case "mcp":
		return "MCP connections"
	case "files":
		return "Workspace files"
	case "diffs":
		return "Diff review"
	case "permissions":
		return "Permission review"
	case "providers":
		return "Model providers"
	case "commands":
		return "Slash commands"
	case "metrics":
		return "Metrics"
	case "session_branching":
		return "Session branching"
	case "session_export":
		return "Session export"
	case "session_summary":
		return "Session summaries"
	case "attachments_upload":
		return "Attachment upload"
	case "multimodal_image_parts":
		return "Image attachments"
	case "cost_tracking":
		return "Cost tracking"
	case "thinking_blocks":
		return "Thinking blocks"
	case "edit_modes":
		return "Edit modes"
	case "plan_mode":
		return "Plan mode"
	case "search_messages":
		return "Message search"
	case "session_tasks":
		return "Session tasks"
	case "agent_routing":
		return "Agent routing"
	case "memory":
		return "Memory and context"
	case "structured_errors":
		return "Structured errors"
	case "integration_health":
		return "Integration health"
	case "tool_telemetry":
		return "Tool telemetry"
	case "lsp":
		return "Language server support"
	case "voice":
		return "Voice workflows"
	case "scheduled_sessions":
		return "Scheduled sessions"
	case "hooks":
		return "Hooks"
	case "session_sharing":
		return "Session sharing"
	case "agent_write":
		return "User agent editing"
	case "skills_extraction":
		return "Skill extraction"
	case "x_clio_cancellation":
		return brandName()+" turn cancellation"
	case "x_clio_executor_cancellation":
		return "Executor cancellation"
	case "x_clio_text_streaming":
		return "Live text streaming"
	case "x_clio_synthetic_posthoc_streaming":
		return "Posthoc stream replay"
	case "x_clio_stream_fallback_reasons":
		return "Stream fallback reasons"
	case "x_clio_direct_delete_permissions":
		return "Direct permission delete"
	case "x_clio_prompt_registry":
		return "Prompt registry"
	case "x_clio_expert_packs":
		return "Expert packs"
	case "x_clio_agent_blueprints":
		return "Agent blueprints"
	case "x_clio_user_questions":
		return "User questions"
	case "x_clio_retry_attempts":
		return "Retry attempts"
	case "x_clio_context_frames":
		return "Context frames"
	case "x_clio_semantic_events":
		return "Live semantic events"
	case "x_clio_semantic_trace_backend":
		return "Semantic trace backend"
	case "x_clio_semantic_trace_detail":
		return "Semantic trace detail"
	case "x_clio_hook_backend":
		return "Hook backend"
	case "x_clio_hook_events":
		return "Hook events"
	case "x_clio_files_content":
		return "File content preview"
	case "x_clio_capability_gaps":
		return "Capability gaps"
	default:
		trimmed := strings.TrimPrefix(name, "x_clio_")
		trimmed = strings.ReplaceAll(trimmed, "_", " ")
		return strings.Title(trimmed)
	}
}

func capabilityStatusText(on bool) string {
	if on {
		return "supported"
	}
	return "missing"
}

func capBucketPlainLabel(b capBucket) string {
	switch b {
	case capCore:
		return "v0.1 core"
	case capExtra:
		return "v0.1 useful"
	case capV02:
		return "v0.2"
	case capVendor:
		return "vendor-specific"
	default:
		return "unknown"
	}
}

func capabilityMeaning(name string, bucket capBucket) string {
	switch name {
	case "integration_health":
		return "backend exposes per-subsystem health rows in /v1/health"
	case "memory":
		return "backend exposes ARC/context memory statistics through /v1/memory/stats"
	case "agent_routing":
		return "backend can surface routing decisions and multi-tier agent handoffs"
	case "tool_telemetry":
		return "tool results can include duration/cache telemetry"
	case "structured_errors":
		return "backend can return typed error_info payloads instead of plain text only"
	}
	switch bucket {
	case capCore:
		return "core GACT contract surface expected by the TUI"
	case capExtra:
		return "optional GACT surface that improves navigation or observability"
	case capV02:
		return "v0.2 GACT extension used for richer "+brandName()+" evidence"
	case capVendor:
		return "vendor-specific extension; absence is usually acceptable"
	default:
		return "capability flag reported by /v1/capabilities"
	}
}

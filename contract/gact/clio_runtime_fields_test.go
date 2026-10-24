package gact

import (
	"encoding/json"
	"testing"
)

func TestClioRuntimeCapabilityFlagsDecode(t *testing.T) {
	var caps Capabilities
	if err := json.Unmarshal([]byte(`{
		"capabilities": {
			"session_summary": true,
			"attachments_upload": true,
			"multimodal_image_parts": true,
			"x_clio_cancellation": "best_effort",
			"x_clio_executor_cancellation": true,
			"x_clio_text_streaming": "best_effort_live",
			"x_clio_stream_fallback_reasons": {"provider": {"reason": "batch"}},
			"x_clio_direct_delete_permissions": true,
			"x_clio_prompt_registry": true,
			"x_clio_agent_plugins": true,
			"x_clio_user_questions": true,
			"x_clio_retry_attempts": true,
			"x_clio_context_frames": true,
			"x_clio_semantic_events": true,
			"x_clio_semantic_trace_backend": "file",
			"x_clio_semantic_trace_detail": "semantic",
			"x_clio_hook_backend": "python",
			"x_clio_hook_events": {"semantic.event": {"status": "enabled"}},
			"x_clio_files_content": true,
			"x_clio_capability_gaps": {"memory": {"status": "partial"}}
		}
	}`), &caps); err != nil {
		t.Fatalf("decode capabilities: %v", err)
	}
	if caps.Capabilities.XClioCancellation != "best_effort" ||
		!caps.Capabilities.SessionSummary ||
		!caps.Capabilities.AttachmentsUpload ||
		!caps.Capabilities.MultimodalImageParts ||
		!caps.Capabilities.XClioAgentPlugins ||
		!caps.Capabilities.XClioSemanticEvents ||
		!caps.Capabilities.XClioFilesContent ||
		caps.Capabilities.XClioSemanticTraceBackend != "file" ||
		caps.Capabilities.XClioSemanticTraceDetail != "semantic" ||
		caps.Capabilities.XClioHookBackend != "python" ||
		len(caps.Capabilities.XClioHookEvents) != 1 ||
		len(caps.Capabilities.XClioStreamFallbackReasons) != 1 ||
		len(caps.Capabilities.XClioCapabilityGaps) != 1 {
		t.Fatalf("capabilities = %+v", caps.Capabilities)
	}
}

func TestClioAgentAndCommandRuntimeFieldsDecode(t *testing.T) {
	var agent AgentDef
	if err := json.Unmarshal([]byte(`{
		"id": "analysis",
		"title": "Analysis Expert",
		"source": "plugin",
		"parent_id": "main",
		"prompt_id": "clio.expert.analysis",
		"prompt_profile": "heavy",
		"default_provider": "openai",
		"default_model": "gpt-5",
		"skills": ["stats"],
		"commands": ["/analyze"],
		"capability_refs": [{"kind": "tool", "id": "session_search"}],
		"module": {"kind": "react", "max_iters": 6},
		"signature": {"inputs": {"question": "str"}, "outputs": {"answer": "str"}},
		"structured_outputs": {"answer": {"type": "str"}},
		"fanout": {"enabled": true, "max_children": 3},
		"enabled": false,
		"validation_errors": ["missing parent"]
	}`), &agent); err != nil {
		t.Fatalf("decode agent: %v", err)
	}
	if agent.ParentID != "main" || agent.PromptID == "" || agent.DefaultModel == nil || agent.DefaultModel.ModelID != "gpt-5" ||
		len(agent.Commands) != 1 || len(agent.CapabilityRefs) != 1 || len(agent.ValidationErrors) != 1 ||
		agent.Module["kind"] != "react" || len(agent.Signature) == 0 ||
		len(agent.StructuredOutputs) == 0 || agent.Fanout["enabled"] != true {
		t.Fatalf("agent = %+v", agent)
	}

	var cmd Command
	if err := json.Unmarshal([]byte(`{
		"id": "/analyze",
		"title": "Analyze",
		"invocation": "agent",
		"user_invocable": false,
		"agent_invocable": true,
		"planner_visible": true,
		"agent_id": "analysis",
		"command_source": "plugin",
		"command_scope": "plugin",
		"command_path": "/tmp/plugins/qc/ai.iowarp.clio/commands/analyze.md",
		"plugin": "qc",
		"argument_hint": "dataset"
	}`), &cmd); err != nil {
		t.Fatalf("decode command: %v", err)
	}
	if cmd.UserInvocable == nil || *cmd.UserInvocable ||
		cmd.AgentInvocable == nil || !*cmd.AgentInvocable ||
		cmd.PlannerVisible == nil || !*cmd.PlannerVisible ||
		cmd.CommandSource != "plugin" ||
		cmd.CommandScope != "plugin" ||
		cmd.CommandPath == "" ||
		cmd.Plugin != "qc" ||
		cmd.ArgumentHint != "dataset" {
		t.Fatalf("command = %+v", cmd)
	}
}

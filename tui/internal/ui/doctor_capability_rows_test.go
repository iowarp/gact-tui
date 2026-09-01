package ui

import (
	"reflect"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestDoctorCapabilityRowsCoverDecodedCapabilityFlags(t *testing.T) {
	rows := doctorCapabilityRows(gact.Capabilities{})
	seen := map[string]bool{}
	for _, row := range rows {
		if row.name == "" {
			t.Fatal("capability row has empty name")
		}
		if seen[row.name] {
			t.Fatalf("duplicate capability row %q", row.name)
		}
		seen[row.name] = true
	}
	typ := reflect.TypeOf(gact.CapabilityFlags{})
	for i := 0; i < typ.NumField(); i++ {
		tag := typ.Field(i).Tag.Get("json")
		name := strings.Split(tag, ",")[0]
		if name == "" || name == "-" {
			continue
		}
		if !seen[name] {
			t.Fatalf("decoded capability flag %q is missing from doctorCapabilityRows", name)
		}
	}
}

func TestDoctorCapabilityRowsExposeTUISupportStatus(t *testing.T) {
	rows := doctorCapabilityRows(gact.Capabilities{Capabilities: gact.CapabilityFlags{
		SessionSummary:                 true,
		AttachmentsUpload:              true,
		MultimodalImageParts:           true,
		AgentWrite:                     true,
		SkillsExtraction:               true,
		XClioPromptRegistry:            true,
		XClioExpertPacks:               true,
		XClioAgentBlueprints:           true,
		XClioUserQuestions:             true,
		XClioRetryAttempts:             true,
		XClioContextFrames:             true,
		XClioSemanticEvents:            true,
		XClioSemanticTraceBackend:      "file",
		XClioSemanticTraceDetail:       "semantic",
		XClioHookBackend:               "python",
		XClioHookEvents:                map[string]any{"semantic.event": map[string]any{"status": "enabled"}},
		XClioFilesContent:              true,
		XClioCapabilityGaps:            map[string]any{"agent_write": map[string]any{"status": "full"}},
		XClioSyntheticPosthocStreaming: true,
		XClioStreamFallbackReasons:     map[string]any{"provider": map[string]any{"reason": "batch"}},
	}})
	byName := map[string]capRow{}
	for _, row := range rows {
		byName[row.name] = row
	}
	for name, want := range map[string]capUISupport{
		"session_summary":                    capUIFull,
		"attachments_upload":                 capUIFull,
		"multimodal_image_parts":             capUIGated,
		"agent_write":                        capUIFull,
		"skills_extraction":                  capUIFull,
		"x_clio_prompt_registry":             capUIFull,
		"x_clio_expert_packs":                capUIFull,
		"x_clio_agent_blueprints":            capUIFull,
		"x_clio_user_questions":              capUIFull,
		"x_clio_retry_attempts":              capUIFull,
		"x_clio_context_frames":              capUIFull,
		"x_clio_semantic_events":             capUIFull,
		"x_clio_semantic_trace_backend":      capUIFull,
		"x_clio_semantic_trace_detail":       capUIFull,
		"x_clio_hook_backend":                capUIFull,
		"x_clio_hook_events":                 capUIFull,
		"x_clio_files_content":               capUIFull,
		"x_clio_capability_gaps":             capUIFull,
		"x_clio_synthetic_posthoc_streaming": capUIFull,
		"x_clio_stream_fallback_reasons":     capUIFull,
	} {
		if got := byName[name].ui; got != want {
			t.Fatalf("%s TUI support = %s, want %s", name, capUISupportPlainLabel(got), capUISupportPlainLabel(want))
		}
		if strings.TrimSpace(byName[name].notes) == "" {
			t.Fatalf("%s missing TUI support notes", name)
		}
	}
}

func TestDoctorCapabilitiesRenderOperatorSurfaceNames(t *testing.T) {
	out := stripANSI(renderDoctorCapabilities(gact.Capabilities{Capabilities: gact.CapabilityFlags{
		Workspaces:                   true,
		XClioSemanticEvents:          true,
		XClioAgentBlueprints:         true,
		XClioTextStreaming:           "live",
		XClioCapabilityGaps:          map[string]any{"agent_write": map[string]any{"status": "partial"}},
		XClioDirectDeletePermissions: true,
	}}, ThemeForMode(ModeDark), 96))
	for _, want := range []string{
		"Release readiness",
		"SURFACE",
		"SCOPE",
		"Workspace switching",
		"Live semantic events",
		"Agent blueprints",
		"Live text streaming",
		"Capability gaps",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("doctor capabilities missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{
		"CAPABILITY",
		"BUCKET",
		"x_clio_semantic_events",
		"x_clio_agent_blueprints",
		"x_clio_text_streaming",
		"x_clio_capability_gaps",
	} {
		if strings.Contains(out, notWant) {
			t.Fatalf("doctor capabilities should not expose raw list label %q:\n%s", notWant, out)
		}
	}
}

func TestDoctorCapabilityRowsNameCurrentCLIORoutes(t *testing.T) {
	rows := doctorCapabilityRows(gact.Capabilities{Capabilities: gact.CapabilityFlags{
		MCP:                  true,
		SessionSummary:       true,
		AttachmentsUpload:    true,
		MultimodalImageParts: true,
		XClioSemanticEvents:  true,
		XClioFilesContent:    true,
		XClioCancellation:    "request",
	}})
	byName := map[string]capRow{}
	for _, row := range rows {
		byName[row.name] = row
	}
	for name, wants := range map[string][]string{
		"mcp":                    {"POST /v1/mcp/servers/{id}/reconnect"},
		"session_summary":        {"POST /v1/sessions/{id}/compact", "focus"},
		"attachments_upload":     {"POST", "/v1/sessions/{id}/attachments"},
		"multimodal_image_parts": {"image", "provider"},
		"x_clio_cancellation":    {"Ctrl+X", "/cancel", "POST /v1/sessions/{id}/cancel", "#104"},
		"x_clio_semantic_events": {
			"semantic.event",
			"tool.call.*",
		},
		"x_clio_files_content": {"GET /v1/sessions/{id}/context/files/content"},
	} {
		row, ok := byName[name]
		if !ok {
			t.Fatalf("missing capability row %q", name)
		}
		for _, want := range wants {
			if !strings.Contains(row.notes, want) {
				t.Fatalf("%s notes missing %q: %q", name, want, row.notes)
			}
		}
	}
}

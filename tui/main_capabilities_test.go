package main

import (
	"reflect"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestCLI_Capabilities covers text and JSON capability output.
func TestCLI_Capabilities(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"capabilities")
	if code != 0 {
		t.Fatalf("capabilities: exit %d", code)
	}
	if !strings.Contains(stdout, "contract_version:") {
		t.Errorf("expected contract_version line: %q", stdout)
	}
	for _, want := range []string{
		"✓ workspaces",
		"✓ sessions",
		"✓ mcp",
		"✓ session_tasks",
		"✓ agent_routing",
		"✓ integration_health",
		"✓ tool_telemetry",
		"✓ x_clio_agent_blueprints",
		"✓ x_clio_files_content",
		"· x_clio_semantic_events",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in capabilities text: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"caps", "--format", "json")
	if code != 0 {
		t.Fatalf("caps json: exit %d", code)
	}
	if !strings.Contains(stdout, `"contract_version"`) || !strings.Contains(stdout, `"workspaces"`) {
		t.Errorf("expected JSON with contract_version + capabilities: %q", stdout)
	}
}

func TestCapabilitiesTextRowsCoverDecodedCapabilityFlags(t *testing.T) {
	rows := capabilityFlagTextRows(gact.CapabilityFlags{
		Workspaces:                     true,
		XClioTextStreaming:             "sse",
		XClioStreamFallbackReasons:     map[string]any{"provider": map[string]any{"reason": "batch"}},
		XClioSyntheticPosthocStreaming: true,
	})
	seen := map[string]bool{}
	enabled := map[string]bool{}
	for _, row := range rows {
		if row.name == "" {
			t.Fatal("capability text row has empty name")
		}
		if seen[row.name] {
			t.Fatalf("duplicate capability text row %q", row.name)
		}
		seen[row.name] = true
		enabled[row.name] = row.on
	}

	typ := reflect.TypeOf(gact.CapabilityFlags{})
	for i := 0; i < typ.NumField(); i++ {
		name := strings.Split(typ.Field(i).Tag.Get("json"), ",")[0]
		if name == "" || name == "-" {
			continue
		}
		if !seen[name] {
			t.Fatalf("decoded capability flag %q is missing from CLI capability text rows", name)
		}
	}
	for _, name := range []string{
		"workspaces",
		"x_clio_text_streaming",
		"x_clio_stream_fallback_reasons",
		"x_clio_synthetic_posthoc_streaming",
	} {
		if !enabled[name] {
			t.Fatalf("%s should be marked enabled in text rows", name)
		}
	}
}

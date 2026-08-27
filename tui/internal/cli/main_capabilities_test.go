package cli

import (
	"reflect"
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// TestCLI_Capabilities covers text and JSON capability output.
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

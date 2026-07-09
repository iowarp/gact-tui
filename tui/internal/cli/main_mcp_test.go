package cli

import (
	"strings"
	"testing"
	"time"
)

// TestCLI_McpResourceRead covers EEE1: read the seeded MCP resource
// at file:///docs/welcome.md and assert "demo content" lands on
// stdout.
func TestCLI_McpResourceRead(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "resource-read", "mcp_fake", "file:///docs/welcome.md")
	if code != 0 {
		t.Fatalf("mcp resource-read: exit %d", code)
	}
	if !strings.Contains(stdout, "demo content") {
		t.Errorf("expected 'demo content' in output: %q", stdout)
	}
}

// TestCLI_McpList covers JJJJ1: `gact mcp list` enumerates connected
// MCP servers; emulator's `default` scenario seeds one fake-mcp.
// Asserts both TSV header + row, and JSON encodes the seeded id.
func TestCLI_McpList(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "list")
	if code != 0 {
		t.Fatalf("mcp list: exit %d", code)
	}
	for _, want := range []string{
		"id\tname\tstatus\ttransport\tprotocol\tcaps\tlast_error",
		"mcp_fake\tfake-mcp\tready\t",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in TSV: %q", want, stdout)
		}
	}
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "list", "--format", "json")
	if code != 0 {
		t.Fatalf("mcp list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id": "mcp_fake"`) {
		t.Errorf("expected mcp_fake id in json: %q", stdout)
	}
	// Unknown format: exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "list", "--format", "yaml"); code != 2 {
		t.Errorf("mcp list --format yaml: want exit 2, got %d", code)
	}
}

// TestCLI_McpReconnect covers CCC2: POST reconnect for a known MCP
// server returns exit 0 and a missing one returns exit 1. MMM1
// extends this: assert the workspace SSE stream picks up the
// `notification` event the reconnect handler now emits.
func TestCLI_McpReconnect(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect mcp_fake: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "nope"); code == 0 {
		t.Fatalf("reconnect nope: expected non-zero exit")
	}

	// MMM1: start tailing in the background, fire the reconnect, and
	// verify the workspace stream surfaces a `notification` event.
	tailDone := make(chan string, 1)
	go func() {
		stdout, _, _ := runGactWithDuration(t, bin,
			map[string]string{"GACT_BACKEND": url},
			1500*time.Millisecond,
			"tail", "--workspace", "ws_default")
		tailDone <- stdout
	}()
	time.Sleep(300 * time.Millisecond) // let SSE stream attach
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "reconnect", "mcp_fake"); code != 0 {
		t.Fatalf("reconnect for notification: exit %d", code)
	}
	out := <-tailDone
	if !strings.Contains(out, `"notification"`) {
		t.Errorf("expected notification event in tail output: %q", out)
	}
	if !strings.Contains(out, "MCP server reconnected") {
		t.Errorf("expected notification title in tail output: %q", out)
	}
}

// TestCLI_McpDetail covers BBB1: list tools, resources, and prompts
// for the seeded `mcp_fake` server. Each verb must return at least
// one row (the emulator seeds them statically).
func TestCLI_McpDetail(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	for _, verb := range []string{"tools", "resources", "prompts"} {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"mcp", verb, "mcp_fake")
		if code != 0 {
			t.Fatalf("mcp %s: exit %d", verb, code)
		}
		if strings.TrimSpace(stdout) == "" {
			t.Errorf("expected at least one row for mcp %s, got empty", verb)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"mcp", "tools", "mcp_fake", "--format", "json")
	if code != 0 {
		t.Fatalf("mcp tools json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) {
		t.Errorf("expected JSON tool id field: %q", stdout)
	}
}

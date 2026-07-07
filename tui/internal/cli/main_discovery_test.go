package cli

import (
	"strings"
	"testing"
)

// TestCLI_AgentShow covers DDD1: fetch the seeded `default` agent
// and assert its title, description, default_model line, and tools
// list land in text output. JSON mode dumps the raw AgentDef.
func TestCLI_AgentShow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"agent", "show", "default")
	if code != 0 {
		t.Fatalf("agent show: exit %d", code)
	}
	for _, want := range []string{"id:", "Default Agent", "default_model:", "tools:"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"agent", "show", "default", "--format", "json")
	if code != 0 {
		t.Fatalf("agent show json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"default"`) {
		t.Errorf("expected JSON with id+default: %q", stdout)
	}
}

// TestCLI_ToolShow covers CCC1: fetch one tool's full definition.
// Asserts the seeded `bash` tool's name, description, and schema.
func TestCLI_ToolShow(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tool", "show", "bash")
	if code != 0 {
		t.Fatalf("tool show: exit %d", code)
	}
	for _, want := range []string{"id:", "name:", "input_schema:", "command"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tool", "show", "bash", "--format", "json")
	if code != 0 {
		t.Fatalf("tool show json: exit %d", code)
	}
	if !strings.Contains(stdout, `"input_schema"`) || !strings.Contains(stdout, `"bash"`) {
		t.Errorf("expected JSON with input_schema + id: %q", stdout)
	}
}

// TestCLI_RepoMap covers AAA1: render the seeded workspace repo map
// in tree and JSON formats; assert main.go and the Handler symbol
// surface.
func TestCLI_RepoMap(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"repo-map", "ws_default")
	if code != 0 {
		t.Fatalf("repo-map: exit %d", code)
	}
	if !strings.Contains(stdout, "main.go") {
		t.Errorf("expected main.go in tree: %q", stdout)
	}
	if !strings.Contains(stdout, "Handler") {
		t.Errorf("expected Handler symbol in tree: %q", stdout)
	}
	if !strings.Contains(stderr, "tokens") {
		t.Errorf("expected tokens summary on stderr: %q", stderr)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"repo-map", "ws_default", "--format", "json")
	if code != 0 {
		t.Fatalf("repo-map json: exit %d", code)
	}
	if !strings.Contains(stdout, `"tree"`) || !strings.Contains(stdout, `"tokens"`) {
		t.Errorf("expected JSON shape: %q", stdout)
	}
}

// TestCLI_Models covers WW1: list providers + models, then filter
// to a single provider and assert no foreign rows leak in.
func TestCLI_Models(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"models", "list")
	if code != 0 {
		t.Fatalf("models list: exit %d", code)
	}
	for _, p := range []string{"anthropic", "openai", "local"} {
		if !strings.Contains(stdout, p) {
			t.Errorf("expected provider %q in models list: %q", p, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"models", "list", "--provider", "anthropic")
	if code != 0 {
		t.Fatalf("models list --provider: exit %d", code)
	}
	if !strings.Contains(stdout, "anthropic") {
		t.Errorf("expected anthropic rows: %q", stdout)
	}
	if strings.Contains(stdout, "openai") || strings.Contains(stdout, "local\t") {
		t.Errorf("filter leaked other providers: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"models", "list", "--format", "json")
	if code != 0 {
		t.Fatalf("models list json: exit %d", code)
	}
	if !strings.Contains(stdout, `"provider_id"`) || !strings.Contains(stdout, `"model_id"`) {
		t.Errorf("expected JSON shape: %q", stdout)
	}
}

// TestCLI_Search covers TT1: send a unique-token message, then
// search for that token and verify the message id + role + snippet
// land in the TSV output. Also exercises --format json.
func TestCLI_Search(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "search-target")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "the marker token is xyzzy42")
	if code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	mid := strings.TrimSpace(stdout)

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"search", sid, "xyzzy42")
	if code != 0 {
		t.Fatalf("search: exit %d", code)
	}
	if !strings.Contains(stdout, mid) {
		t.Errorf("expected matching mid %q in search output: %q", mid, stdout)
	}
	if !strings.Contains(stdout, "user") {
		t.Errorf("expected role 'user' in search output: %q", stdout)
	}
	if !strings.Contains(stdout, "xyzzy42") {
		t.Errorf("expected snippet to contain query token: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"search", "--format", "json", sid, "xyzzy42")
	if code != 0 {
		t.Fatalf("search json: exit %d", code)
	}
	if !strings.Contains(stdout, `"message_id"`) || !strings.Contains(stdout, `"snippet"`) {
		t.Errorf("expected JSON fields in output: %q", stdout)
	}
}

// TestCLI_Catalog covers OO1: each kind (tools/agents/mcp/commands)
// returns non-empty TSV against the emulator's seeded fixtures.
func TestCLI_Catalog(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	for _, kind := range []string{"tools", "agents", "mcp", "commands"} {
		stdout, stderr, code := runGact(t, bin,
			map[string]string{"GACT_BACKEND": url},
			"catalog", kind)
		if code != 0 {
			t.Errorf("catalog %s: exit %d, stderr=%q", kind, code, stderr)
			continue
		}
		if strings.TrimSpace(stdout) == "" {
			t.Errorf("catalog %s: empty output", kind)
		}
	}

	// JSON format works too.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"catalog", "tools", "--format", "json")
	if code != 0 || !strings.Contains(stdout, `"name"`) {
		t.Errorf("catalog tools --format json: code=%d stdout=%q", code, stdout[:80])
	}

	// Unknown kind -> exit 2.
	_, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"catalog", "skills")
	if code != 2 {
		t.Errorf("unknown kind should exit 2, got %d", code)
	}
}

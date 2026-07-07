package cli

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestCLI_Env covers resolved config plus GACT_* environment output.
func TestCLI_Env(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, map[string]string{
		"GACT_BACKEND": "http://example:9999",
		"GACT_THEME":   "dracula",
	}, "env")
	if code != 0 {
		t.Fatalf("env: exit %d", code)
	}
	for _, want := range []string{
		"BACKEND_URL\thttp://example:9999",
		"THEME\tdracula",
		"CONFIG_PATH\t",
		"PLUGINS_DIR\t",
		"--- ENV ---",
		"GACT_BACKEND=http://example:9999",
		"GACT_THEME=dracula",
	} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in env output: %q", want, stdout)
		}
	}
}

// TestCLI_EnvJSON covers JSON output for resolved config and env snapshot.
func TestCLI_EnvJSON(t *testing.T) {
	bin := buildGact(t)
	stdout, _, code := runGact(t, bin, map[string]string{
		"GACT_BACKEND": "http://example:9999",
		"GACT_THEME":   "dracula",
	}, "env", "--format", "json")
	if code != 0 {
		t.Fatalf("env --format json: exit %d", code)
	}
	var out struct {
		BackendURL string            `json:"backend_url"`
		Theme      string            `json:"theme"`
		ConfigPath string            `json:"config_path"`
		PluginsDir string            `json:"plugins_dir"`
		Env        map[string]string `json:"env"`
	}
	if err := json.Unmarshal([]byte(stdout), &out); err != nil {
		t.Fatalf("parse: %v\n  raw=%q", err, stdout)
	}
	if out.BackendURL != "http://example:9999" {
		t.Errorf("backend_url = %q, want http://example:9999", out.BackendURL)
	}
	if out.Theme != "dracula" {
		t.Errorf("theme = %q, want dracula", out.Theme)
	}
	if out.PluginsDir == "" {
		t.Errorf("plugins_dir should not be empty")
	}
	if out.Env["GACT_BACKEND"] != "http://example:9999" {
		t.Errorf("env.GACT_BACKEND = %q, want http://example:9999", out.Env["GACT_BACKEND"])
	}
	if out.Env["GACT_THEME"] != "dracula" {
		t.Errorf("env.GACT_THEME = %q, want dracula", out.Env["GACT_THEME"])
	}
	if _, _, code := runGact(t, bin, nil, "env", "--format", "yaml"); code != 2 {
		t.Errorf("env --format yaml: want exit 2, got %d", code)
	}
}

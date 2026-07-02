package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestResolveCLIBackend_ConfigFileHonored is the regression test for #230:
// CLI subcommands resolved the backend with a nil config-file layer, so a
// backend_url set in config.json was silently ignored (only the interactive
// TUI honored it). With no env var and no explicit flag, the helper must
// return the config-file value.
func TestResolveCLIBackend_ConfigFileHonored(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"backend_url":"http://filehost:1234"}`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("GACT_CONFIG", cfgPath)
	t.Setenv("GACT_BACKEND", "")

	// Subcommands pass the parsed --backend flag, which defaults to
	// defaultBackend when the user did not supply it.
	if got := resolveCLIBackend(defaultBackend); got != "http://filehost:1234" {
		t.Fatalf("resolveCLIBackend(defaultBackend) = %q, want config-file value %q", got, "http://filehost:1234")
	}
}

// TestResolveCLIBackend_Precedence pins the file < env < flag ordering.
func TestResolveCLIBackend_Precedence(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"backend_url":"http://filehost:1234"}`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("GACT_CONFIG", cfgPath)

	t.Setenv("GACT_BACKEND", "http://envhost:2345")
	if got := resolveCLIBackend(defaultBackend); got != "http://envhost:2345" {
		t.Fatalf("env should beat file: got %q", got)
	}
	if got := resolveCLIBackend("http://flaghost:3456"); got != "http://flaghost:3456" {
		t.Fatalf("flag should beat env and file: got %q", got)
	}

	t.Setenv("GACT_BACKEND", "")
	t.Setenv("GACT_CONFIG", filepath.Join(dir, "missing.json"))
	if got := resolveCLIBackend(defaultBackend); got != defaultBackend {
		t.Fatalf("no file/env/flag should fall back to default: got %q", got)
	}
}

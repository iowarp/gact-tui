package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFromMissingFile(t *testing.T) {
	cfg, path, err := LoadFrom("/nonexistent/gact/config.json")
	if err != nil {
		t.Fatalf("missing should not error, got %v", err)
	}
	if cfg.BackendURL != nil || cfg.Theme != nil {
		t.Errorf("expected zero config, got %+v", cfg)
	}
	if !strings.HasSuffix(path, "config.json") {
		t.Errorf("path = %q", path)
	}
}

func TestLoadFromValidFile(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	if err := os.WriteFile(p,
		[]byte(`{"backend_url": "http://demo:8080", "theme": "light"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, _, err := LoadFrom(p)
	if err != nil {
		t.Fatalf("LoadFrom: %v", err)
	}
	if cfg.BackendURL == nil || *cfg.BackendURL != "http://demo:8080" {
		t.Errorf("backend_url = %v", cfg.BackendURL)
	}
	if cfg.Theme == nil || *cfg.Theme != "light" {
		t.Errorf("theme = %v", cfg.Theme)
	}
}

func TestLoadFromMalformedFile(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	_ = os.WriteFile(p, []byte("not json"), 0o644)
	_, _, err := LoadFrom(p)
	if err == nil {
		t.Errorf("expected parse error, got nil")
	}
}

func TestDefaultPathHonorsGactConfig(t *testing.T) {
	t.Setenv("GACT_CONFIG", "/explicit/path/x.json")
	got, err := DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	if got != "/explicit/path/x.json" {
		t.Errorf("path = %q", got)
	}
}

func TestDefaultPathHonorsXDG(t *testing.T) {
	t.Setenv("GACT_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", "/somewhere/x")
	got, _ := DefaultPath()
	want := filepath.Join("/somewhere/x", "gact", "config.json")
	if got != want {
		t.Errorf("path = %q", got)
	}
}

func TestDefaultPathFallsBackToHome(t *testing.T) {
	t.Setenv("GACT_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", "")
	got, err := DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(got, filepath.Join(".config", "gact", "config.json")) {
		t.Errorf("expected ~/.config/gact/config.json suffix, got %q", got)
	}
}

// TestSaveLoadRoundtrip covers N5: Save + Load preserve the
// collapse threshold across a write-then-read cycle so persisted
// user prefs survive restart.
func TestSaveLoadRoundtrip(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "subdir", "config.json")
	ct := 12
	original := Config{
		CollapseThreshold: &ct,
		SidebarLayout: &SidebarLayout{
			Left:  []string{"sessions", "future-tools", "context"},
			Right: []string{"memory"},
		},
	}
	if err := Save(original, p); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, _, err := LoadFrom(p)
	if err != nil {
		t.Fatalf("LoadFrom: %v", err)
	}
	if loaded.CollapseThreshold == nil || *loaded.CollapseThreshold != 12 {
		t.Errorf("round-trip lost threshold: got %v", loaded.CollapseThreshold)
	}
	if loaded.SidebarLayout == nil {
		t.Fatal("round-trip lost sidebar layout")
	}
	if got := strings.Join(loaded.SidebarLayout.Left, ","); got != "sessions,future-tools,context" {
		t.Errorf("left sidebar layout = %q", got)
	}
	if got := strings.Join(loaded.SidebarLayout.Right, ","); got != "memory" {
		t.Errorf("right sidebar layout = %q", got)
	}
}

func TestResolvePrecedence(t *testing.T) {
	str := func(s string) *string { return &s }

	// flag wins over env wins over file wins over fallback.
	cases := []struct {
		name string
		file *string
		env  string
		flag string
		fb   string
		want string
	}{
		{"all unset", nil, "", "", "default", "default"},
		{"flag only", nil, "", "set-flag", "default", "set-flag"},
		{"env only", nil, "set-env", "default", "default", "set-env"},
		{"file only", str("set-file"), "", "default", "default", "set-file"},
		{"env beats file", str("file"), "env", "default", "default", "env"},
		{"flag beats all", str("file"), "env", "flag", "default", "flag"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Resolve(c.file, c.env, c.flag, c.fb)
			if got != c.want {
				t.Errorf("Resolve(file=%v, env=%q, flag=%q, fb=%q) = %q, want %q",
					c.file, c.env, c.flag, c.fb, got, c.want)
			}
		})
	}
}
